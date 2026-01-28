#!/usr/bin/env python3
"""
Generate vector embeddings for reports using Azure OpenAI.

This script:
1. Fetches reports that don't have embeddings yet
2. Generates embeddings using text-embedding-3-large (1024 dimensions)
3. Stores embeddings in the reports table for similarity search

Usage:
    uv run python python/generate_embeddings.py
"""

import os
import asyncio
import backoff
import numpy as np
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv
from openai import AsyncAzureOpenAI, RateLimitError, APITimeoutError
from tqdm.asyncio import tqdm_asyncio
from typing import Literal
import aiolimiter

# Load environment variables
load_dotenv()

# Database config
DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is required")

DB_SCHEMA = os.environ.get("DB_SCHEMA", "sg_reports_survey")

# Azure OpenAI config
AZURE_OPENAI_ENDPOINT = os.environ.get("AZURE_OPENAI_ENDPOINT")
AZURE_OPENAI_API_KEY = os.environ.get("AZURE_OPENAI_API_KEY")
AZURE_OPENAI_API_VERSION = os.environ.get("AZURE_OPENAI_API_VERSION", "2025-03-01-preview")

if not AZURE_OPENAI_ENDPOINT or not AZURE_OPENAI_API_KEY:
    raise ValueError("AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY are required")

# Initialize async client
async_client = AsyncAzureOpenAI(
    azure_endpoint=AZURE_OPENAI_ENDPOINT,
    api_key=AZURE_OPENAI_API_KEY,
    api_version=AZURE_OPENAI_API_VERSION,
)

# Rate limiter: 100 requests per minute to be safe
rate_limiter = aiolimiter.AsyncLimiter(100, 60)

# Embedding config
EMBEDDING_MODEL = "text-embedding-3-large"
EMBEDDING_DIMENSIONS = 1024
BATCH_SIZE = 64  # Process 64 texts per API call


@backoff.on_exception(
    backoff.expo,
    (RateLimitError, APITimeoutError),
    max_tries=5,
    max_time=300,
    jitter=backoff.random_jitter,
)
async def embeddings_async(
    input_text: list[str],
    model: str = EMBEDDING_MODEL,
    encoding_format: Literal["float", "base64"] = "float",
    dimensions: int = EMBEDDING_DIMENSIONS,
):
    """
    Create embeddings using Azure OpenAI with async client.

    Args:
        input_text: List of texts to embed
        model: Embedding model to use
        encoding_format: Format for embeddings
        dimensions: Number of dimensions for the embedding

    Returns:
        tuple: (embeddings_data, usage)
    """
    async with rate_limiter:
        response = await async_client.embeddings.create(
            input=input_text,
            model=model,
            encoding_format=encoding_format,
            dimensions=dimensions,
        )
    return [item.embedding for item in response.data], response.usage


async def get_embeddings(texts: list[str]) -> np.ndarray:
    """Get embeddings for texts, batching for API."""
    batches = [texts[i : i + BATCH_SIZE] for i in range(0, len(texts), BATCH_SIZE)]
    tasks = [
        embeddings_async(
            input_text=batch,
            model=EMBEDDING_MODEL,
            encoding_format="float",
            dimensions=EMBEDDING_DIMENSIONS,
        )
        for batch in batches
    ]
    results = await tqdm_asyncio.gather(*tasks, desc="Getting embeddings")
    all_embeddings = []
    for embeddings_data, usage in results:
        all_embeddings.extend(embeddings_data)
    return np.array(all_embeddings)


def prepare_text_for_embedding(row: dict) -> str:
    """
    Prepare text for embedding from a report row.
    Combines title, subject terms, and full text (truncated).
    """
    parts = []
    
    # Add title
    if row.get("proper_title"):
        parts.append(f"Title: {row['proper_title']}")
    
    # Add symbol
    if row.get("symbol"):
        parts.append(f"Symbol: {row['symbol']}")
    
    # Add subject terms
    if row.get("subject_terms"):
        subjects = row["subject_terms"]
        if subjects:
            parts.append(f"Subjects: {', '.join(subjects)}")
    
    # Add full text (truncated to ~6000 chars to stay within token limits)
    if row.get("text"):
        text = row["text"][:6000]
        parts.append(f"Content: {text}")
    
    return "\n".join(parts)


