import re
import warnings
from typing import List

import pandas as pd

# based on UN Library Codebook for MARC
MARC_COLUMN_MAPPING = {
    # Record identification
    "001": "record_number",
    # Document symbol and classification
    "191__a": "symbol",
    "191__b": "series_symbol",
    "191__c": "session_or_year",
    "981__a": "un_body",
    "191__9": "index_to_proceedings_heading",
    "089__b": "type_of_content_code",
    "091__a": "distribution_category",
    # Title information
    "630__a": "uniform_title",
    "245__a": "proper_title",
    "239__a": "title",
    "245__b": "subtitle",
    "249__a": "other_title",
    # Publication information
    "260__a": "place",
    "260__b": "publisher",
    "260__c": "year",
    "269__a": "publication_date",
    "992__a": "date",
    "300__a": "extent",
    # Notes and descriptions
    "500__a": "note",
    "515__a": "citation_reference",
    "520__a": "summary",
    "596__a": "administrative_note",
    # Names and subjects
    "710__a": "corporate_name_level1",
    "610__a": "corporate_name_level2",
    "611__a": "conference_name",
    "650__a": "subject_terms",
    # Resource classification
    "989__a": "resource_type_level1",
    "989__b": "resource_type_level2",
    "989__c": "resource_type_level3",
    # Agenda information
    "991__a": "agenda_document_symbol",
    "991__b": "agenda_item_number",
    "991__c": "agenda_item_title",
    "991__d": "agenda_subjects",
    # Related information
    "245__c": "responsibility",
    "993__a": "related_resource_identifier",
    "996__a": "vote_summary_and_meeting_number",
    # Misc
    "598__a": "random",  # FIXME: 100% missing
    "651__a": "geographic_headings",  # FIXME: 100% missing
}


# Check for duplicate values in MARC_COLUMN_MAPPING
def _check_unique_mapping(mapping):
    values = list(mapping.values())
    duplicates = set([v for v in values if values.count(v) > 1])
    if duplicates:
        raise ValueError(f"Duplicate values found in MARC_COLUMN_MAPPING: {duplicates}")


CUSTOM_RENAMES = {}


def custom_renames(
    df: pd.DataFrame, rename_dict: dict[str, str] = CUSTOM_RENAMES
) -> pd.DataFrame:
    """
    Apply custom column renames to DataFrame.

    Designed for use in method chains with .pipe().
    Only renames columns that exist in the DataFrame.

    Args:
        df: Input DataFrame
        rename_dict: Dictionary mapping current column names to new names

    Returns:
        DataFrame with renamed columns
    """
    valid_renames = {k: v for k, v in rename_dict.items() if k in df.columns}
    if not valid_renames:
        return df
    return df.rename(columns=valid_renames)


def rename_variables_df(df, rename_map=MARC_COLUMN_MAPPING):
    """
    Rename columns in the DataFrame according to rename_map and order them.

    - Renames columns based on the mapping (MARC field codes -> readable names)
    - Orders columns according to the sequence in rename_map
    - Appends any extra columns (not in mapping) at the end
    - Designed for use in method chains with .pipe()

    Args:
        df: Input DataFrame
        rename_map: Dictionary mapping original column names to new names

    Returns:
        DataFrame with renamed and reordered columns
    """
    if not isinstance(df, pd.DataFrame):
        raise TypeError("Input must be a pandas DataFrame.")

    _check_unique_mapping(MARC_COLUMN_MAPPING)

    # Only rename columns that exist in df
    valid_map = {k: v for k, v in rename_map.items() if k in df.columns}
    if not valid_map:
        return df.copy()

    # Rename columns
    df_renamed = df.rename(columns=valid_map)

    # Order columns: first by the order in rename_map (for renamed columns),
    # then any extra columns at the end
    renamed_cols_ordered = [v for k, v in rename_map.items() if k in valid_map]
    extra_cols_list = [
        col for col in df_renamed.columns if col not in renamed_cols_ordered
    ]
    df_renamed = df_renamed[renamed_cols_ordered + extra_cols_list]

    return df_renamed


# Schema decisions should be semantic, not purely data-driven.
ALWAYS_LIST: set[str] = {
    "subject_terms",
    "agenda_subjects",
    "agenda_item_title",  # can be many
    "agenda_item_number",  # can address multiple items
    "related_resource_identifier",
    "resource_type_level1",  # could be scalar
    "resource_type_level2",
    "resource_type_level3",
    "subtitle",  # reports can have multiple
}

