"""Fetch per-day, per-language download counts from the UN Digital Library
tindstats endpoint and upsert them into
``sg_reports_survey.report_download_stats``.

The endpoint shape is a CSV, one column per (symbol, language) pair::

    Dates,A_77_772--S_2023_151-AR,A_77_772--S_2023_151-EN,...
    2023-03-08,0,1,...

* Column suffix ``-XX`` is the 2-letter language code (AR/DE/EN/ES/FR/RU/ZH).
* Prefix is one or more document symbols separated by ``--`` for compound
  records (one DL record covering several UN symbols, e.g. an ECOSOC
  document and its GA twin). Inside each symbol DL maps ``/`` and `` `` to
  ``_``, so ``A/78/6 (Sect. 3)/Add.7`` becomes ``A_78_6_(Sect._3)_Add.7``.

The job has two layers — together they reproduce the data set this repo
ships with end-to-end, using only the public DL endpoint:

1. **Direct fingerprint join.** Match every ``sg_reports.symbol`` against
   ``digitallibrary.documents.document_symbol`` on a normalised fingerprint
   (lowercase, alphanumerics only). This catches the ``/ADD.`` vs
   ``/Add.``, ``(PART I)`` vs ``(Part I)``, ``(SECT. 3)`` vs ``(Sect. 3)``
   variants in one shot.
2. **Header-based partner discovery.** While fetching each recid's CSV we
   parse the header for every symbol prefix it carries. Any prefix that
   fingerprints back to another ``sg_reports.symbol`` we don't yet have
   stats for is inserted as well — that covers compound records whose
   ECOSOC/SC twin is missing from our ``digitallibrary.documents``
   snapshot (e.g. ``S/2023/151`` whose physical PDF only appears under
   ``A/77/772``).

Run::

    uv run python python/07_fetch_download_stats.py

Idempotent: rerunning replaces ``downloads`` and bumps ``fetched_at`` for
existing ``(symbol, recid, date, lang)`` rows.
"""

import csv
import io
import os
import re
import threading
import time
from datetime import date

import psycopg2
import requests
from dotenv import load_dotenv
from psycopg2.extras import execute_values
from tqdm import tqdm

load_dotenv()  # shell env wins so an admin DATABASE_URL can override .env
DATABASE_URL = os.getenv("DATABASE_URL")
DB_SCHEMA = os.getenv("DB_SCHEMA", "sg_reports_survey")
DL_SCHEMA = "digitallibrary"
assert DATABASE_URL is not None, "DATABASE_URL must be set"

TINDSTATS_URL = "https://digitallibrary.un.org/tindstats/bibdoc_downloads_dl"
HTTP_TIMEOUT = 30
UPSERT_BATCH = 5000
# DL rate-limits to 40 req/min per IP. Use a sequential pacer with a small
# safety margin (1.7 s ≈ 35/min) and exponential back-off on 429.
REQUEST_INTERVAL_SECONDS = 1.7
MAX_RETRIES = 4


# ---------------------------------------------------------------------------
# Symbol fingerprinting
# ---------------------------------------------------------------------------

_NON_ALNUM_RE = re.compile(r"[^a-z0-9]")


def fingerprint(symbol: str) -> str:
    """Lowercase, alphanumerics only — used to bridge the casing / separator
    differences between our stored symbols, DL's ``document_symbol``, and the
    underscore-encoded symbols that appear in tindstats CSV headers."""
    return _NON_ALNUM_RE.sub("", symbol.lower())


# ---------------------------------------------------------------------------
# Phase 1: direct (symbol, recid) pairs from a fingerprint join
# ---------------------------------------------------------------------------

