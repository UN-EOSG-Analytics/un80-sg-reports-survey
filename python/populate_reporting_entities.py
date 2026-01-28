#!/usr/bin/env python3
"""
Populate reporting_entities table from dgacm_list.xlsx and dri.xlsx

This script:
1. Reads dgacm_list.xlsx to get symbol → entity mapping (direct match)
2. Reads dri.xlsx and uses fuzzy title matching to map DRI entities to symbols
3. Inserts/updates the reporting_entities table with both sources
"""

import os
import re
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from difflib import SequenceMatcher
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is required")

DB_SCHEMA = os.environ.get("DB_SCHEMA", "sg_reports_survey")


def normalize_title(t: str) -> str:
    """Normalize title for comparison."""
    if pd.isna(t) or not t:
        return ""
    # Remove brackets, quotes, extra whitespace
    t = re.sub(r'[\[\]"]', '', str(t))
    t = re.sub(r'\s+', ' ', t)
    return t.strip().lower()


def fuzzy_match_score(s1: str, s2: str) -> float:
    """Calculate fuzzy match score between two strings."""
    return SequenceMatcher(None, s1, s2).ratio()


def load_dgacm_list(filepath: str) -> pd.DataFrame:
    """Load and process dgacm_list.xlsx."""
    print(f"Loading {filepath}...")
    df = pd.read_excel(filepath)
    
    df = df[df["Official Symbol"].notna()].copy()
    df["Official Symbol"] = df["Official Symbol"].str.strip()
    df["Dept(Author)"] = df["Dept(Author)"].str.strip()
    
    print(f"  Loaded {len(df)} records with symbols")
    return df[["Official Symbol", "Dept(Author)"]].rename(columns={
        "Official Symbol": "symbol",
        "Dept(Author)": "entity"
    })


def load_dri(filepath: str) -> pd.DataFrame:
    """Load and process dri.xlsx, filtering to SG reports."""
    print(f"Loading {filepath}...")
    df = pd.read_excel(filepath)
    
    # Filter to SG reports only
    df = df[df["DOCUMENT TITLE"].fillna("").str.lower().str.contains("report of the secretary-general")].copy()
    
    # Clean up
    df["DOCUMENT TITLE"] = df["DOCUMENT TITLE"].fillna("")
    df["norm_title"] = df["DOCUMENT TITLE"].apply(normalize_title)
    df["ENTITY"] = df["ENTITY"].fillna("").str.strip()
    
    print(f"  Loaded {len(df)} SG-related records")
    return df


def load_db_reports(conn) -> pd.DataFrame:
    """Load reports from database with their full titles."""
    print("Loading reports from database...")
    
    query = f"""
        SELECT 
            symbol,
            COALESCE(
                regexp_replace(
                    COALESCE(raw_json->>'245__a', '') || ' ' || 
                    COALESCE((SELECT string_agg(elem::text, ' ') FROM jsonb_array_elements_text(raw_json->'245__b') as elem), ''),
                    '[\\"\\[\\]]', '', 'g'
                ),
                proper_title
            ) as full_title
        FROM {DB_SCHEMA}.reports
    """
    
    df = pd.read_sql(query, conn)
    df["norm_title"] = df["full_title"].apply(normalize_title)
    
    print(f"  Loaded {len(df)} reports from database")
    return df


def get_title_words(title: str) -> set:
    """Extract significant words from a title for pre-filtering."""
    # Remove common words
    stopwords = {'the', 'of', 'and', 'to', 'a', 'in', 'for', 'on', 'by', 'report', 
                 'secretary-general', 'secretarygeneral', 'general', 'united', 'nations'}
    words = set(title.split())
    return words - stopwords


def match_dri_to_db(dri_df: pd.DataFrame, db_df: pd.DataFrame, threshold: float = 0.8) -> dict:
    """
    Match DRI records to database records using fuzzy title matching.
    Uses pre-filtering for speed.
    Returns a dict of symbol -> entity mappings.
    """
    print(f"Matching DRI titles to database (threshold={threshold})...")
    
    # Build lookup from db_df with pre-computed word sets
    db_data = []
    for _, row in db_df.iterrows():
        words = get_title_words(row["norm_title"])
        db_data.append((row["symbol"], row["norm_title"], words))
    
    matches = {}
    matched_count = 0
    
    # Group DRI by normalized title and entity to avoid duplicate matching
    dri_grouped = dri_df.groupby("norm_title").agg({
        "ENTITY": "first"
    }).reset_index()
    
    total = len(dri_grouped)
    for i, row in dri_grouped.iterrows():
        if i % 500 == 0:
            print(f"  Progress: {i}/{total} ({100*i/total:.0f}%)")
        
        dri_title = row["norm_title"]
        dri_entity = row["ENTITY"]
        
        if not dri_title or not dri_entity:
            continue
        
        dri_words = get_title_words(dri_title)
        
        # Pre-filter: only consider candidates with at least 2 common significant words
        candidates = [(s, t) for s, t, w in db_data if len(dri_words & w) >= 2]
        
        if not candidates:
            # Fallback: check first 50 for very short titles
            candidates = [(s, t) for s, t, _ in db_data[:50]]
        
        # Find best match among candidates
        best_score = 0
        best_symbol = None
        
        for symbol, db_title in candidates:
            score = fuzzy_match_score(dri_title, db_title)
            if score > best_score:
                best_score = score
                best_symbol = symbol
        
        if best_score >= threshold and best_symbol:
            # Only update if this entity is "better" (not empty) or not already set
            if best_symbol not in matches or not matches[best_symbol]:
                matches[best_symbol] = dri_entity
                matched_count += 1
    
    print(f"  Matched {matched_count} DRI records to database symbols")
    return matches