def fetch_reports_without_embeddings(conn, limit: int = None) -> list[dict]:
    """Fetch reports that don't have embeddings yet."""
    print("Fetching reports without embeddings...")
    
    cur = conn.cursor()
    
    query = f"""
        SELECT id, symbol, proper_title, subject_terms, text
        FROM {DB_SCHEMA}.reports
        WHERE embedding IS NULL
        AND (proper_title IS NOT NULL OR text IS NOT NULL)
        ORDER BY id
    """
    if limit:
        query += f" LIMIT {limit}"
    
    cur.execute(query)
    columns = [desc[0] for desc in cur.description]
    rows = [dict(zip(columns, row)) for row in cur.fetchall()]
    
    cur.close()
    print(f"  Found {len(rows)} reports without embeddings")
    return rows


def update_embeddings(conn, updates: list[tuple[int, list[float]]]):
    """Update embeddings in the database."""
    print(f"Updating {len(updates)} embeddings in database...")
    
    cur = conn.cursor()
    
    # Update in batches
    batch_size = 100
    for i in range(0, len(updates), batch_size):
        batch = updates[i:i + batch_size]
        execute_values(
            cur,
            f"""
            UPDATE {DB_SCHEMA}.reports AS r
            SET embedding = v.embedding::vector, updated_at = NOW()
            FROM (VALUES %s) AS v(id, embedding)
            WHERE r.id = v.id
            """,
            [(id, f"[{','.join(map(str, emb))}]") for id, emb in batch],
            template="(%s, %s)"
        )
    
    conn.commit()
    cur.close()
    print("  Done updating embeddings")


async def main(limit: int = None, batch_process_size: int = 500):
    """Main entry point."""
    print("=" * 60)
    print("Generating embeddings for reports")
    print("=" * 60)
    print(f"Model: {EMBEDDING_MODEL}")
    print(f"Dimensions: {EMBEDDING_DIMENSIONS}")
    print(f"Batch size: {BATCH_SIZE}")
    
    # Connect to database
    print("\nConnecting to database...")
    conn = psycopg2.connect(DATABASE_URL)
    
    try:
        while True:
            # Fetch reports without embeddings
            reports = fetch_reports_without_embeddings(conn, limit=batch_process_size)
            
            if not reports:
                print("\nNo more reports to process!")
                break
            
            # Prepare texts
            print("\nPreparing texts for embedding...")
            texts = [prepare_text_for_embedding(r) for r in reports]
            ids = [r["id"] for r in reports]
            
            # Filter out empty texts
            valid_data = [(id, text) for id, text in zip(ids, texts) if text.strip()]
            if not valid_data:
                print("No valid texts to embed")
                break
            
            valid_ids, valid_texts = zip(*valid_data)
            print(f"  {len(valid_texts)} texts ready for embedding")
            
            # Generate embeddings
            print("\nGenerating embeddings...")
            embeddings = await get_embeddings(list(valid_texts))
            
            # Prepare updates
            updates = list(zip(valid_ids, embeddings.tolist()))
            
            # Update database
            update_embeddings(conn, updates)
            
            # If limit was set, only process one batch
            if limit:
                break
            
            print(f"\nProcessed {len(updates)} reports, checking for more...")
        
        # Print final stats
        cur = conn.cursor()
        cur.execute(f"""
            SELECT 
                COUNT(*) as total,
                COUNT(embedding) as with_embedding
            FROM {DB_SCHEMA}.reports
        """)
        stats = cur.fetchone()
        cur.close()
        
        print("\n" + "=" * 60)
        print("Final Stats:")
        print(f"  Total reports: {stats[0]}")
        print(f"  With embeddings: {stats[1]}")
        print(f"  Coverage: {100 * stats[1] / stats[0]:.1f}%")
        print("=" * 60)
        
    finally:
        conn.close()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Generate embeddings for reports")
    parser.add_argument("--limit", type=int, help="Limit number of reports to process (for testing)")
    parser.add_argument("--batch-size", type=int, default=500, help="Number of reports to process per database batch")
    args = parser.parse_args()
    
    asyncio.run(main(limit=args.limit, batch_process_size=args.batch_size))
