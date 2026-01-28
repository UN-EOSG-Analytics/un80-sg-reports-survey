# RESOLUTION EXTRACTION FROM NOTES

import re

def extract_resolution_refs_from_note(note: str) -> list[dict]:
    """
    Extract resolution references from a note field (MARC 500__a).
    
    Returns list of dicts with:
    - body: "General Assembly", "Security Council", etc.
    - resolution_num: "78/70"
    - inferred_symbol: "A/RES/78/70" (if we can infer it)
    """
    if not note:
        return []
    
    results = []
    
    # Pattern 1: "General Assembly resolution(s) 78/70" or "78/70 B" (with optional suffix)
    ga_match = re.search(r"General Assembly resolution[s]?\s+([\d/\s\w,and]+?)(?:\.|;|$)", note, re.IGNORECASE)
    if ga_match:
        res_text = ga_match.group(1)
        for m in re.finditer(r"(\d+/\d+)(?:\s*([A-Z]))?", res_text, re.IGNORECASE):
            num = m.group(1)
            suffix = f" {m.group(2).upper()}" if m.group(2) else ""
            results.append({
                "body": "General Assembly",
                "resolution_num": f"{num}{suffix}".strip(),
                "inferred_symbol": f"A/RES/{num}{suffix}".strip(),
            })
    
    # Pattern 2: "Security Council resolution(s) 2334 (2016)" 
    sc_match = re.search(r"Security Council resolution[s]?\s+([\d\s\(\),and]+?)(?:\.|;|$)", note, re.IGNORECASE)
    if sc_match:
        res_text = sc_match.group(1)
        for m in re.finditer(r"(\d+)\s*\((\d{4})\)", res_text):
            results.append({
                "body": "Security Council",
                "resolution_num": f"{m.group(1)} ({m.group(2)})",
                "inferred_symbol": f"S/RES/{m.group(1)} ({m.group(2)})",
            })
    
    # Pattern 3: "ECOSOC/Economic and Social Council resolution 2020/5"
    ecosoc_match = re.search(r"(?:ECOSOC|Economic and Social Council) resolution[s]?\s+([\d/\s,and]+?)(?:\.|;|$)", note, re.IGNORECASE)
    if ecosoc_match:
        res_text = ecosoc_match.group(1)
        for m in re.finditer(r"(\d+/\d+)", res_text):
            results.append({
                "body": "Economic and Social Council",
                "resolution_num": m.group(1),
                "inferred_symbol": f"E/RES/{m.group(1)}",
            })
    
    # Pattern 4: "Human Rights Council resolution 52/30"
    hrc_match = re.search(r"Human Rights Council resolution[s]?\s+([\d/\s,and]+?)(?:\.|;|$)", note, re.IGNORECASE)
    if hrc_match:
        res_text = hrc_match.group(1)
        for m in re.finditer(r"(\d+/\d+)", res_text):
            results.append({
                "body": "Human Rights Council",
                "resolution_num": m.group(1),
                "inferred_symbol": f"A/HRC/RES/{m.group(1)}",
            })
    
    return results


def extract_resolution_symbols_from_notes(notes: list[str] | str | None) -> list[str]:
    """
    Extract all resolution symbols from a list of notes.
    Returns deduplicated list of inferred resolution symbols.
    """
    if not notes:
        return []
    
    if isinstance(notes, str):
        notes = [notes]
    
    symbols = []
    for note in notes:
        refs = extract_resolution_refs_from_note(note)
        symbols.extend(ref["inferred_symbol"] for ref in refs)
    
    # Deduplicate while preserving order
    seen = set()
    return [s for s in symbols if not (s in seen or seen.add(s))]