def load_symbol_recid_pairs(conn, skip_existing: bool = True) -> list[tuple[str, int]]:
    """Return ``(symbol, recid)`` for SG reports whose normalised symbol
    matches a row in ``digitallibrary.documents``."""
    sql = f"""
        WITH sgr AS (
          SELECT DISTINCT
            s.symbol,
            regexp_replace(lower(s.symbol), '[^a-z0-9]', '', 'g') AS fp
          FROM {DB_SCHEMA}.sg_reports s
        ),
        dlfp AS (
          SELECT
            dl.recid,
            regexp_replace(lower(dl.document_symbol), '[^a-z0-9]', '', 'g') AS fp
          FROM {DL_SCHEMA}.documents dl
          WHERE dl.deleted_at IS NULL
        )
        SELECT sgr.symbol, dlfp.recid
        FROM sgr
        JOIN dlfp ON dlfp.fp = sgr.fp
    """
    if skip_existing:
        sql += f"""
        WHERE NOT EXISTS (
          SELECT 1 FROM {DB_SCHEMA}.report_download_stats r
          WHERE r.symbol = sgr.symbol AND r.recid = dlfp.recid
        )
        """
    sql += " ORDER BY sgr.symbol"

    with conn.cursor() as cur:
        cur.execute(sql)
        return [(row[0], int(row[1])) for row in cur.fetchall()]


def load_sg_symbols_by_fp(conn) -> dict[str, list[str]]:
    """All sg_reports symbols indexed by their fingerprint, for partner
    discovery from CSV headers."""
    with conn.cursor() as cur:
        cur.execute(f"SELECT DISTINCT symbol FROM {DB_SCHEMA}.sg_reports")
        result: dict[str, list[str]] = {}
        for (sym,) in cur.fetchall():
            result.setdefault(fingerprint(sym), []).append(sym)
        return result


# ---------------------------------------------------------------------------
# Tindstats CSV fetch + parse
# ---------------------------------------------------------------------------

_LANG_SUFFIX_RE = re.compile(r"-([A-Z]{2})$")


def parse_tindstats_csv(text: str) -> tuple[list[tuple[date, str, int]], list[str]]:
    """Return ``(rows, prefixes)``.

    * ``rows`` is a list of ``(date, lang, downloads)`` tuples summed across
      all symbol prefixes on the record — for compound documents both
      symbols receive the same per-day total because the downloads are joint.
    * ``prefixes`` is the distinct list of symbol prefixes the header
      mentions (compound records reveal their twins here).
    """
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if len(rows) < 2:
        return [], []
    header = rows[0]
    if not header or header[0].strip() != "Dates":
        return [], []

    lang_for_col: list[str | None] = [None]
    prefixes: list[str] = []
    seen_prefixes: set[str] = set()
    for col in header[1:]:
        c = col.strip()
        m = _LANG_SUFFIX_RE.search(c)
        if not m:
            lang_for_col.append(None)
            continue
        lang_for_col.append(m.group(1))
        prefix_part = c[: -len(m.group(0))]
        # Compound records list every symbol joined by '--'.
        for raw_prefix in prefix_part.split("--"):
            if raw_prefix and raw_prefix not in seen_prefixes:
                seen_prefixes.add(raw_prefix)
                prefixes.append(raw_prefix)

    out: list[tuple[date, str, int]] = []
    for raw in rows[1:]:
        if not raw or not raw[0]:
            continue
        try:
            d = date.fromisoformat(raw[0].strip())
        except ValueError:
            continue
        # Sum per-language across all symbol columns. For compound records
        # both column groups carry identical numbers (DL writes the same
        # download count once per symbol-language pair) so summing would
        # double-count; we take the max instead, which is the per-day total
        # for the underlying physical document.
        per_lang: dict[str, int] = {}
        for i, value in enumerate(raw[1:], start=1):
            lang = lang_for_col[i] if i < len(lang_for_col) else None
            if lang is None:
                continue
            try:
                n = int(value)
            except (TypeError, ValueError):
                continue
            if n:
                per_lang[lang] = max(per_lang.get(lang, 0), n)
        out.extend((d, lang, n) for lang, n in per_lang.items())
    return out, prefixes


_last_request_at = 0.0
_rate_lock = threading.Lock()


def _paced_get(session: requests.Session, params: dict) -> requests.Response | None:
    """Rate-paced GET with exponential back-off on HTTP 429."""
    global _last_request_at
    backoff = 5.0
    for _attempt in range(MAX_RETRIES + 1):
        with _rate_lock:
            wait = REQUEST_INTERVAL_SECONDS - (time.monotonic() - _last_request_at)
            if wait > 0:
                time.sleep(wait)
            _last_request_at = time.monotonic()
        try:
            resp = session.get(TINDSTATS_URL, params=params, timeout=HTTP_TIMEOUT)
        except requests.RequestException:
            return None
        if resp.status_code == 429:
            time.sleep(backoff)
            backoff *= 2
            continue
        return resp
    return None


