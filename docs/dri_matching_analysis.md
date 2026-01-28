# DRI-to-Symbol Matching Analysis

## Executive Summary

Matching DRI (Document Reference Index) records to database report symbols is challenging because:
1. DRI tracks **document production forecasts** while DB contains **published documents**
2. DRI has no symbol field - only internal SLOT # references
3. Title formats differ significantly between sources
4. Current matching achieves ~58% at 0.8 threshold, improvable to ~68% at 0.7

## Data Overview

### DRI Dataset
- **Total records**: 38,435
- **SG-related** (contains "secretary" + "report"): 4,261
- **With entity**: 4,119
- **Unique titles**: ~2,000

| Column | Description |
|--------|-------------|
| SLOT # | Internal DRI reference (e.g., F2510377) |
| CASE # | EOSG case number (sparse) |
| DATE | Document date |
| ENTITY | Authoring department (111 unique) |
| UNIT | Processing unit (SDU, PU, OCDC, RLU, OSAP, SPMU) |
| DOCUMENT TITLE | Free-text title |
| STATUS | Excluded/Not specified/Cleared/For Info/For Clearance |

### Database
- **Total reports**: 6,122
- **With "Secretary" in title**: 280 (4.6%)
- **With "Report of the" in title**: 1,296 (21.2%)

## DRI Title Pattern Variants

| Pattern | Count |
|---------|-------|
| "report of the secretary-general" | 3,571 |
| "note by the secretary-general" | 891 |
| "secretary-general's report" | 51 |
| "letter from secretary-general" | 42 |
| "report from the secretary-general" | 1 |

Note: Some DRI titles contain document symbols (30 records), e.g., "S/78/22", "A/78/986"

## Title Format Differences

### DRI Format Examples
```
2024 report of the Secretary-General on strengthening of the coordination...
Report of the Secretary-General on 1559
Secretary-General's Report on the Impact of Rising Military Expenditure...
ACABQ Rpt: Progress on the functioning and development of the Umoja system
```

### DB Format Examples
```
Strengthening of the coordination of emergency humanitarian assistance...
Report of the Secretary-General on Somalia
Progress on the functioning and development of the Umoja system :
```

**Key differences**:
1. DRI often has year prefix ("2024 report...")
2. DRI uses "Secretary-General's Report on X" while DB uses "X : report of the Secretary-General"
3. DRI uses abbreviations (ACABQ Rpt:)
4. Some DRI titles reference resolution numbers only ("Report of the SG on 1559")

## Matching Approaches

### Current Approach (populate_reporting_entities.py)
1. Filter DRI to "report of the secretary-general" (exact phrase)
2. Normalize: lowercase, remove brackets/quotes
3. Pre-filter by 2+ shared words (excluding stopwords)
4. Fuzzy match using `SequenceMatcher`
5. Accept matches with score >= 0.8

**Results**: 481 symbols matched (from 1,935 DRI titles)

### Improved Approach (Tested)
1. Broader filter: "secretary" AND "report"
2. Better normalization:
   - Strip year prefixes
   - Remove "Report of the Secretary-General on" boilerplate
   - Remove "ACABQ Rpt:" prefix
   - Remove duplicate markers
3. Keyword-based pre-filtering

**Results at different thresholds**:

| Threshold | Matches | % of DRI | Unique Symbols |
|-----------|---------|----------|----------------|
| 1.0 (exact) | 340 | 17.7% | 340 |
| 0.9 | 832 | 43.4% | - |
| 0.8 | 1,102 | 57.5% | 735 |
| 0.75 | 1,195 | 62.3% | - |
| 0.7 | 1,304 | 68.0% | 809 |

## Match Quality Analysis

### Correct Borderline Matches (0.7-0.85)
```
[0.81] Children and armed conflict in the DRC
       DRI: "Report of the Secretary-General on children and armed conflict..."
       DB:  "Children and armed conflict in the Democratic Republic of the Congo"
       → CORRECT (same topic, different title format)

[0.80] World Population and Housing Census
       DRI: "Report of the Secretary-General: The 2020 and 2030 World Population..."
       DB:  "2020 and 2030 World Population and Housing Census Programmes"
       → CORRECT (same topic)
```

### Incorrect Matches (False Positives)
```
[0.72] International Residual Mechanism
       DRI: "Construction of a new facility for the International Residual Mechanism..."
       DB:  "Financing of the International Residual Mechanism..."
       → WRONG (different reports about same entity)
```

### Non-Matchable DRI Records
Some DRI titles cannot be matched because:

1. **Resolution-only references**:
   - "Report of the Secretary-General on 1559"
   - "Report of the Secretary-General on 2139"
   - These need resolution-to-title mapping

2. **Abbreviated titles**:
   - "Report of the Secretary-General on Abyei (UNISFA)"
   - "Report of the Secretary-General on Afghanistan"

3. **Future documents** not yet in DB

## Entity Distribution (DRI)