def populate_table(conn, dgacm_df: pd.DataFrame, dri_matches: dict):
    """Populate the reporting_entities table."""
    print("Populating reporting_entities table...")
    
    cur = conn.cursor()
    
    # Clear existing data
    cur.execute(f"TRUNCATE TABLE {DB_SCHEMA}.reporting_entities")
    print("  Cleared existing data")
    
    # Collect all data
    all_data = {}
    
    # Add DGACM list data (higher priority)
    for _, row in dgacm_df.iterrows():
        symbol = row["symbol"]
        entity = row["entity"]
        if symbol and entity:
            if symbol not in all_data:
                all_data[symbol] = {"entity_manual": None, "entity_dri": None}
            all_data[symbol]["entity_manual"] = entity
    
    # Add DRI data
    for symbol, entity in dri_matches.items():
        if symbol not in all_data:
            all_data[symbol] = {"entity_manual": None, "entity_dri": None}
        all_data[symbol]["entity_dri"] = entity
    
    print(f"  Total unique symbols to insert: {len(all_data)}")
    
    # Prepare values for bulk insert
    values = [
        (symbol, data["entity_manual"], data["entity_dri"])
        for symbol, data in all_data.items()
    ]
    
    # Upsert using ON CONFLICT
    insert_query = f"""
        INSERT INTO {DB_SCHEMA}.reporting_entities (symbol, entity_manual, entity_dri, updated_at)
        VALUES %s
        ON CONFLICT (symbol) DO UPDATE SET
            entity_manual = COALESCE(EXCLUDED.entity_manual, {DB_SCHEMA}.reporting_entities.entity_manual),
            entity_dri = COALESCE(EXCLUDED.entity_dri, {DB_SCHEMA}.reporting_entities.entity_dri),
            updated_at = NOW()
    """
    
    execute_values(
        cur,
        insert_query,
        values,
        template="(%s, %s, %s, NOW())"
    )
    
    conn.commit()
    
    # Get stats
    cur.execute(f"""
        SELECT 
            COUNT(*) as total,
            COUNT(entity_manual) as with_manual,
            COUNT(entity_dri) as with_dri,
            COUNT(CASE WHEN entity_manual IS NOT NULL AND entity_dri IS NOT NULL THEN 1 END) as with_both
        FROM {DB_SCHEMA}.reporting_entities
    """)
    stats = cur.fetchone()
    
    print(f"  Done! Stats:")
    print(f"    Total records: {stats[0]}")
    print(f"    With manual entity: {stats[1]}")
    print(f"    With DRI entity: {stats[2]}")
    print(f"    With both sources: {stats[3]}")
    
    cur.close()


def main():
    """Main entry point."""
    print("=" * 60)
    print("Populating reporting_entities table")
    print("=" * 60)
    
    # File paths
    dgacm_path = "data/dgacm_list.xlsx"
    dri_path = "data/dri.xlsx"
    
    # Check files exist
    for path in [dgacm_path, dri_path]:
        if not os.path.exists(path):
            raise FileNotFoundError(f"Required file not found: {path}")
    
    # Connect to database
    print("\nConnecting to database...")
    conn = psycopg2.connect(DATABASE_URL)
    
    try:
        # Load data
        dgacm_df = load_dgacm_list(dgacm_path)
        dri_df = load_dri(dri_path)
        db_df = load_db_reports(conn)
        
        # Match DRI to database
        dri_matches = match_dri_to_db(dri_df, db_df, threshold=0.8)
        
        # Populate table
        populate_table(conn, dgacm_df, dri_matches)
        
        print("\n" + "=" * 60)
        print("Done!")
        print("=" * 60)
        
    finally:
        conn.close()


if __name__ == "__main__":
    main()
