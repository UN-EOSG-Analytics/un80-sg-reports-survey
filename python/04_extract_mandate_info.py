"""
Extract mandate information from resolution texts using LLM.

Extracts:
- Verbatim operative paragraph(s) that mandate the report
- AI summary of mandated report content (1 sentence)
- Explicit frequency (if stated)
- Implicit frequency (inferred from context)
"""

import json
import os
import time
import psycopg2
from dotenv import load_dotenv
from joblib import Memory
from openai import AzureOpenAI
from tqdm import tqdm

load_dotenv()

# Setup caching
memory = Memory(location=".cache/mandate_extraction", verbose=0)

# Database config
DATABASE_URL = os.getenv("DATABASE_URL")
DB_SCHEMA = os.getenv("DB_SCHEMA", "sg_reports_survey")

# Azure OpenAI config
client = AzureOpenAI(
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
    api_version=os.getenv("AZURE_OPENAI_API_VERSION"),
    api_key=os.getenv("AZURE_OPENAI_API_KEY"),
)

MODEL = "gpt-4o"  # Azure deployment name

SYSTEM_PROMPT = """You are an expert at analyzing UN resolutions to extract information about mandated reports.

Given a UN resolution text, extract information about any reports that are mandated/requested from the Secretary-General.

Return a JSON object with:
{
  "mandates": [
    {
      "verbatim_paragraph": "The exact operative paragraph text that mandates the report",
      "summary": "One sentence summary of what the report should contain/cover",
      "explicit_frequency": "annual|biennial|triennial|quadrennial|one-time|other|null (if explicitly stated)",
      "implicit_frequency": "annual|biennial|triennial|quadrennial|one-time|other|null (inferred from session numbers, dates, or patterns)",
      "frequency_reasoning": "Brief explanation of how frequency was determined"
    }
  ]
}

Guidelines:
- Look for operative paragraphs that "request", "invite", or "decide" that the Secretary-General submit a report
- If multiple reports are mandated, include each as a separate mandate
- For implicit frequency: look at session numbers (e.g., "79th and 81st sessions" = biennial), date patterns, or references to previous resolutions
- If no report is mandated, return {"mandates": []}
- Keep summaries concise (1 sentence)
- Include the FULL verbatim paragraph, not just a snippet"""


@memory.cache
def extract_mandate_info_llm(symbol: str, text: str) -> dict:
    """Extract mandate info from resolution text using LLM (cached)."""
    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Resolution {symbol}:\n\n{text[:50000]}"}
            ],
            response_format={"type": "json_object"},
            temperature=0,
            max_tokens=4000,
        )
        result = json.loads(response.choices[0].message.content)
        return {"symbol": symbol, "success": True, **result}
    except Exception as e:
        print(f"Error processing {symbol}: {e}")
        return {"symbol": symbol, "success": False, "error": str(e), "mandates": []}


def get_resolutions_to_process(year_min: int = 2024) -> list[tuple[str, str, str]]:
    """Get resolutions that need mandate extraction."""
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT symbol, proper_title, text
                FROM {DB_SCHEMA}.reports
                WHERE document_category = 'resolution'
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


def main(year_min: int = 2024, limit: int | None = None):
    """Main extraction pipeline."""
    print(f"Loading resolutions from {year_min}+...")
    resolutions = get_resolutions_to_process(year_min)
    
    if limit:
        resolutions = resolutions[:limit]
    
    print(f"Processing {len(resolutions)} resolutions...")
    
    # Process with tqdm progress bar
    results = []
    for symbol, title, text in tqdm(resolutions, desc="Extracting mandates"):
        result = extract_mandate_info_llm(symbol, text)
        results.append(result)
        # Small delay to avoid rate limiting (if not cached)
        time.sleep(0.1)
    
    # Summary stats
    successful = sum(1 for r in results if r.get("success"))
    total_mandates = sum(len(r.get("mandates", [])) for r in results)
    print(f"\nExtracted {total_mandates} mandates from {successful}/{len(results)} resolutions")
    
    # Store results
    store_mandate_results(results)
    
    # Print sample results
    print("\n" + "="*60 + "\nSample Results:\n" + "="*60)
    for result in results[:5]:
        if result.get("mandates"):
            print(f"\n{result['symbol']}:")
            for m in result["mandates"][:2]:
                print(f"  Summary: {m.get('summary', 'N/A')}")
                print(f"  Explicit freq: {m.get('explicit_frequency', 'N/A')}")
                print(f"  Implicit freq: {m.get('implicit_frequency', 'N/A')}")
    
    return results


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--year-min", type=int, default=2024, help="Minimum year to process")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of resolutions")
    args = parser.parse_args()
    
    main(year_min=args.year_min, limit=args.limit)