ALWAYS_SCALAR: set[str] = {
    "record_number",
    "proper_title",
    "other_title",
    "title",
    "publication_date",
}

# These arrive as lists but you *expect* them to be scalar after dedupe
CANDIDATE_SCALAR_FROM_LIST: set[str] = {
    "uniform_title",
    "symbol",
    "date",
    "session_or_year",  # does turn scalar after dedupe
    "conference_name",
    "agenda_document_symbol",
    "note",
    "corporate_name_level1",
    "corporate_name_level2",
}


def _to_list(x, col: str | None = None):
    """
    Ensure value is always a list.

    - list       -> returned unchanged (dedupe happens later)
    - scalar     -> warn + wrap in list
    - NaN        -> []
    """
    if isinstance(x, list):
        return x

    if pd.isna(x):
        return []

    msg = (
        f"Column '{col}' expected list but found scalar: {x!r}"
        if col
        else f"Expected list but found scalar: {x!r}"
    )
    warnings.warn(msg)

    return [x]


def _unpack_scalar(x, col: str | None = None):
    """
    Unpack values that *should* be scalar.

    - []      -> pd.NA
    - [x]     -> x
    - [x, y]  -> HARD ERROR (ValueError)
    - non-list -> returned as-is
    """
    if not isinstance(x, list):
        return x

    if len(x) == 0:
        return pd.NA

    if len(x) == 1:
        return x[0]

    msg = (
        f"Column '{col}' expected scalar but found list of length {len(x)}: {x}"
        if col
        else f"Expected scalar but found list of length {len(x)}: {x}"
    )
    raise ValueError(msg)


def _dedupe_list_preserve_order(x):
    """
    If x is a list, remove duplicate elements while preserving order.
    Otherwise return x unchanged.
    """
    if not isinstance(x, list):
        return x
    seen = set()
    out = []
    for item in x:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out


def clean_lists_for_postgres(df: pd.DataFrame, *, strict: bool = False) -> pd.DataFrame:
    """
    Normalize columns for Postgres:
    - Columns in ALWAYS_LIST become list-like ([]) consistently and
      have duplicates removed per cell.
    - Columns in CANDIDATE_SCALAR_FROM_LIST are normalized as lists,
      deduped, then:
        * if all cells have len <= 1 -> converted to scalar
        * otherwise -> error (or warning if not strict)
    - Columns in ALWAYS_SCALAR become scalar ([], [x] allowed; [x,y] -> error).
    - Warn/error if any df columns are not declared in these sets.
    Mutates df in place and returns it.
    """

    known_vars = ALWAYS_LIST | ALWAYS_SCALAR | CANDIDATE_SCALAR_FROM_LIST
    df_cols = set(df.columns)

    unknown_vars = df_cols - known_vars
    if unknown_vars:
        msg = f"Columns not classified in ANY set: {sorted(unknown_vars)}"
        if strict:
            raise ValueError(msg)
        else:
            warnings.warn(msg)

    # 1) True list columns
    for col in df.columns:
        if col in ALWAYS_LIST:
            df[col] = (
                df[col]
                .apply(lambda v: _to_list(v, col=col))
                .apply(_dedupe_list_preserve_order)
            )

    # 2) Candidate list→scalar columns: first normalize & dedupe
    for col in df.columns:
        if col in CANDIDATE_SCALAR_FROM_LIST:
            ser = (
                df[col]
                .apply(lambda v: _to_list(v, col=col))
                .apply(_dedupe_list_preserve_order)
            )

            # Check max length after dedupe
            lengths = ser.apply(lambda x: len(x) if isinstance(x, list) else 0)
            max_len = lengths.max()

            if max_len <= 1:
                # safe to scalarize
                df[col] = ser.apply(lambda v: _unpack_scalar(v, col=col))
            else:
                bad_idx = lengths[lengths > 1].index.tolist()
                msg = (
                    f"Column '{col}' expected to become scalar after dedupe, "
                    f"but still has lists with len > 1 at rows {bad_idx[:10]}"
                )
                if strict:
                    raise ValueError(msg)
                else:
                    print(f"[clean_lists_for_postgres] Warning: {msg}")
                    # keep as list column so you don't lose info
                    df[col] = ser

    # 3) Always-scalar columns
    for col in df.columns:
        if col in ALWAYS_SCALAR:
            df[col] = df[col].apply(lambda v: _unpack_scalar(v, col=col))

    return df


