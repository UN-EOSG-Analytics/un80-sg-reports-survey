# Entity and Frequency Extraction Analysis

**Date:** January 27, 2026  
**Analyzed:** 5 SG Reports + 8 Resolutions (expanded)

## Executive Summary

This analysis examined UN SG reports and their mandating resolutions to determine where information about the **authoring entity** and **reporting frequency** can be reliably extracted, with a focus on **LLM-based extraction** rather than regex patterns.

### Key Findings

| Information Type | Best Source | Extraction Method | Reliability |
|------------------|-------------|-------------------|-------------|
| **Authoring Entity** | MARC 710__a + Manual list | Direct lookup | High |
| **Report Frequency** | Resolution operative paragraphs | LLM extraction | Medium-High |
| **Report Scope/Content** | Resolution operative paragraphs | LLM extraction | High |
| **Previous Resolutions** | Resolution preamble | LLM extraction | High |
| **Mandate Duration** | Resolution operative paragraphs | LLM extraction | High |
| **Target Session/Date** | Resolution operative paragraphs | LLM extraction | High |

---

## 1. Resolution Structure Analysis

### Consistent Document Structure

All resolutions follow a predictable structure that LLMs can reliably parse:

```
[Header: Symbol, Title, Adopting Body, Date]

The [Body],

[PREAMBLE - "Recalling", "Recognizing", "Noting", etc.]
  - References to previous resolutions
  - Context and background
  - Concerns and observations

[OPERATIVE PARAGRAPHS - numbered]
  1. Decides/Takes note/Welcomes...
  2. Requests the Secretary-General to...
  3. Invites Member States to...
  ...
```

### Different Body Patterns

| Body | Session Reference | Date Format | Example |
|------|-------------------|-------------|---------|
| **General Assembly** | "at its [Nth] session" | Session numbers (78th, 79th) | "at its eightieth session" |
| **Security Council** | Specific dates | "until [date]" | "until 31 October 2025" |
| **ECOSOC** | Session years | "[year] session" | "2020 session" |
| **Human Rights Council** | Session numbers | "its [Nth] session" | "its thirty-first session" |

---

## 2. Extractable Data Fields (LLM Targets)

### 2.1 Frequency Information

**Finding:** Frequency is often **implicit** rather than explicit. LLMs must infer from context.

#### Explicit Frequency Patterns
Some resolutions contain explicit frequency terms:
- "annual report" / "annually"
- "biennial" / "every two years"
- "on a regular basis"

**Example from A/RES/75/233 (QCPR):**
> "Reiterates its request to present **annual reports** to the Economic and Social Council"

#### Implicit Frequency (Target Session)
More commonly, frequency must be inferred from target session:
- "submit to the General Assembly at its **eightieth session**" (from 78th → 80th = biennial)
- "report to the Human Rights Council, starting from its **thirty-first session**"

**Example from A/RES/78/70:**
> "Requests the Secretary-General to submit to the General Assembly at its **eightieth session** a report on the implementation"

This implies biennial reporting (78th session resolution → 80th session report).

#### Mandate Extension Patterns (Security Council)
SC resolutions often extend mandates by specific periods:
> "Decides to extend the mandate of the Verification Mission until **31 October 2025**"

This implies the next report/review is due around that date.

### 2.2 Report Content/Scope Requirements

Resolutions often specify what reports should cover:

**Example from A/RES/78/70 (Mine Action):**
> "report on the implementation of the present resolution and the progress made in mine action"

**Example from A/HRC/RES/28/6 (Albinism):**
> Mandate includes:
> - "(c) To promote and report on developments towards and the challenges and obstacles to the realization of the enjoyment of human rights"
> - "(d) To gather, request, receive and exchange information... on violations of the rights"

### 2.3 Previous/Related Resolutions

The preamble typically lists all predecessor resolutions:

**Example from A/RES/79/150:**
> "Recalling its resolutions 44/82 of 8 December 1989, 50/142 of 21 December 1995, 52/81 of 12 December 1997, 54/124 of 17 December 1999, 56/113 of 19 December 2001..."

This provides:
- Complete resolution chain history
- Dates showing reporting pattern over time
- Related topic references

### 2.4 Responsible Entity

**Primary entity assignment:**
> "**Requests the Secretary-General** to submit..."
> "**Requests the Independent Expert** to..."
> "**Invites the Special Rapporteur** to..."

**Supporting entities:**
> "in collaboration with relevant stakeholders"
> "working with the Special Jurisdiction for Peace"

### 2.5 Mandate Duration (for Special Procedures)

**Example from A/HRC/RES/28/6:**
> "Decides to appoint, **for a period of three years**, an Independent Expert"

---

## 3. LLM Extraction Strategy

### Recommended Prompt Structure

```
Given the following UN resolution text, extract:

1. REPORTING MANDATE (if any):
   - Target session/date for next report
   - Implied frequency (annual/biennial/etc.)
   - Reporting entity (Secretary-General, Special Rapporteur, etc.)
   - Report topic/scope requirements

2. RESOLUTION CHAIN:
   - List of previous related resolutions mentioned
   - Pattern of sessions/years (for frequency inference)

3. MANDATE DETAILS (if establishing/extending a mandate):
   - Duration
   - Key tasks assigned
   - Review/renewal date

Return structured JSON with confidence scores.
```

### Expected Output Schema

