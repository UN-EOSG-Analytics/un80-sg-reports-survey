#!/usr/bin/env python3
"""Calculate reporting frequencies using weighted mode algorithm."""

import os
from collections import Counter

import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv
from tqdm import tqdm

load_dotenv(override=True)

DATABASE_URL = os.getenv("DATABASE_URL")
DB_SCHEMA = os.getenv("DB_SCHEMA", "sg_reports_survey")


def calculate_frequency(years: list[int]) -> tuple[str, list[int]]:
    """
    Calculate frequency using weighted mode of gaps.
    Recent gaps are weighted higher (3x, 2x, 1x...).
    
    Args:
        years: List of publication years for a report group
        
    Returns:
        Tuple of (frequency_label, gap_history)
        - frequency_label: 'annual', 'biennial', 'one-time', etc.
        - gap_history: List of year gaps (most recent first)
    """
    if len(years) < 2:
        return ("one-time", [])
    
    # Sort years descending (most recent first) and deduplicate
    sorted_years = sorted(set(years), reverse=True)
    
    if len(sorted_years) < 2:
        return ("one-time", [])
    
    # Calculate gaps between consecutive years
    gaps = [sorted_years[i] - sorted_years[i + 1] for i in range(len(sorted_years) - 1)]
    
    if not gaps:
        return ("one-time", [])
    
    # Filter out any zero or negative gaps (data quality issues)
    valid_gaps = [g for g in gaps if g > 0]
    if not valid_gaps:
        return ("one-time", gaps)
    
    # Weight recent gaps higher: most recent = 3x, then 2x, then 1x
    weighted_gaps = []
    for i, gap in enumerate(valid_gaps):
        weight = max(1, 3 - i)  # [3, 2, 1, 1, 1, ...]
        weighted_gaps.extend([gap] * weight)
    
    # Mode of weighted gaps
    mode_gap = Counter(weighted_gaps).most_common(1)[0][0]
    
    # Map gap to frequency label
    frequency = {
        1: "annual",
        2: "biennial",
        3: "triennial",
        4: "quadrennial",
        5: "quinquennial",
    }.get(mode_gap)
    
    if frequency is None:
        if mode_gap <= 10:
            frequency = f"every-{mode_gap}-years"
        else:
            frequency = "irregular"
    
    return (frequency, gaps)


def get_report_groups() -> list[tuple[str, list[int]]]:
    """
    Fetch all report groups with their publication years.
    Uses date_year if available, otherwise extracts year from publication_date.
    
    Returns:
        List of (proper_title, years) tuples
    """
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT 
                    proper_title,
                    array_agg(DISTINCT effective_year ORDER BY effective_year DESC) as years
                FROM (
                    SELECT 
                        proper_title,
                        COALESCE(
                            date_year,
                            CASE 
                                WHEN publication_date ~ '^\\d{{4}}' 
                                THEN SUBSTRING(publication_date FROM 1 FOR 4)::int 
                            END
                        ) as effective_year
                    FROM {DB_SCHEMA}.documents
                    WHERE proper_title IS NOT NULL
                ) sub
                WHERE effective_year IS NOT NULL
                GROUP BY proper_title
            """)
            return [(row[0], [y for y in row[1] if y is not None]) for row in cur.fetchall()]
    finally:
        conn.close()


def create_frequencies_table():
    """Create the report_frequencies table if it doesn't exist."""
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor() as cur:
            cur.execute(f"""
                CREATE TABLE IF NOT EXISTS {DB_SCHEMA}.report_frequencies (
                    proper_title TEXT PRIMARY KEY,
                    calculated_frequency TEXT NOT NULL,
                    gap_history INT[],
                    year_count INT,
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            conn.commit()
            print("Created/verified report_frequencies table")
    finally:
        conn.close()


def update_all_frequencies():
    """Fetch all report groups and update their calculated frequencies."""
    print("Fetching report groups...")
    report_groups = get_report_groups()
    print(f"Found {len(report_groups)} report groups")
    
    # Calculate frequencies
    results = []
    for proper_title, years in tqdm(report_groups, desc="Calculating frequencies"):
        frequency, gaps = calculate_frequency(years)
        results.append((proper_title, frequency, gaps if gaps else None, len(years)))
    
    # Store in database using batch insert
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor() as cur:
            # Batch upsert using execute_values for much better performance
            print("Storing frequencies in batch...")
            execute_values(
                cur,
                f"""
                INSERT INTO {DB_SCHEMA}.report_frequencies 
                    (proper_title, calculated_frequency, gap_history, year_count, updated_at)
                VALUES %s
                ON CONFLICT (proper_title) DO UPDATE SET
                    calculated_frequency = EXCLUDED.calculated_frequency,
                    gap_history = EXCLUDED.gap_history,
                    year_count = EXCLUDED.year_count,
                    updated_at = NOW()
                """,
                [(pt, freq, gaps, yc) for pt, freq, gaps, yc in results],
                template="(%s, %s, %s, %s, NOW())",
                page_size=500
            )
            conn.commit()
        print(f"Updated frequencies for {len(results)} report groups")
    finally:
        conn.close()
    
    # Print summary stats
    freq_counts = Counter(r[1] for r in results)
    print("\nFrequency Distribution:")
    for freq, count in sorted(freq_counts.items(), key=lambda x: -x[1]):
        print(f"  {freq}: {count}")
    
    return results


def main():
    """Main entry point."""
    create_frequencies_table()
    update_all_frequencies()


if __name__ == "__main__":
    main()
