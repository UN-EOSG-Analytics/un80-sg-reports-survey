#!/usr/bin/env python3
"""Extract mandate information from resolution texts using structured outputs."""

import asyncio
import json
import os
from typing import Literal

import psycopg2
from dotenv import load_dotenv
from joblib import Memory
from pydantic import BaseModel
from tqdm.asyncio import tqdm_asyncio

from util.ai_client import DEFAULT_MODEL, async_client, rate_limit

load_dotenv(override=True)

DATABASE_URL = os.getenv("DATABASE_URL")
DB_SCHEMA = os.getenv("DB_SCHEMA", "sg_reports_survey")
memory = Memory(location=".cache/mandate_extraction", verbose=0)


class Mandate(BaseModel):
    verbatim_paragraph: str
    summary: str
    explicit_frequency: Literal["annual", "biennial", "triennial", "quadrennial", "one-time", "other"] | None
    implicit_frequency: Literal["annual", "biennial", "triennial", "quadrennial", "one-time", "other"] | None
    frequency_reasoning: str


class MandateExtractionResponse(BaseModel):
    mandates: list[Mandate]


SYSTEM_PROMPT = """You are an expert at analyzing UN resolutions to extract information about mandated reports.

Given a UN resolution text, extract information about any reports that are mandated/requested from the Secretary-General.

Guidelines:
- Look for operative paragraphs that "request", "invite", or "decide", etc. that the Secretary-General submit a report
- If multiple reports are mandated, include each as a separate mandate
- For implicit frequency: look at session numbers (e.g., "79th and 81st sessions" = biennial), date patterns, or references to previous resolutions
- If no report is mandated, return an empty mandates list
- Keep summaries concise (1 sentence)
- Include the FULL verbatim paragraph, not just a snippet"""


@memory.cache
async def extract_mandate_info_async(resolution: tuple) -> dict:
    """Extract mandate info from resolution text using structured output (cached)."""
    symbol, title, text = resolution
    try:
        async with rate_limit:
            response = await async_client.beta.chat.completions.parse(
                model=DEFAULT_MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"Resolution {symbol}:\n\n{text[:50000]}"},
                ],
                response_format=MandateExtractionResponse,
            )
        parsed = response.choices[0].message.parsed
        mandates = [m.model_dump() for m in parsed.mandates] if parsed else []
        return {"symbol": symbol, "success": True, "mandates": mandates}
    except Exception as e:
        print(f"Error processing {symbol}: {e}")
        return {"symbol": symbol, "success": False, "error": str(e), "mandates": []}


def get_resolutions_to_process(year_min: int = 2024) -> list[tuple[str, str, str]]:
    """Get resolutions that need mandate extraction.
    
    Note: Identifies resolutions by resource_type_level3 array containing 'Resolutions'.
    """
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT symbol, proper_title, text
                FROM {DB_SCHEMA}.documents
                WHERE 'Resolutions' = ANY(resource_type_level3)
                  AND date_year >= %s
                  AND text IS NOT NULL
                  AND LENGTH(text) > 100
                ORDER BY date_year DESC, symbol
            """, (year_min,))
            return cur.fetchall()
    finally:
        conn.close()


def store_mandate_results(results: list[dict]):
    """Store extraction results in database."""
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor() as cur:
            # Create table if not exists
            cur.execute(f"""
                CREATE TABLE IF NOT EXISTS {DB_SCHEMA}.resolution_mandates (
                    id SERIAL PRIMARY KEY,
                    resolution_symbol TEXT NOT NULL,
                    verbatim_paragraph TEXT,
                    summary TEXT,
                    explicit_frequency TEXT,
                    implicit_frequency TEXT,
                    frequency_reasoning TEXT,
                    raw_response JSONB,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            """)
            
            # Create unique index if not exists
            cur.execute(f"""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_resolution_mandates_unique
                ON {DB_SCHEMA}.resolution_mandates (resolution_symbol, MD5(COALESCE(verbatim_paragraph, '')))
            """)
            
            # Insert results
            inserted = 0
            for result in results:
                if not result.get("success"):
                    continue
                for mandate in result.get("mandates", []):
                    try:
                        cur.execute(f"""
                            INSERT INTO {DB_SCHEMA}.resolution_mandates 
                            (resolution_symbol, verbatim_paragraph, summary, explicit_frequency, 
                             implicit_frequency, frequency_reasoning, raw_response)
                            VALUES (%s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (resolution_symbol, MD5(COALESCE(verbatim_paragraph, ''))) 
                            DO UPDATE SET
                                summary = EXCLUDED.summary,
                                explicit_frequency = EXCLUDED.explicit_frequency,
                                implicit_frequency = EXCLUDED.implicit_frequency,
                                frequency_reasoning = EXCLUDED.frequency_reasoning,
                                raw_response = EXCLUDED.raw_response
                        """, (
                            result["symbol"],
                            mandate.get("verbatim_paragraph"),
                            mandate.get("summary"),
                            mandate.get("explicit_frequency"),
                            mandate.get("implicit_frequency"),
                            mandate.get("frequency_reasoning"),
                            json.dumps(mandate),
                        ))
                        inserted += 1
                    except Exception as e:
                        print(f"Error inserting mandate for {result['symbol']}: {e}")
            conn.commit()
            print(f"Stored {inserted} mandates from {len(results)} resolutions")
    finally:
        conn.close()


async def main_async(year_min: int = 2024, limit: int | None = None):
    """Main async entry point."""
    print(f"Loading resolutions from {year_min}+...")
    resolutions = get_resolutions_to_process(year_min)
    
    if limit:
        resolutions = resolutions[:limit]
    
    print(f"Processing {len(resolutions)} resolutions...")
    
    results = await tqdm_asyncio.gather(
        *[extract_mandate_info_async(r) for r in resolutions],
        desc="Extracting mandates",
    )
    
    # Summary stats
    successful = sum(1 for r in results if r.get("success"))
    total_mandates = sum(len(r.get("mandates", [])) for r in results)
    print(f"\nExtracted {total_mandates} mandates from {successful}/{len(results)} resolutions")
    
    # Store results
    store_mandate_results(results)
    
    # Print sample results
    print("\n" + "=" * 60 + "\nSample Results:\n" + "=" * 60)
    for result in results[:5]:
        if result.get("mandates"):
            print(f"\n{result['symbol']}:")
            for m in result["mandates"][:2]:
                print(f"  Summary: {m.get('summary', 'N/A')}")
                print(f"  Explicit freq: {m.get('explicit_frequency', 'N/A')}")
                print(f"  Implicit freq: {m.get('implicit_frequency', 'N/A')}")
    
    return results


def main(year_min: int = 2024, limit: int | None = None):
    """Sync wrapper for main."""
    return asyncio.run(main_async(year_min=year_min, limit=limit))


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--year-min", type=int, default=2024, help="Minimum year to process")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of resolutions")
    args = parser.parse_args()
    main(year_min=args.year_min, limit=args.limit)
