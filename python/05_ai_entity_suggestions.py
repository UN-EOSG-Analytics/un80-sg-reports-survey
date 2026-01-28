#!/usr/bin/env python3
"""AI-powered entity suggestions for SG reports using structured outputs."""

import asyncio
import json
import os
from enum import Enum
from pathlib import Path
from typing import Literal

import psycopg2
from dotenv import load_dotenv
from joblib import Memory
from pydantic import BaseModel
from tqdm.asyncio import tqdm_asyncio

from util.ai_client import (
    DEFAULT_MODEL,
    async_client,
    format_entities_for_prompt,
    load_secretariat_entities,
    rate_limit,
)

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
DB_SCHEMA = os.getenv("DB_SCHEMA", "sg_reports_survey")
cache = Memory(location=".cache/entity_suggestions", verbose=0)
SECRETARIAT_ENTITIES = load_secretariat_entities()

# Dynamic enum from loaded entities - enforces valid values in structured output
EntityCode = Enum("EntityCode", {code: code for code in SECRETARIAT_ENTITIES.keys()})


class EntitySuggestion(BaseModel):
    entity: EntityCode
    confidence: Literal["high", "medium", "low"]
    reasoning: str


class ClassificationResponse(BaseModel):
    suggestions: list[EntitySuggestion]


SYSTEM_PROMPT = """You are an expert at identifying which UN Secretariat entity is responsible for Secretary-General reports.

## Available Entities
{entities}

## Quick Reference
- **DMSPC**: Budget, financing, HR, admin
- **DPPA**: Political missions, country situations, peace
- **DPO**: Peacekeeping (MINUSCA, UNMISS, UNIFIL)
- **OHCHR**: Human rights, treaty bodies
- **DESA**: SDGs, development, statistics
- **ODA**: Disarmament, weapons
- **OLA**: International law, treaties, tribunals
- **OCHA**: Humanitarian response
- **SRSG-CAAC/SVC**: Children/sexual violence in conflict
- **OCT**: Counter-terrorism

Return the most likely entity (usually 1, rarely 2-3 if truly ambiguous)."""


def build_user_prompt(report: dict) -> str:
    parts = [
        f"Title: {report.get('proper_title', 'N/A')}",
        f"Symbol: {report.get('symbol', 'N/A')}",
        f"Body: {report.get('un_body', 'N/A')}",
        f"Year: {report.get('date_year', 'N/A')}",
    ]
    subjects = report.get("subject_terms")
    if subjects:
        parts.append(f"Subjects: {', '.join(subjects[:10]) if isinstance(subjects, list) else subjects}")
    text = report.get("text", "")
    if text:
        parts.append(f"\nContent:\n{' '.join(text.split()[:800])}")
    return "\n".join(parts)


async def classify_report_entity(report: dict) -> dict:
    """Classify a report using structured output."""
    proper_title = report.get("proper_title", "")
    symbol = report.get("symbol", "")

    cache_file = Path(cache.location) / f"{hash(f'{proper_title}:{symbol}') % 10000:04d}.json"
    if cache_file.exists():
        try:
            return json.load(open(cache_file))
        except Exception:
            pass

    try:
        async with rate_limit:
            response = await async_client.beta.chat.completions.parse(
                model=DEFAULT_MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT.format(entities=format_entities_for_prompt(SECRETARIAT_ENTITIES))},
                    {"role": "user", "content": build_user_prompt(report)},
                ],
                response_format=ClassificationResponse,
            )

        parsed = response.choices[0].message.parsed
        suggestions = [
            {"entity": s.entity.value, "confidence": s.confidence, "reasoning": s.reasoning}
            for s in (parsed.suggestions if parsed else [])
        ]
        result = {"proper_title": proper_title, "symbol": symbol, "success": True, "suggestions": suggestions}

    except Exception as e:
        print(f"Error classifying {symbol}: {e}")
        result = {"proper_title": proper_title, "symbol": symbol, "success": False, "error": str(e), "suggestions": []}

    # Cache
    try:
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        json.dump(result, open(cache_file, "w"))
    except Exception:
        pass

    return result


def get_reports_to_classify(limit: int | None = None, skip_existing: bool = True) -> list[dict]:
    """Get SG reports needing classification."""
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor() as cur:
            base = f"""
                SELECT DISTINCT ON (r.proper_title) r.proper_title, r.symbol, r.un_body, r.date_year,
                       r.subject_terms, LEFT(r.text, 10000) as text
                FROM {DB_SCHEMA}.sg_reports r
            """
            where = """
                WHERE r.proper_title IS NOT NULL AND r.text IS NOT NULL
                  AND LENGTH(r.text) >= 100
                  AND r.symbol NOT LIKE '%%/CORR.%%' AND r.symbol NOT LIKE '%%/REV.%%'
            """
            if skip_existing:
                base += f"LEFT JOIN {DB_SCHEMA}.report_entity_suggestions s ON r.proper_title = s.proper_title AND s.source = 'ai'"
                where += " AND s.id IS NULL"

            cur.execute(f"{base} {where} ORDER BY r.proper_title, r.date_year DESC NULLS LAST {f'LIMIT {limit}' if limit else ''}")
            return [dict(zip(["proper_title", "symbol", "un_body", "date_year", "subject_terms", "text"], row)) for row in cur.fetchall()]
    finally:
        conn.close()


def store_suggestions(results: list[dict]):
    """Store AI suggestions in database."""
    conn = psycopg2.connect(DATABASE_URL)
    conf_map = {"high": 0.9, "medium": 0.7, "low": 0.5}
    try:
        with conn.cursor() as cur:
            inserted = 0
            for r in results:
                if not r.get("success"):
                    continue
                for s in r.get("suggestions", []):
                    try:
                        cur.execute(f"""
                            INSERT INTO {DB_SCHEMA}.report_entity_suggestions (proper_title, entity, source, confidence_score, match_details)
                            VALUES (%s, %s, 'ai', %s, %s)
                            ON CONFLICT (proper_title, entity, source) DO UPDATE SET
                                confidence_score = EXCLUDED.confidence_score, match_details = EXCLUDED.match_details
                        """, (r["proper_title"], s["entity"], conf_map.get(s["confidence"], 0.7),
                              json.dumps({"confidence_level": s["confidence"], "reasoning": s["reasoning"], "symbol": r["symbol"]})))
                        inserted += 1
                    except Exception as e:
                        print(f"Insert error: {e}")
            conn.commit()
            print(f"Stored {inserted} AI suggestions")
    finally:
        conn.close()


async def main_async(limit: int | None = None, skip_existing: bool = True):
    print(f"AI Entity Classification | {len(SECRETARIAT_ENTITIES)} entities")
    reports = get_reports_to_classify(limit=limit, skip_existing=skip_existing)
    print(f"Processing {len(reports)} reports")

    if not reports:
        return []

    results = await tqdm_asyncio.gather(*[classify_report_entity(r) for r in reports], desc="Classifying")
    successful = sum(1 for r in results if r.get("success"))
    total_suggestions = sum(len(r.get("suggestions", [])) for r in results)
    print(f"Done: {successful}/{len(results)} classified, {total_suggestions} suggestions")

    store_suggestions(results)

    for r in results[:3]:
        if r.get("suggestions"):
            print(f"\n{r['proper_title'][:60]}...")
            for s in r["suggestions"]:
                print(f"  → {s['entity']} ({s['confidence']})")

    return results


def main(limit: int | None = None, skip_existing: bool = True):
    return asyncio.run(main_async(limit, skip_existing))


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--reprocess", action="store_true")
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    main(limit=args.limit, skip_existing=not args.reprocess)