SYMBOL_SEPARATORS = [
    "/",
    "(",
    ")",
    "[",
    "]",
    "-",
    ".",
    " ",
]


# TODO: add unit test
# The guarantee must hold:
# "".join(symbol_split) == original_symbol"
def _split_symbol_with_separators(symbol: str) -> list[str]:
    """
    Split a symbol into parts while preserving separators as individual elements.

    Example:
        'A/RES/37/125A-B' -> ['A', '/', 'RES', '/', '37', '/', '125A', '-', 'B']
    """
    if pd.isna(symbol):
        return []

    # Create a regex pattern that captures separators
    pattern = "(" + "|".join(re.escape(sep) for sep in SYMBOL_SEPARATORS) + ")"

    # Split on the pattern, which keeps the separators
    parts = re.split(pattern, str(symbol))

    # Filter out empty strings
    parts = [part for part in parts if part]

    return parts


def add_symbol_split(df: pd.DataFrame) -> pd.DataFrame:
    """
    Adds a 'symbol_split' column to the DataFrame, containing the split parts of the 'symbol' column.
    Also adds 'symbol_split_n' column with the length of each split.
    Inserts 'symbol_split' and 'symbol_split_n' immediately after the 'symbol' column.
    Designed for use in method chains.
    """
    if "symbol" not in df.columns:
        df["symbol_split"] = None
        df["symbol_split_n"] = None
        return df

    symbol_split = df["symbol"].apply(_split_symbol_with_separators)
    # Use float to handle NaN (becomes NULL in PostgreSQL, which will cast to INTEGER)
    symbol_split_n = symbol_split.apply(len).astype(float)

    symbol_idx = df.columns.get_loc("symbol")
    df.insert(symbol_idx + 1, "symbol_split", symbol_split)
    df.insert(symbol_idx + 2, "symbol_split_n", symbol_split_n)
    return df


def add_symbol_without_prefix_split(df: pd.DataFrame) -> pd.DataFrame:
    """
    Adds a 'symbol_without_prefix_split' column to the DataFrame, containing the split parts of the 'symbol_without_prefix' column.
    Also adds 'symbol_without_prefix_split_n' column with the length of each split.
    Inserts these columns immediately after the 'symbol_without_prefix' column.
    Designed for use in method chains.
    """
    if "symbol_without_prefix" not in df.columns:
        df["symbol_without_prefix_split"] = None
        df["symbol_without_prefix_split_n"] = None
        return df

    symbol_split = df["symbol_without_prefix"].apply(_split_symbol_with_separators)
    symbol_split_n = symbol_split.apply(len).astype(float)

    idx = df.columns.get_loc("symbol_without_prefix")
    df.insert(idx + 1, "symbol_without_prefix_split", symbol_split)
    df.insert(idx + 2, "symbol_without_prefix_split_n", symbol_split_n)
    return df


def explode_document_symbol_column(df):
    """
    If the 'symbol' variable is a list and contains multiple symbols, explode them into separate rows.
    Ensures each list of symbols is unique before exploding to avoid duplicates.

    WARNING: this may still introduce duplicates if symbols overlap across rows!
    """
    if (
        "symbol" in df.columns
        and df["symbol"].apply(lambda x: isinstance(x, list)).any()
    ):
        # Ensure each list is unique before exploding
        df = df.copy()
        df["symbol"] = df["symbol"].apply(
            lambda x: list(dict.fromkeys(x)) if isinstance(x, list) else x
        )
        df = df.explode("symbol").reset_index(drop=True)
    return df


