#!/usr/bin/env python3
"""
Populate report_entity_suggestions table from dgacm_list.xlsx and dri.xlsx

This script:
1. Loads master entity list from systemchart.entities for validation
2. Reads dgacm_list.xlsx to get symbol → entity mapping, then maps to proper_title
3. Reads dri.xlsx and uses fuzzy title matching to map DRI entities to proper_titles
4. Inserts suggestions into report_entity_suggestions with source tracking
"""

import json
import os
import re
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from difflib import SequenceMatcher
from dotenv import load_dotenv

# Load environment variables
load_dotenv(override=True)

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


def load_valid_entities(conn) -> set:
    """Load the set of valid entities from systemchart.entities."""
    print("Loading valid entities from systemchart.entities...")
    cur = conn.cursor()
    cur.execute("SELECT entity FROM systemchart.entities")
    entities = {row[0] for row in cur.fetchall()}
    cur.close()
    print(f"  Loaded {len(entities)} valid entities")
    return entities


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
    """Load reports from database with symbols and proper_titles.
    
    Uses sg_reports view which handles: type filtering, proper_title required,
    CORR/REV exclusion, credentials exclusion.
    """
    print("Loading reports from database...")
    
    query = f"""
        SELECT 
            symbol,
            proper_title,
            COALESCE(
                regexp_replace(
                    COALESCE(raw_json->>'245__a', '') || ' ' || 
                    COALESCE((SELECT string_agg(elem::text, ' ') FROM jsonb_array_elements_text(raw_json->'245__b') as elem), ''),
                    '[\\"\\[\\]]', '', 'g'
                ),
                proper_title
            ) as full_title
        FROM {DB_SCHEMA}.sg_reports
    """
    
    df = pd.read_sql(query, conn)
    df["norm_title"] = df["full_title"].apply(normalize_title)
    
    print(f"  Loaded {len(df)} reports from database")
    return df


def get_title_words(title: str) -> set:
    """Extract significant words from a title for pre-filtering."""
    stopwords = {'the', 'of', 'and', 'to', 'a', 'in', 'for', 'on', 'by', 'report', 
                 'secretary-general', 'secretarygeneral', 'general', 'united', 'nations'}
    words = set(title.split())
    return words - stopwords


def map_dgacm_to_proper_titles(dgacm_df: pd.DataFrame, db_df: pd.DataFrame, valid_entities: set) -> list:
    """
    Map DGACM symbol → entity to proper_title → entity.
    Returns list of (proper_title, entity, match_details) tuples.
    """
    print("Mapping DGACM symbols to proper_titles...")
    
    # Build symbol → proper_title lookup
    symbol_to_proper_title = {}
    for _, row in db_df.iterrows():
        symbol = row["symbol"]
        proper_title = row["proper_title"]
        if symbol and proper_title:
            symbol_to_proper_title[symbol] = proper_title
    
    # Map DGACM entries
    suggestions = []
    matched = 0
    skipped_no_symbol = 0
    skipped_invalid_entity = 0
    
    # Group by proper_title to avoid duplicates
    proper_title_entities = {}
    
    for _, row in dgacm_df.iterrows():
        symbol = row["symbol"]
        entity = row["entity"]
        
        if not symbol or not entity:
            skipped_no_symbol += 1
            continue
        
        # Validate entity exists in master list
        if entity not in valid_entities:
            skipped_invalid_entity += 1
            continue
        
        proper_title = symbol_to_proper_title.get(symbol)
        if not proper_title:
            continue
        
        # Track entity for this proper_title
        if proper_title not in proper_title_entities:
            proper_title_entities[proper_title] = {}
        
        if entity not in proper_title_entities[proper_title]:
            proper_title_entities[proper_title][entity] = {
                "symbols_matched": [],
            }
        
        proper_title_entities[proper_title][entity]["symbols_matched"].append(symbol)
        matched += 1
    
    # Convert to suggestions list
    for proper_title, entities in proper_title_entities.items():
        for entity, details in entities.items():
            suggestions.append((
                proper_title,
                entity,
                json.dumps(details)
            ))
    
    print(f"  Matched {matched} DGACM records")
    print(f"  Skipped {skipped_no_symbol} with missing symbol/entity")
    print(f"  Skipped {skipped_invalid_entity} with invalid entity (not in systemchart.entities)")
    print(f"  Unique proper_title → entity suggestions: {len(suggestions)}")
    
    return suggestions


