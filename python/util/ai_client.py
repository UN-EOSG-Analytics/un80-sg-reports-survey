"""Shared AI client utilities for Azure OpenAI with structured outputs."""

import os

import pandas as pd
from aiolimiter import AsyncLimiter
from dotenv import load_dotenv
from openai import AsyncAzureOpenAI, AzureOpenAI

load_dotenv(override=True)

DEFAULT_MODEL = "gpt-5"

# Chat completions API version (embeddings use different version in 03_generate_embeddings.py)
AZURE_OPENAI_API_VERSION = "2024-08-01-preview"

sync_client = AzureOpenAI(
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
    api_version=AZURE_OPENAI_API_VERSION,
    api_key=os.getenv("AZURE_OPENAI_API_KEY"),
)

async_client = AsyncAzureOpenAI(
    azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
    api_version=AZURE_OPENAI_API_VERSION,
    api_key=os.getenv("AZURE_OPENAI_API_KEY"),
)

# 1000 requests per minute
rate_limit = AsyncLimiter(max_rate=1000, time_period=60)


def load_secretariat_entities(csv_path: str = "data/secretariat.csv") -> dict[str, dict]:
    """Load Secretariat entities from CSV as {code: {name, description, category}}."""
    df = pd.read_csv(csv_path)
    df = df[df["un_principal_organ"] == "Secretariat"]
    return {
        row["entity"]: {
            "name": row.get("entity_long", ""),
            "description": row.get("entity_description", "") if pd.notna(row.get("entity_description")) else "",
            "category": row.get("category", "") if pd.notna(row.get("category")) else "",
        }
        for _, row in df.iterrows()
    }


def format_entities_for_prompt(entities: dict[str, dict]) -> str:
    """Format entities dict into markdown for AI prompt, grouped by category."""
    by_cat: dict[str, list[tuple[str, dict]]] = {}
    for code, info in entities.items():
        cat = info.get("category") or "Departments and Offices"
        by_cat.setdefault(cat, []).append((code, info))

    lines = []
    for cat, items in sorted(by_cat.items()):
        lines.append(f"\n## {cat}")
        for code, info in sorted(items):
            name, desc = info.get("name", ""), info.get("description", "")
            desc = (desc[:200] + "...") if len(desc) > 200 else desc
            lines.append(f"- **{code}** ({name}): {desc}" if desc else f"- **{code}** ({name})")
    return "\n".join(lines)