def set_column_dtypes(df: pd.DataFrame) -> pd.DataFrame:
    """Set dtypes for key columns to ensure consistency."""

    # String columns
    string_cols = [
        "session_or_year",
        "record_number",
        "symbol",
        "proper_title",
        "title",
        "subtitle",
        "other_title",
        # messy dates so easier as string than coerce, extract year only
        "publication_date",
        "date",
    ]
    for col in string_cols:
        if col in df.columns:
            df[col] = df[col].astype("string")

    # # Nullable integer
    # if "symbol_split_n" in df.columns:
    #     df["symbol_split_n"] = df["symbol_split_n"].astype("Int64")

    # List/object columns (leave as object, but ensure they are Python lists not numpy arrays)
    object_cols = [
        "note",
        "uniform_title",
        "corporate_name_level1",
        "corporate_name_level2",
        "conference_name",
        "subject_terms",
        "resource_type_level1",
        "resource_type_level2",
        "resource_type_level3",
        "agenda_document_symbol",
        "agenda_item_number",
        "agenda_item_title",
        "agenda_subjects",
        "related_resource_identifier",
        "symbol_split",
    ]
    for col in object_cols:
        if col in df.columns:
            # Convert numpy arrays to Python lists for PostgreSQL compatibility
            df[col] = (
                df[col]
                .apply(lambda x: x.tolist() if hasattr(x, "tolist") else x)
                .astype("object")
            )

    # Dates
    # - `publication_date`
    # - `date`

    # NOTE: `publication_date` is often much later than the session year! (so not a good proxy)
    # Robustly extract year from 'date' column (supports string, datetime, pd.NA)
    if "date" in df.columns:
        # Use float to handle NaN (becomes NULL in PostgreSQL, which will cast to INTEGER)
        df["date_year"] = pd.to_datetime(df["date"], errors="coerce").dt.year.astype(
            float
        )
    else:
        df["date_year"] = None

    # Date columns: leave as-is (could be string or datetime)
    # If you want to enforce datetime, uncomment below:
    # if "date" in df.columns:
    #     df["date"] = pd.to_datetime(df["date"], errors="coerce")

    return df


# these document symbol part variables are generally not very reliable and need to be regenerated consistently
# TODO: feedback to UN Library team
DROP_COLUMNS = [
    "symbol_prefix",
    "symbol_number",
    "year",  # like publication_date but not clean format
    "citation_reference",
    "summary",
    "administrative_note",
    "extent",
    "place",
    "type_of_content_code",
    "series_symbol",
    "index_to_proceedings_heading",
    "distribution_category",
    "index_to_proceedings_heading",
    "random",
    "geographic_headings",
    "publisher",
    "responsibility",
    "vote_summary_and_meeting_number",
    "resource_type_level1",  # all "Documents and Publications", not useful
]


def drop_columns(
    df: pd.DataFrame, columns_to_drop: List[str] = DROP_COLUMNS
) -> pd.DataFrame:
    """
    Drop specified columns from DataFrame if they exist.

    Designed for use in method chains with .pipe().

    Args:
        df: Input DataFrame
        columns_to_drop: List of column names to drop

    Returns:
        DataFrame with specified columns removed
    """
    existing_columns = [col for col in columns_to_drop if col in df.columns]
    if not existing_columns:
        return df
    return df.drop(columns=existing_columns)


# NOTE: space can be meaningful!
# potentially breaking change, not removing space anymore
def _clean_documents_symbol(document_symbol):
    """
    Clean and standardize a single symbol value by converting to uppercase
    and removing leading/trailing whitespace.

    Args:
        value: A symbol value (string, or pd.NA/None)

    Returns:
        Cleaned symbol string, or the original value if not a string
    """
    if pd.notna(document_symbol) and isinstance(document_symbol, str):
        return document_symbol.strip().upper()
    return document_symbol


def disambiguate_document_symbol(df):
    """
    Clean and standardize document symbols in the DataFrame by converting to uppercase
    and removing leading/trailing whitespace (usually does not occur).

    Unclear what other cleaning can be done
    NOTE: whitespace in between can be meaningful –– DO NOT REMOVE!!
    """
    if "symbol" in df.columns:
        df["symbol"] = df["symbol"].apply(_clean_documents_symbol)
    return df


# Add document type based on doc symbol
DOCUMENT_TYPE_MAPPING = {
    "S/RES/": "Security Council Resolutions",
    "S/PRST/": "Security Council Presidential Statements",
    "A/RES/": "General Assembly Resolutions",
    "A/DEC/": "General Assembly Decisions",
    "E/RES/": "ECOSOC Resolutions",
    "E/DEC/": "ECOSOC Decisions",
    "A/HRC/RES/": "Human Rights Council Resolutions",
    "A/HRC/DEC/": "Human Rights Council Decisions",
    "A/HRC/PRST/": "Human Rights Council Presidential Statements",
}


def extract_document_type(symbol):
    """
    Extract document type from document symbol using lookup table.
    Warn if no match is found.
    """
    if pd.isna(symbol) or not isinstance(symbol, str):
        return None

    for prefix, doc_type in DOCUMENT_TYPE_MAPPING.items():
        if symbol.startswith(prefix):
            return doc_type

    print(
        f"[extract_document_type] Warning: Could not match document type for symbol: {symbol!r}"
    )
    return "Other"


