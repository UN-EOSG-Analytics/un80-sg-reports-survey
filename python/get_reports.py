import ast
import os
import re

import pandas as pd
import psycopg2
from psycopg2.extras import Json
import requests
from dotenv import load_dotenv
from joblib import Memory
import pymupdf
from tqdm import tqdm

from util.metadata_cleaning import clean_metadata

memory = Memory(location=".cache", verbose=0)

load_dotenv()
AWS_API_URL = os.getenv("AWS_API_URL").rstrip("/")
DATABASE_URL = os.getenv("DATABASE_URL")
DB_SCHEMA = os.getenv("DB_SCHEMA", "sg_reports_survey")
assert os.getenv("AWS_API_URL") is not None
assert DATABASE_URL is not None, "DATABASE_URL must be set"


@memory.cache
def _search_document_symbols(
    query: str,
    tag: int = 191,
    skip: int | None = None,
    limit: int = 20,
) -> list | None:
    """
    UN Library `/dev/list` endpoint

    Perform a search query to the digitallibrary API

    Parameters:
    - query (str): Search pattern (e.g., "A/RES/*")
    - tag (int): Field ID to search (default: 191)
    - skip (int): Number of results to skip for pagination
    - limit (int): Number of results to return per page

    Returns: List of search results
    """
    assert query and query.strip(), "Invalid query parameter!"
    params = {"tag": tag, "query": query.strip(), "limit": limit, "skip": skip or 0}
    url = f"{AWS_API_URL}/dev/list"
    res = requests.get(url, params=params)
    res.raise_for_status()
    return res.json()


def get_reports_metadata(doc_type="Reports", tag="989__c", start_date=2024):
    all_results, skip, limit, old_streak = [], 0, 100, 0
    while True:
        batch = _search_document_symbols(
            query=f"'{doc_type}'", tag=tag, skip=skip, limit=limit
        )
        if not batch:
            break
        dates = sorted(set(d for r in batch if (d := (r.get("269__a") or [None])[0])))
        print(f"Dates in batch: {dates[0]} → {dates[-1]}" if dates else "  No dates")
        all_results.extend(batch)
        if len(batch) < limit:
            break
        if start_date:
            old_streak = old_streak + 1 if dates and dates[-1] < str(start_date) else 0
            if old_streak >= 3:
                print(f"Stopping: 3 consecutive batches with dates < {start_date}")
                break
        skip += limit
    return all_results


@memory.cache
def get_fulltext(symbol):
    language = "en"
    url = f"{AWS_API_URL}/dev/{language}/{symbol}"
    res = requests.get(url)
    res.raise_for_status()
    doc = pymupdf.open(stream=res.content, filetype="pdf")
    text = "\n\n---\n\n".join([p.get_text() for p in doc])
    return text


@memory.cache
def get_fulltext_or_none(symbol):
    try:
        return get_fulltext(symbol)
    except Exception:
        print(f"Could not retrieve PDF for {symbol}")
        return None


# =============================================================================
# RESOLUTION EXTRACTION FROM NOTES
# =============================================================================