def fetch_one(recid: int, session: requests.Session) -> tuple[list[tuple[date, str, int]], list[str], str]:
    """Return ``(rows, prefixes, status)``. ``status`` is 'data', 'empty',
    or 'error'."""
    resp = _paced_get(session, {"recid": recid, "download": "csv"})
    if resp is None or resp.status_code != 200:
        return [], [], "error"
    body = resp.text.strip()
    if not body:
        return [], [], "empty"
    rows, prefixes = parse_tindstats_csv(body)
    if not rows:
        return [], prefixes, "empty"
    return rows, prefixes, "data"


# ---------------------------------------------------------------------------
# Upsert
# ---------------------------------------------------------------------------

def upsert_rows(conn, rows: list[tuple[str, int, date, str, int]]) -> None:
    if not rows:
        return
    sql = f"""
        INSERT INTO {DB_SCHEMA}.report_download_stats
            (symbol, recid, date, lang, downloads)
        VALUES %s
        ON CONFLICT (symbol, recid, date, lang) DO UPDATE SET
            downloads  = EXCLUDED.downloads,
            fetched_at = NOW()
    """
    with conn.cursor() as cur:
        for i in range(0, len(rows), UPSERT_BATCH):
            execute_values(cur, sql, rows[i : i + UPSERT_BATCH], page_size=UPSERT_BATCH)
        conn.commit()


# ---------------------------------------------------------------------------
# Main driver
# ---------------------------------------------------------------------------

def main() -> None:
    conn = psycopg2.connect(DATABASE_URL)
    try:
        sg_by_fp = load_sg_symbols_by_fp(conn)
        pairs = load_symbol_recid_pairs(conn)
        # De-duplicate by recid since the same recid may resolve from several
        # sg_reports symbols already via the fingerprint join; we'll redirect
        # the data to every relevant symbol via the CSV-header partners.
        recid_to_drive_symbols: dict[int, list[str]] = {}
        for sym, rid in pairs:
            recid_to_drive_symbols.setdefault(rid, []).append(sym)

        print(f"{len(pairs)} (symbol, recid) pairs · {len(recid_to_drive_symbols)} unique recids to fetch.")

        session = requests.Session()
        buffer: list[tuple[str, int, date, str, int]] = []

        fetched = empty = errors = 0
        partner_extra = 0

        with tqdm(total=len(recid_to_drive_symbols), desc="recids") as bar:
            for rid, drive_syms in recid_to_drive_symbols.items():
                rows, prefixes, status = fetch_one(rid, session)
                if status == "data":
                    fetched += 1
                elif status == "empty":
                    empty += 1
                else:
                    errors += 1

                # All sg_reports symbols whose fingerprint appears in the
                # header — drives + compound partners.
                symbols_for_recid: set[str] = set(drive_syms)
                for prefix in prefixes:
                    fp = fingerprint(prefix)
                    for sym in sg_by_fp.get(fp, []):
                        if sym not in symbols_for_recid:
                            symbols_for_recid.add(sym)
                            partner_extra += 1

                for sym in symbols_for_recid:
                    buffer.extend((sym, rid, d, lang, n) for d, lang, n in rows)

                if len(buffer) >= UPSERT_BATCH:
                    upsert_rows(conn, buffer)
                    buffer = []
                bar.update(1)

        if buffer:
            upsert_rows(conn, buffer)

        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT COUNT(*), COUNT(DISTINCT symbol)
                FROM {DB_SCHEMA}.report_download_stats
                """
            )
            total_rows, distinct_symbols = cur.fetchone()
            cur.execute(f"SELECT COUNT(DISTINCT symbol) FROM {DB_SCHEMA}.sg_reports")
            sg_total = cur.fetchone()[0]

        print()
        print(f"Fetch: data={fetched} empty={empty} errors={errors}")
        print(f"Partner symbols discovered from CSV headers: {partner_extra}")
        print(
            f"DB: total_rows={total_rows} symbols_with_stats={distinct_symbols} "
            f"sg_reports_total={sg_total} "
            f"coverage={distinct_symbols / sg_total:.1%}"
        )
    finally:
        conn.close()


if __name__ == "__main__":
    main()
