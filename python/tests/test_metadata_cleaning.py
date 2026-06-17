"""
Basic unit tests for python/util/metadata_cleaning.py.

Run with:  uv run pytest python/tests/
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from util.metadata_cleaning import (
    clean_symbol,
    normalize_text,
    extract_year_from_symbol,
)


class TestCleanSymbol:
    def test_strips_leading_trailing_whitespace(self):
        result = clean_symbol("  A/79/1  ")
        assert result == "A/79/1"

    def test_returns_none_for_empty_string(self):
        result = clean_symbol("")
        assert result is None

    def test_returns_none_for_whitespace_only(self):
        result = clean_symbol("   ")
        assert result is None

    def test_returns_none_for_none_input(self):
        result = clean_symbol(None)  # type: ignore[arg-type]
        assert result is None

    def test_preserves_valid_symbol(self):
        result = clean_symbol("S/2024/123")
        assert result == "S/2024/123"


class TestNormalizeText:
    def test_strips_whitespace(self):
        result = normalize_text("  hello world  ")
        assert result == "hello world"

    def test_collapses_internal_whitespace(self):
        result = normalize_text("hello   world")
        assert result == "hello world"

    def test_returns_empty_string_for_none(self):
        result = normalize_text(None)  # type: ignore[arg-type]
        assert result == ""

    def test_handles_empty_string(self):
        result = normalize_text("")
        assert result == ""


class TestExtractYearFromSymbol:
    def test_extracts_year_from_sc_symbol_with_year(self):
        result = extract_year_from_symbol("S/2024/123")
        assert result == 2024

    def test_returns_none_for_invalid_symbol(self):
        result = extract_year_from_symbol("")
        assert result is None

    def test_returns_none_for_none_input(self):
        result = extract_year_from_symbol(None)  # type: ignore[arg-type]
        assert result is None