def extract_resolution_refs_from_note(note: str) -> list[dict]:
    """
    Extract resolution references from a note field (MARC 500__a).
    
    Returns list of dicts with:
    - body: "General Assembly", "Security Council", etc.
    - resolution_num: "78/70"
    - inferred_symbol: "A/RES/78/70" (if we can infer it)
    """
    if not note:
        return []
    
    results = []
    
    # Pattern 1: "General Assembly resolution(s) 78/70" or "78/70 B" (with optional suffix)
    ga_match = re.search(r"General Assembly resolution[s]?\s+([\d/\s\w,and]+?)(?:\.|;|$)", note, re.IGNORECASE)
    if ga_match:
        res_text = ga_match.group(1)
        for m in re.finditer(r"(\d+/\d+)(?:\s*([A-Z]))?", res_text, re.IGNORECASE):
            num = m.group(1)
            suffix = f" {m.group(2).upper()}" if m.group(2) else ""
            results.append({
                "body": "General Assembly",
                "resolution_num": f"{num}{suffix}".strip(),
                "inferred_symbol": f"A/RES/{num}{suffix}".strip(),
            })
    
    # Pattern 2: "Security Council resolution(s) 2334 (2016)" 
    sc_match = re.search(r"Security Council resolution[s]?\s+([\d\s\(\),and]+?)(?:\.|;|$)", note, re.IGNORECASE)
    if sc_match:
        res_text = sc_match.group(1)
        for m in re.finditer(r"(\d+)\s*\((\d{4})\)", res_text):
            results.append({
                "body": "Security Council",
                "resolution_num": f"{m.group(1)} ({m.group(2)})",
                "inferred_symbol": f"S/RES/{m.group(1)} ({m.group(2)})",
            })
    
    # Pattern 3: "ECOSOC/Economic and Social Council resolution 2020/5"
    ecosoc_match = re.search(r"(?:ECOSOC|Economic and Social Council) resolution[s]?\s+([\d/\s,and]+?)(?:\.|;|$)", note, re.IGNORECASE)
    if ecosoc_match:
        res_text = ecosoc_match.group(1)
        for m in re.finditer(r"(\d+/\d+)", res_text):
            results.append({
                "body": "Economic and Social Council",
                "resolution_num": m.group(1),
                "inferred_symbol": f"E/RES/{m.group(1)}",
            })
    
    # Pattern 4: "Human Rights Council resolution 52/30"
    hrc_match = re.search(r"Human Rights Council resolution[s]?\s+([\d/\s,and]+?)(?:\.|;|$)", note, re.IGNORECASE)
    if hrc_match:
        res_text = hrc_match.group(1)
        for m in re.finditer(r"(\d+/\d+)", res_text):
            results.append({
                "body": "Human Rights Council",
                "resolution_num": m.group(1),
                "inferred_symbol": f"A/HRC/RES/{m.group(1)}",
            })
    
    return results


def extract_resolution_symbols_from_notes(notes: list[str] | str | None) -> list[str]:
    """
    Extract all resolution symbols from a list of notes.
    Returns deduplicated list of inferred resolution symbols.
    """
    if not notes:
        return []
    
    if isinstance(notes, str):
        notes = [notes]
    
    symbols = []
    for note in notes:
        refs = extract_resolution_refs_from_note(note)
        symbols.extend(ref["inferred_symbol"] for ref in refs)
    
    # Deduplicate while preserving order
    seen = set()
    return [s for s in symbols if not (s in seen or seen.add(s))]


def lookup_resolution(symbol: str) -> dict | None:
    """
    Look up a resolution in the UN Digital Library by exact symbol match.
    """
    try:
        results = _search_document_symbols(query=f"'{symbol}'", tag=191, limit=5)
        if results:
            for r in results:
                symbols = r.get("191__a") or []
                if symbol in symbols:
                    return r
            return results[0]
        return None
    except Exception as e:
        print(f"Error looking up resolution {symbol}: {e}")
        return None


def infer_document_category(symbol: str, resource_type_level3: list | None = None) -> str:
    """
    Infer the document category based on symbol prefix and resource type.
    """
    if not symbol:
        return "other"
    
    symbol_upper = symbol.upper()
    
    # Resolution patterns
    if any(symbol_upper.startswith(p) for p in ["A/RES/", "S/RES/", "E/RES/", "A/HRC/RES/"]):
        return "resolution"
    
    # Check resource_type_level3
    if resource_type_level3:
        rt3_str = " ".join(resource_type_level3).lower()
        if "resolution" in rt3_str:
            return "resolution"
        if "report" in rt3_str:
            return "report"
        if "letter" in rt3_str or "note verbale" in rt3_str:
            return "letter"
    
    return "report"  # Default to report


# =============================================================================
# DATABASE STORAGE
# =============================================================================