```json
{
  "reporting_mandate": {
    "exists": true,
    "target_session": "80th session",
    "target_date": null,
    "implied_frequency": "biennial",
    "frequency_confidence": 0.85,
    "responsible_entity": "Secretary-General",
    "scope": "implementation of the present resolution and progress made in mine action",
    "explicit_frequency_mentioned": false
  },
  "resolution_chain": [
    {"symbol": "A/RES/76/74", "date": "2021-12-09"},
    {"symbol": "A/RES/74/80", "date": "2019-12-13"}
  ],
  "mandate_details": {
    "duration": null,
    "tasks": [],
    "review_date": null
  }
}
```

### Validation Approach

1. **Cross-reference with historical data**: Compare LLM-inferred frequency with actual publication history
2. **Session arithmetic**: Verify target session math (78th + 2 = 80th for biennial)
3. **Entity normalization**: Map extracted entities to canonical department names

---

## 4. Resolutions Without Report Mandates

Not all resolutions mandate reports. Some resolutions:
- Establish procedures (E/RES/2020/5 on statistics coordination)
- Make declarations
- Request actions other than reporting

**LLM should indicate `reporting_mandate.exists: false` for these.**

---

## 5. Sample Analyses

### A/RES/78/70 (Assistance in Mine Action)

| Field | Extracted Value |
|-------|-----------------|
| Target session | 80th session |
| Implied frequency | Biennial |
| Entity | Secretary-General |
| Scope | "implementation of the present resolution and progress made in mine action" |
| Previous resolutions | 76/74, many others since 1990s |

### S/RES/2754 (2024) (Colombia Verification Mission)

| Field | Extracted Value |
|-------|-----------------|
| Target date | 31 October 2025 |
| Implied frequency | Annual (mandate extension) |
| Entity | Secretary-General (via Verification Mission) |
| Scope | Implementation of 2016 Final Peace Agreement |
| Mandate duration | Extended until Oct 2025 |

### A/HRC/RES/28/6 (Independent Expert on Albinism)

| Field | Extracted Value |
|-------|-----------------|
| Target session | 31st session (HRC) |
| Implied frequency | Annual (to HRC and GA) |
| Entity | Independent Expert on Albinism |
| Mandate duration | 3 years |
| Scope | 8 specific mandate areas listed |

---

## 6. Implementation Recommendations

### Phase 1: LLM Extraction Pipeline

1. **Fetch resolution fulltext** (already implemented)
2. **Run LLM extraction** with structured prompt
3. **Store extracted fields** in new table `resolution_mandates`:
   ```sql
   CREATE TABLE resolution_mandates (
     resolution_symbol TEXT PRIMARY KEY,
     target_session TEXT,
     target_date DATE,
     inferred_frequency TEXT,
     frequency_confidence FLOAT,
     responsible_entity TEXT,
     report_scope TEXT,
     mandate_duration TEXT,
     previous_resolutions TEXT[],
     extracted_at TIMESTAMPTZ,
     llm_model TEXT
   );
   ```

### Phase 2: Report-Resolution Linking Enhancement

1. **Join reports to resolution mandates**
2. **Compare inferred vs. actual frequency**
3. **Flag discrepancies** for review

### Phase 3: Survey Integration

Use extracted data to inform survey:
- "This report is mandated to cover: [scope]"
- "Current frequency: [actual] vs. Mandated: [inferred]"
- "Mandate expires: [date]"

---

## 7. Cost-Benefit Analysis

### LLM vs. Regex

| Aspect | Regex | LLM |
|--------|-------|-----|
| **Development time** | High (many patterns) | Low (one prompt) |
| **Maintenance** | High (new patterns) | Low (self-adapting) |
| **Accuracy** | Medium (misses context) | High (understands intent) |
| **Cost per resolution** | ~$0 | ~$0.01-0.05 |
| **Handles edge cases** | Poor | Good |
| **Confidence scoring** | No | Yes |

**Recommendation:** Use LLM extraction with validation against historical data.

### Estimated Costs

- ~5,000 resolutions to process
- ~$0.03 per resolution (GPT-4o mini or Claude Haiku)
- **Total: ~$150 one-time extraction**
- Can be run incrementally as new resolutions are added

---

## Appendix: Resolution Examples

### Example 1: Explicit Reporting Request

From **A/RES/78/70**:
```
Requests the Secretary-General to submit to the General Assembly at its 
eightieth session a report on the implementation of the present resolution 
and the progress made in mine action, and to include in that report an 
appendix containing information provided by Member States.
```

### Example 2: Mandate Establishment

From **A/HRC/RES/28/6**:
```
Decides to appoint, for a period of three years, an Independent Expert on the 
enjoyment of human rights by persons with albinism, with the following mandate:
(a) To engage in dialogue and consult with States...
(b) To identify, exchange and promote good practices...
(c) To promote and report on developments...
(h) To report to the Human Rights Council, starting from its thirty-first session, 
    and to the General Assembly;
```

### Example 3: Mandate Extension (Security Council)

From **S/RES/2754 (2024)**:
```
1. Decides to extend the mandate of the Verification Mission until 31 October 2025;
2. Expresses its willingness to work with the Government of Colombia on 
   the further extension of the mandate...
```

### Example 4: No Report Mandate

From **E/RES/2020/5** (Statistics Coordination):
- Contains procedural requests to coordinate statistical programmes
- No reporting mandate to Secretary-General
- LLM should return `reporting_mandate.exists: false`
