#!/usr/bin/env python3
"""Calculate reporting frequencies using weighted mode algorithm.

Uses sg_reports VIEW (not documents table) to ensure consistency with the app:
- Only includes Secretary-General reports
- Filters to 2023+ (survey focus years)  
- Excludes CORR/REV documents
- Excludes credentials reports

This ensures frequency calculations match what users see in the UI.
"""

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
        years: List of publication years for a report group (may contain duplicates)
        
    Returns:
        Tuple of (frequency_label, gap_history)
        - frequency_label: 'annual', 'biennial', 'one-time', 'multiple-per-year', etc.
        - gap_history: List of year gaps (most recent first)
    """
    if len(years) < 2:
        return ("one-time", [])
    
    # Check for multiple reports per year pattern BEFORE deduplication
    year_counts = Counter(years)
    total_reports = len(years)
    unique_years = len(year_counts)
    
    # If we have significantly more reports than unique years, it's multiple per year
    # Use threshold: at least 3 reports AND average of 1.5+ reports per year
    if total_reports >= 3 and unique_years >= 2:
        avg_per_year = total_reports / unique_years
        # Count how many years have multiple reports
        years_with_multiple = sum(1 for count in year_counts.values() if count > 1)
        
        # If average is >= 1.5 reports/year AND at least 40% of years have multiples
        # OR if we consistently have 2+ reports per year (avg >= 2)
        if avg_per_year >= 2.0 or (avg_per_year >= 1.5 and years_with_multiple >= unique_years * 0.4):
            # Sort years descending for gap calculation (using unique years)
            sorted_years = sorted(set(years), reverse=True)
            gaps = [sorted_years[i] - sorted_years[i + 1] for i in range(len(sorted_years) - 1)] if len(sorted_years) > 1 else []
            return ("multiple-per-year", gaps)
    
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


def get_report_groups() -> list[tuple[str, str | None, list[int]]]:
    """
    Fetch all report groups with their publication years.
    
    Uses sg_reports VIEW (not documents table) to ensure consistency with the app:
    - Only includes Secretary-General reports
    - Filters to 2023+ (survey focus years)
    - Excludes CORR/REV documents
    - Excludes credentials reports
    
    Groups by (proper_title, normalized_body) to separate different UN bodies
    (GA, ECOSOC, etc.) that may have the same report title.
    
    For detecting "multiple-per-year" patterns, we count distinct SYMBOLS per year.
    Years with multiple distinct symbols will appear multiple times in the result.
    
    Returns:
        List of (proper_title, normalized_body, years) tuples - years appear once per distinct symbol
    """
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor() as cur:
            # Use sg_reports VIEW to match app filtering (2023+, SG reports only, no CORR/REV)
            # Count distinct symbols per year to detect multiple-per-year patterns
            # Each distinct symbol in a year adds that year once to the array
            cur.execute(f"""
                SELECT 
                    proper_title,
                    normalized_body,
                    array_agg(effective_year ORDER BY effective_year DESC) as years
                FROM (
                    SELECT DISTINCT
                        proper_title,
                        symbol,
                        -- Normalize body: extract first value from PostgreSQL array format
                        CASE 
                            WHEN un_body LIKE '{{%}}' THEN 
                                COALESCE(
                                    SUBSTRING(un_body FROM '^\\{{"?([^",}}]+)"?'),
                                    un_body
                                )
                            ELSE un_body
                        END as normalized_body,
                        COALESCE(
                            date_year,
                            CASE 
                                WHEN publication_date ~ '^\\d{{4}}' 
                                THEN SUBSTRING(publication_date FROM 1 FOR 4)::int 
                            END
                        ) as effective_year
                    FROM {DB_SCHEMA}.sg_reports
                    WHERE proper_title IS NOT NULL
                ) sub
                WHERE effective_year IS NOT NULL
                GROUP BY proper_title, normalized_body
            """)
            return [(row[0], row[1], [y for y in row[2] if y is not None]) for row in cur.fetchall()]
    finally:
        conn.close()


def create_frequencies_table():
    """Create the report_frequencies table if it doesn't exist.
    
    The table now uses a composite key of (proper_title, normalized_body)
    to separate different UN bodies that may have the same report title.
    """
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor() as cur:
            # Check if table exists with old schema (without normalized_body)
            cur.execute(f"""
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns 
                    WHERE table_schema = '{DB_SCHEMA}' 
                    AND table_name = 'report_frequencies'
                    AND column_name = 'normalized_body'
                )
            """)
            has_body_column = cur.fetchone()[0]
            
            if not has_body_column:
                # Drop old table and recreate with new schema
                print("Migrating report_frequencies table to include normalized_body...")
                cur.execute(f"DROP TABLE IF EXISTS {DB_SCHEMA}.report_frequencies")
            
            cur.execute(f"""
                CREATE TABLE IF NOT EXISTS {DB_SCHEMA}.report_frequencies (
                    proper_title TEXT NOT NULL,
                    normalized_body TEXT NOT NULL DEFAULT '',
                    calculated_frequency TEXT NOT NULL,
                    gap_history INT[],
                    year_count INT,
                    updated_at TIMESTAMPTZ DEFAULT NOW(),
                    PRIMARY KEY (proper_title, normalized_body)
                )
            """)
            conn.commit()
            print("Created/verified report_frequencies table")
    finally:
        conn.close()


def update_all_frequencies():
    """Fetch all report groups and update their calculated frequencies.
    
    Now groups by (proper_title, normalized_body) to calculate separate
    frequencies for different UN bodies with the same report title.
    """
    print("Fetching report groups...")
    report_groups = get_report_groups()
    print(f"Found {len(report_groups)} report groups")
    
    # Calculate frequencies
    results = []
    for proper_title, normalized_body, years in tqdm(report_groups, desc="Calculating frequencies"):
        frequency, gaps = calculate_frequency(years)
        results.append((proper_title, normalized_body, frequency, gaps if gaps else None, len(years)))
    
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
                    (proper_title, normalized_body, calculated_frequency, gap_history, year_count, updated_at)
                VALUES %s
                ON CONFLICT (proper_title, normalized_body) DO UPDATE SET
                    calculated_frequency = EXCLUDED.calculated_frequency,
                    gap_history = EXCLUDED.gap_history,
                    year_count = EXCLUDED.year_count,
                    updated_at = NOW()
                """,
                [(pt, nb or '', freq, gaps, yc) for pt, nb, freq, gaps, yc in results],
                template="(%s, %s, %s, %s, %s, NOW())",
                page_size=500
            )
            conn.commit()
        print(f"Updated frequencies for {len(results)} report groups")
    finally:
        conn.close()
    
    # Print summary stats
    freq_counts = Counter(r[2] for r in results)  # frequency is now at index 2
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
