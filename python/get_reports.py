import ast
import os

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


def get_reports_metadata(doc_type = "Reports", start_date=2024):
    all_results, skip, limit, old_streak = [], 0, 100, 0
    while True:
        batch = _search_document_symbols(
            query=f"'{doc_type}'", tag="989__c", skip=skip, limit=limit
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


def store_reports_in_db(df: pd.DataFrame) -> int:
    """
    Store reports in the PostgreSQL database.
    
    Args:
        df: Cleaned DataFrame with report metadata (must include 'raw_json' column)
        
    Returns:
        Number of rows inserted/updated
    """
    # Columns to insert (must match SQL table)
    columns = [
        "record_number", "symbol", "symbol_split", "symbol_split_n",
        "session_or_year", "date", "date_year", "publication_date",
        "proper_title", "title", "subtitle", "other_title", "uniform_title",
        "resource_type_level2", "resource_type_level3",
        "un_body", "corporate_name_level1", "corporate_name_level2", "conference_name",
        "subject_terms", "agenda_document_symbol", "agenda_item_number",
        "agenda_item_title", "agenda_subjects", "related_resource_identifier",
        "is_part", "symbol_without_prefix", "symbol_without_prefix_split",
        "symbol_without_prefix_split_n", "note", "text", "raw_json"
    ]
    
    def convert_value(val, col_name):
        """Convert pandas values to PostgreSQL-compatible types."""
        # Handle dicts (for raw_json)
        if isinstance(val, dict):
            return Json(val)
        # Handle numpy arrays -> convert to Python list
        if hasattr(val, "tolist"):
            val = val.tolist()
        # Handle lists/tuples (before pd.isna which fails on arrays)
        if isinstance(val, (list, tuple)):
            return list(val) if val else None
        # Handle strings that are actually stringified lists like "['a', 'b']"
        if isinstance(val, str) and val.startswith("[") and val.endswith("]"):
            try:
                parsed = ast.literal_eval(val)
                if isinstance(parsed, list):
                    return parsed if parsed else None
            except (ValueError, SyntaxError):
                pass  # Not a valid list literal, treat as regular string
        # Now safe to check for scalar NA
        if pd.isna(val):
            return None
        if hasattr(val, "item"):  # numpy scalar
            return val.item()
        return val
    
    rows = []
    skipped = 0
    for _, row in df.iterrows():
        # Skip rows with null symbol (required field)
        symbol = row.get("symbol")
        if pd.isna(symbol) or not symbol:
            skipped += 1
            continue
        row_values = [
            convert_value(row[col], col) if col in row.index else None
            for col in columns
        ]
        rows.append(tuple(row_values))
    
    if skipped:
        print(f"Skipped {skipped} rows with null symbol")
    
    # Build the upsert query with placeholders
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
        with conn.cursor() as cur:
            # Use executemany for proper array handling
            cur.executemany(query, rows)
            count = len(rows)
        conn.commit()
        print(f"Successfully stored {count} reports in database")
        return count
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()


if __name__ == "__main__":
    # Fetch raw reports from API
    raw_reports = get_reports_metadata(doc_type="Secretary-General's Reports", start_date=2020)
    print(f"Fetched {len(raw_reports)} raw reports")
    
    # Create DataFrame with raw_json column (propagates through explode)
    df = pd.DataFrame(raw_reports)
    df["raw_json"] = raw_reports  # Each row gets its original dict
    
    # Clean metadata (explodes symbols, so raw_json stays with each row)
    df = clean_metadata(df)
    print(f"After cleaning: {len(df)} reports")
    
    # Fetch full text for each report
    df["text"] = [get_fulltext_or_none(symbol) for symbol in tqdm(df["symbol"], desc="Fetching PDFs")]
    
    # Store in database
    store_reports_in_db(df)
    
    print(df.head())