def match_dri_to_proper_titles(dri_df: pd.DataFrame, db_df: pd.DataFrame, 
                               valid_entities: set, threshold: float = 0.8) -> list:
    """
    Match DRI records to proper_titles using fuzzy title matching.
    Returns list of (proper_title, entity, confidence_score, match_details) tuples.
    """
    print(f"Matching DRI titles to database (threshold={threshold})...")
    
    # Build lookup from db_df with pre-computed word sets
    db_data = []
    for _, row in db_df.iterrows():
        words = get_title_words(row["norm_title"])
        db_data.append((row["proper_title"], row["norm_title"], words, row["symbol"]))
    
    # Group by proper_title to track best match per proper_title
    proper_title_matches = {}
    
    # Group DRI by normalized title and entity to avoid duplicate matching
    dri_grouped = dri_df.groupby("norm_title").agg({
        "ENTITY": "first",
        "DOCUMENT TITLE": "first"
    }).reset_index()
    
    total = len(dri_grouped)
    for i, row in dri_grouped.iterrows():
        if i % 500 == 0:
            print(f"  Progress: {i}/{total} ({100*i/total:.0f}%)")
        
        dri_title = row["norm_title"]
        dri_entity = row["ENTITY"]
        dri_original_title = row["DOCUMENT TITLE"]
        
        if not dri_title or not dri_entity:
            continue
        
        # Validate entity
        if dri_entity not in valid_entities:
            continue
        
        dri_words = get_title_words(dri_title)
        
        # Pre-filter: only consider candidates with at least 2 common significant words
        candidates = [(pt, t, s) for pt, t, w, s in db_data if len(dri_words & w) >= 2]
        
        if not candidates:
            # Fallback: check first 50 for very short titles
            candidates = [(pt, t, s) for pt, t, _, s in db_data[:50]]
        
        # Find best match among candidates
        best_score = 0
        best_proper_title = None
        best_symbol = None
        best_db_title = None
        
        for proper_title, db_title, symbol in candidates:
            score = fuzzy_match_score(dri_title, db_title)
            if score > best_score:
                best_score = score
                best_proper_title = proper_title
                best_symbol = symbol
                best_db_title = db_title
        
        if best_score >= threshold and best_proper_title:
            key = (best_proper_title, dri_entity)
            
            # Keep best match per (proper_title, entity) pair
            if key not in proper_title_matches or proper_title_matches[key]["score"] < best_score:
                proper_title_matches[key] = {
                    "score": best_score,
                    "dri_title": dri_original_title,
                    "matched_symbol": best_symbol,
                    "matched_db_title": best_db_title
                }
    
    # Convert to suggestions list
    suggestions = []
    for (proper_title, entity), match_info in proper_title_matches.items():
        suggestions.append((
            proper_title,
            entity,
            round(match_info["score"], 3),
            json.dumps({
                "dri_title": match_info["dri_title"],
                "matched_symbol": match_info["matched_symbol"],
                "fuzzy_score": round(match_info["score"], 3)
            })
        ))
    
    print(f"  Matched {len(suggestions)} DRI records to proper_titles")
    return suggestions


def populate_suggestions_table(conn, dgacm_suggestions: list, dri_suggestions: list):
    """Populate the report_entity_suggestions table."""
    print("Populating report_entity_suggestions table...")
    
    cur = conn.cursor()
    
    # Clear existing data
    cur.execute(f"TRUNCATE TABLE {DB_SCHEMA}.report_entity_suggestions")
    print("  Cleared existing data")
    
    # Insert DGACM suggestions (no confidence score - exact match)
    if dgacm_suggestions:
        dgacm_query = f"""
            INSERT INTO {DB_SCHEMA}.report_entity_suggestions 
                (proper_title, entity, source, confidence_score, match_details)
            VALUES %s
            ON CONFLICT (proper_title, entity, source) DO UPDATE SET
                match_details = EXCLUDED.match_details
        """
        
        dgacm_values = [
            (pt, entity, 'dgacm', None, match_details)
            for pt, entity, match_details in dgacm_suggestions
        ]
        
        execute_values(cur, dgacm_query, dgacm_values)
        print(f"  Inserted {len(dgacm_suggestions)} DGACM suggestions")
    
    # Insert DRI suggestions (with confidence score)
    if dri_suggestions:
        dri_query = f"""
            INSERT INTO {DB_SCHEMA}.report_entity_suggestions 
                (proper_title, entity, source, confidence_score, match_details)
            VALUES %s
            ON CONFLICT (proper_title, entity, source) DO UPDATE SET
                confidence_score = EXCLUDED.confidence_score,
                match_details = EXCLUDED.match_details
        """
        
        dri_values = [
            (pt, entity, 'dri', score, match_details)
            for pt, entity, score, match_details in dri_suggestions
        ]
        
        execute_values(cur, dri_query, dri_values)
        print(f"  Inserted {len(dri_suggestions)} DRI suggestions")
    
    conn.commit()
    
    # Get stats
    cur.execute(f"""
        SELECT 
            source,
            COUNT(*) as count,
            COUNT(DISTINCT proper_title) as unique_reports,
            COUNT(DISTINCT entity) as unique_entities,
            AVG(confidence_score) as avg_confidence
        FROM {DB_SCHEMA}.report_entity_suggestions
        GROUP BY source
        ORDER BY source
    """)
    stats = cur.fetchall()
    
    print(f"\n  Stats by source:")
    for row in stats:
        source, count, reports, entities, avg_conf = row
        conf_str = f", avg confidence: {avg_conf:.3f}" if avg_conf else ""
        print(f"    {source}: {count} suggestions, {reports} reports, {entities} entities{conf_str}")
    
    # Overall stats
    cur.execute(f"""
        SELECT 
            COUNT(DISTINCT proper_title) as total_reports,
            COUNT(DISTINCT entity) as total_entities,
            COUNT(*) as total_suggestions
        FROM {DB_SCHEMA}.report_entity_suggestions
    """)
    overall = cur.fetchone()
    print(f"\n  Overall: {overall[2]} suggestions for {overall[0]} reports from {overall[1]} entities")
    
    cur.close()


def main():
    """Main entry point."""
    print("=" * 60)
    print("Populating report_entity_suggestions table")
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
        # Load valid entities first
        valid_entities = load_valid_entities(conn)
        
        # Load data
        dgacm_df = load_dgacm_list(dgacm_path)
        dri_df = load_dri(dri_path)
        db_df = load_db_reports(conn)
        
        # Map DGACM to proper_titles
        dgacm_suggestions = map_dgacm_to_proper_titles(dgacm_df, db_df, valid_entities)
        
        # Match DRI to proper_titles
        dri_suggestions = match_dri_to_proper_titles(dri_df, db_df, valid_entities, threshold=0.8)
        
        # Populate table
        populate_suggestions_table(conn, dgacm_suggestions, dri_suggestions)
        
        print("\n" + "=" * 60)
        print("Done!")
        print("=" * 60)
        
    finally:
        conn.close()


if __name__ == "__main__":
    main()