def store_documents_in_db(df: pd.DataFrame, document_category: str | None = None) -> int:
    """
    Store documents in the PostgreSQL database.
    
    Args:
        df: Cleaned DataFrame with document metadata (must include 'raw_json' column)
        document_category: Override category for all docs, or None to infer per-document
        
    Returns:
        Number of rows inserted/updated
    """
    # Columns to insert (must match SQL table)
    columns = [
        "record_number", "symbol", "symbol_split", "symbol_split_n",
        "document_category",
        "session_or_year", "date", "date_year", "publication_date",
        "proper_title", "title", "subtitle", "other_title", "uniform_title",
        "resource_type_level2", "resource_type_level3",
        "un_body", "corporate_name_level1", "corporate_name_level2", "conference_name",
        "subject_terms", "agenda_document_symbol", "agenda_item_number",
        "agenda_item_title", "agenda_subjects", "related_resource_identifier",
        "is_part", "symbol_without_prefix", "symbol_without_prefix_split",
        "symbol_without_prefix_split_n", "note", "based_on_resolution_symbols",
        "text", "raw_json"
    ]
    
    def convert_value(val, col_name):
        """Convert pandas values to PostgreSQL-compatible types."""
        if isinstance(val, dict):
            return Json(val)
        if hasattr(val, "tolist"):
            val = val.tolist()
        if isinstance(val, (list, tuple)):
            return list(val) if val else None
        if isinstance(val, str) and val.startswith("[") and val.endswith("]"):
            try:
                parsed = ast.literal_eval(val)
                if isinstance(parsed, list):
                    return parsed if parsed else None
            except (ValueError, SyntaxError):
                pass
        if pd.isna(val):
            return None
        if hasattr(val, "item"):
            return val.item()
        return val
    
    rows = []
    skipped = 0
    for _, row in df.iterrows():
        symbol = row.get("symbol")
        if pd.isna(symbol) or not symbol:
            skipped += 1
            continue
        
        # Infer or use provided document_category
        if document_category:
            cat = document_category
        else:
            rt3 = row.get("resource_type_level3")
            cat = infer_document_category(symbol, rt3 if isinstance(rt3, list) else None)
        
        row_values = []
        for col in columns:
            if col == "document_category":
                row_values.append(cat)
            elif col in row.index:
                row_values.append(convert_value(row[col], col))
            else:
                row_values.append(None)
        rows.append(tuple(row_values))
    
    if skipped:
        print(f"Skipped {skipped} rows with null symbol")
    
    # Deduplicate by symbol (keep last occurrence)
    seen_symbols = {}
    for i, row in enumerate(rows):
        symbol_idx = columns.index("symbol")
        seen_symbols[row[symbol_idx]] = i
    rows = [rows[i] for i in sorted(seen_symbols.values())]
    print(f"After deduplication: {len(rows)} unique documents")
    
    cols_str = ", ".join(columns)
    placeholders = ", ".join(["%s"] * len(columns))
    update_cols = [c for c in columns if c != "symbol"]
    update_str = ", ".join([f"{c} = EXCLUDED.{c}" for c in update_cols])
    
    query = f"""
        INSERT INTO {DB_SCHEMA}.reports ({cols_str})
        VALUES ({placeholders})
        ON CONFLICT (symbol) DO UPDATE SET
            {update_str},
            updated_at = NOW()
    """
    
    conn = psycopg2.connect(DATABASE_URL)
    try:
        from psycopg2.extras import execute_values
        with conn.cursor() as cur:
            # execute_values is MUCH faster than executemany for bulk inserts
            insert_query = f"""
                INSERT INTO {DB_SCHEMA}.reports ({cols_str})
                VALUES %s
                ON CONFLICT (symbol) DO UPDATE SET
                    {update_str},
                    updated_at = NOW()
            """
            # Insert in batches with progress
            batch_size = 100
            for i in tqdm(range(0, len(rows), batch_size), desc="Storing in DB"):
                batch = rows[i:i + batch_size]
                execute_values(cur, insert_query, batch, page_size=batch_size)
                conn.commit()
            count = len(rows)
        print(f"Successfully stored {count} documents in database")
        return count
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()


# Backwards compatibility alias
store_reports_in_db = store_documents_in_db


def fetch_and_store(doc_type: str, tag: str, start_date: int, fetch_text: bool = True):
    """Fetch reports of given type, clean, optionally fetch PDFs, and store in DB."""
    print(f"\n{'='*60}\nFetching: {doc_type} (tag: {tag})\n{'='*60}")
    raw_reports = get_reports_metadata(doc_type=doc_type, tag=tag, start_date=start_date)
    print(f"Fetched {len(raw_reports)} raw records")
    
    if not raw_reports:
        return 0
    
    df = pd.DataFrame(raw_reports)
    df["raw_json"] = raw_reports
    df = clean_metadata(df)
    print(f"After cleaning: {len(df)} reports")
    
    # Extract resolution symbols from notes
    df["based_on_resolution_symbols"] = df["note"].apply(
        lambda n: extract_resolution_symbols_from_notes(n) if n else None
    )
    
    if fetch_text:
        df["text"] = [get_fulltext_or_none(s) for s in tqdm(df["symbol"], desc="Fetching PDFs")]
    else:
        df["text"] = None
    
    store_documents_in_db(df)
    return len(df)