def add_document_type_column(df: pd.DataFrame) -> pd.DataFrame:
    """
    Adds a 'document_type' column to the DataFrame based on the 'symbol' column.
    Designed for use in method chains with .pipe().
    """
    if "symbol" in df.columns:
        df = df.copy()
        df["document_type"] = df["symbol"].apply(extract_document_type).astype("string")
    else:
        df["document_type"] = None
    return df


# Add issuing body based on doc symbol
ISSUING_BODY_MAPPING = {
    "A/RES/": "General Assembly",
    "A/DEC/": "General Assembly",
    "S/RES/": "Security Council",
    "S/PRST/": "Security Council",
    "E/RES/": "Economic and Social Council",
    "E/DEC/": "Economic and Social Council",
    "A/HRC/RES/": "Human Rights Council",
    "A/HRC/DEC/": "Human Rights Council",
    "A/HRC/PRST/": "Human Rights Council",
}


def extract_issuing_body(symbol):
    """
    Extract issuing body from document symbol using lookup table.
    Warn if no match is found.
    """
    if pd.isna(symbol) or not isinstance(symbol, str):
        return None

    for prefix, issuing_body in ISSUING_BODY_MAPPING.items():
        if symbol.startswith(prefix):
            return issuing_body

    print(f"[extract_issuing_body] Could not match issuing body for symbol: {symbol!r}")
    return "Other"


def extract_symbol_without_prefix(symbol):
    """
    Remove the prefix from the symbol based on ISSUING_BODY_MAPPING.
    Returns the symbol without the matched prefix, or the original symbol if no prefix matches.
    """
    if pd.isna(symbol) or not isinstance(symbol, str):
        return symbol

    for prefix in ISSUING_BODY_MAPPING.keys():
        if symbol.startswith(prefix):
            return symbol[len(prefix) :]
    return symbol


def add_symbol_without_prefix_column(df: pd.DataFrame) -> pd.DataFrame:
    """
    Adds a 'symbol_without_prefix' column to the DataFrame based on the 'symbol' column.
    Removes the prefix as defined in ISSUING_BODY_MAPPING.
    Designed for use in method chains with .pipe().
    """
    if "symbol" in df.columns:
        df = df.copy()
        df["symbol_without_prefix"] = (
            df["symbol"].apply(extract_symbol_without_prefix).astype("string")
        )
    else:
        df["symbol_without_prefix"] = None
    return df


def add_issuing_body_column(df: pd.DataFrame) -> pd.DataFrame:
    """
    Adds an 'issuing_body' column to the DataFrame based on the 'symbol' column.
    Designed for use in method chains with .pipe().
    """
    if "symbol" in df.columns:
        df = df.copy()
        df["issuing_body"] = df["symbol"].apply(extract_issuing_body).astype("string")
    else:
        df["issuing_body"] = None
    return df


# Add potential_duplicate column
def check_is_part(symbol):
    """
    Check if a document symbol contains either '[' or ']', indicating it is a part or subpart.
    """
    if pd.isna(symbol) or not isinstance(symbol, str):
        return False

    return "[" in symbol or "]" in symbol


def add_is_part_column(df: pd.DataFrame) -> pd.DataFrame:
    """
    Adds an 'is_part' boolean column to the DataFrame based on the 'symbol' column.
    True if symbol contains '[' or ']'.
    """
    if "symbol" in df.columns:
        df = df.copy()
        df["is_part"] = df["symbol"].apply(check_is_part)
    else:
        df["is_part"] = False

    df["is_part"] = df["is_part"].astype("boolean")
    return df


def clean_metadata(df):
    df_clean = (
        df.pipe(rename_variables_df)  # MARC to semantic
        .pipe(drop_columns)  # drop unimportant or empty columns
        .pipe(
            clean_lists_for_postgres
        )  # predictably manage list columns, removes duplicates in cell lists
        .pipe(explode_document_symbol_column)  # explode list symbols
        .pipe(disambiguate_document_symbol)  # clean up symbols
        .pipe(add_symbol_split)  # add symbol split var
        .pipe(set_column_dtypes)
        # add more vars
        # .pipe(add_document_type_column)
        # .pipe(add_issuing_body_column)
        .pipe(add_is_part_column)
        .pipe(add_symbol_without_prefix_column)
        .pipe(add_symbol_without_prefix_split)
    )
    return df_clean