| Entity | Count |
|--------|-------|
| DPPA | 889 |
| DMSPC | 675 |
| OHCHR | 604 |
| DESA | 550 |
| ODA | 248 |
| OLA | 181 |
| DPO | 113 |
| EOSG | 77 |
| UNW | 68 |
| DGC | 59 |

## Recommendations

### Quick Wins
1. **Lower threshold to 0.75** - increases matches from 58% to 62% with acceptable quality
2. **Improve normalization** - strip SG boilerplate, year prefixes
3. **Exact match first** - normalized titles match 340 records perfectly

### Medium Effort
4. **Resolution mapping** - build lookup for "1559" → "implementation of Security Council resolution 1559"
5. **Keyword extraction** - match on 3+ significant keywords when fuzzy match fails

### Larger Effort
6. **Symbol extraction** - parse DB symbol patterns from DRI if available elsewhere
7. **Manual curation** - create mapping table for common abbreviated titles
8. **Date matching** - use DRI DATE to narrow candidates to same publication period

## Keyword Matching for Short Titles

For very short normalized titles (348 records with ≤3 words), keyword-based matching is effective:

| DRI Title | Keywords | Best DB Match |
|-----------|----------|---------------|
| "Report of the SG on Libya" | {libya} | S/2025/611: Strategic review... Libya |
| "Report of the SG on Somalia" | {somalia} | S/2025/613: Report of the SG on Somalia ✓ |
| "Report of the SG on 1701" | {1701} | S/2025/738: Implementation of SC res 1701 ✓ |
| "Multilingualism: Report of the SG" | {multilingualism} | A/78/790: Multilingualism ✓ |
| "The Peacebuilding Fund: Report" | {peacebuilding, fund} | A/79/790: Peacebuilding Fund ✓ |

**Approach**: Build inverted index of keywords → symbols, match by keyword overlap count.

## Normalization Function (Improved)

```python
def normalize_title(t):
    if pd.isna(t): return ''
    t = str(t).lower()
    # Strip year prefix
    t = re.sub(r'^\d{4}\s+(progress\s+)?report\s+(of|on|from)\s+the\s+secretary[-\s]?general\s*(on|:)?\s*', '', t)
    # Strip SG boilerplate anywhere
    t = re.sub(r'report\s+(of|on|from)\s+the\s+secretary[-\s]?general\s*(on)?', '', t)
    t = re.sub(r'secretary[-\s]?general.?s?\s+report\s*(on)?', '', t)
    # Strip ACABQ prefix
    t = re.sub(r'acabq\s+r(e)?pt:', '', t)
    # Strip duplicate markers
    t = re.sub(r'\[duplicate.*?\]', '', t)
    # Clean punctuation
    t = re.sub(r'[^a-z0-9\s]', '', t)
    return ' '.join(t.split())
```

## Coverage Impact

| Approach | DRI Match Rate | Unique Symbols | DB Coverage |
|----------|----------------|----------------|-------------|
| Current (0.8, basic norm) | 25% | 481 | 7.9% |
| Improved norm, 0.8 threshold | 57.5% | 735 | 12.0% |
| Improved norm, 0.7 threshold | 64.3% | 718 | 11.7% |
| Combined (exact + fuzzy + keyword) | 53.3% | 581 | 9.5% |

**Best approach**: Improved normalization with 0.7-0.8 threshold gives best balance.

### Total Entity Coverage (DGACM + DRI)

| Source | Symbols | DB Coverage |
|--------|---------|-------------|
| DGACM list only | 296 | 4.8% |
| DRI improved only | 718 | 11.7% |
| **Combined (deduplicated)** | ~850 | ~14% |

**Note**: "Note by the Secretary-General" patterns (891 DRI records) are NOT in the current DB - these may be a different document type or need separate ingestion.

## Next Steps

### Immediate (Update Script)
1. Update `populate_reporting_entities.py` with improved normalization function
2. Lower threshold from 0.8 to 0.75
3. Broaden DRI filter from "report of the secretary-general" to "secretary" AND "report"

### Short-term
4. Build resolution number → title lookup table for "Report on 1701" style titles
5. Add keyword fallback matching for short normalized titles
6. Review and validate a sample of borderline matches (0.7-0.8)

### Investigation
7. Determine why 46% of DRI titles don't match - are these:
   - Future documents not yet published?
   - Documents in different DB?
   - Title variations needing manual mapping?

## Conclusion

The DRI→Symbol matching problem is fundamentally a **title reconciliation** challenge between two systems with different conventions. 

**Current state**: 481 symbols matched (7.9% DB coverage)

**Achievable with improvements**: 718 symbols matched (11.7% DB coverage) - a **49% improvement**

Key changes:
- Better normalization (strip SG boilerplate, year prefixes)
- Lower threshold (0.75 instead of 0.8)
- Broader DRI filter

For the remaining 46% unmatched DRI records, manual investigation is needed to determine if they represent future documents, different document types, or correctable title variations.