def fetch_and_store_resolutions(resolution_symbols: list[str], fetch_text: bool = True) -> int:
    """
    Fetch resolutions by their symbols and store in the database.
    
    Args:
        resolution_symbols: List of resolution symbols (e.g., ["A/RES/78/70", "S/RES/2334 (2016)"])
        fetch_text: Whether to fetch PDF text
        
    Returns:
        Number of resolutions stored
    """
    print(f"\n{'='*60}\nFetching {len(resolution_symbols)} resolutions\n{'='*60}")
    
    raw_resolutions = []
    for symbol in tqdm(resolution_symbols, desc="Looking up resolutions"):
        data = lookup_resolution(symbol)
        if data:
            raw_resolutions.append(data)
        else:
            print(f"  Could not find: {symbol}")
    
    print(f"Found {len(raw_resolutions)} resolutions in library")
    
    if not raw_resolutions:
        return 0
    
    df = pd.DataFrame(raw_resolutions)
    df["raw_json"] = raw_resolutions
    df = clean_metadata(df)
    
    if fetch_text:
        df["text"] = [get_fulltext_or_none(s) for s in tqdm(df["symbol"], desc="Fetching resolution PDFs")]
    else:
        df["text"] = None
    
    store_documents_in_db(df, document_category="resolution")
    return len(df)


def fetch_resolutions_for_stored_reports() -> int:
    """
    Fetch all resolutions referenced by reports already in the database.
    """
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT DISTINCT unnest(based_on_resolution_symbols) as symbol
                FROM {DB_SCHEMA}.reports
                WHERE based_on_resolution_symbols IS NOT NULL
                  AND array_length(based_on_resolution_symbols, 1) > 0
            """)
            resolution_symbols = [row[0] for row in cur.fetchall()]
    finally:
        conn.close()
    
    if not resolution_symbols:
        print("No resolution symbols found in stored reports")
        return 0
    
    # Filter out resolutions we already have
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT symbol FROM {DB_SCHEMA}.reports
                WHERE symbol = ANY(%s)
            """, (resolution_symbols,))
            existing = {row[0] for row in cur.fetchall()}
    finally:
        conn.close()
    
    new_symbols = [s for s in resolution_symbols if s not in existing]
    print(f"Found {len(resolution_symbols)} resolution refs, {len(existing)} already stored, {len(new_symbols)} new")
    
    if not new_symbols:
        return 0
    
    return fetch_and_store_resolutions(new_symbols, fetch_text=True)


# Sources to fetch for comprehensive SG reports coverage
SOURCES = [
    # Approach 1: Classified as SG Reports
    ("Secretary-General's Reports", "989__c"),
    # Approach 2: General reports (will be filtered by title in SQL view)
    ("Reports", "989__b"),
    # Approach 3: Letters/notes (will be filtered by title in SQL view)
    ("Letters and Notes Verbales", "989__b"),
]


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--sg-only", action="store_true", help="Only fetch SG reports (989__c)")
    parser.add_argument("--no-text", action="store_true", help="Skip PDF text extraction")
    parser.add_argument("--start-year", type=int, default=2020)
    parser.add_argument("--fetch-resolutions", action="store_true", help="Also fetch referenced resolutions")
    args = parser.parse_args()
    
    fetch_text = not args.no_text
    counts = {}
    
    if args.sg_only:
        counts["SG Reports"] = fetch_and_store("Secretary-General's Reports", "989__c", args.start_year, fetch_text)
    else:
        for doc_type, tag in SOURCES:
            counts[doc_type] = fetch_and_store(doc_type, tag, args.start_year, fetch_text)
    
    if args.fetch_resolutions:
        counts["Resolutions"] = fetch_resolutions_for_stored_reports()
    
    print(f"\n{'='*60}\nSUMMARY\n{'='*60}")
    for src, cnt in counts.items():
        print(f"  {src}: {cnt} documents")
