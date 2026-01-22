"""Compare two metadata search approaches for Secretary-General reports."""
import os
import re
import requests
from dotenv import load_dotenv
from joblib import Memory

memory = Memory(location=".cache", verbose=0)
load_dotenv()
AWS_API_URL = os.getenv("AWS_API_URL").rstrip("/")

@memory.cache
def search_api(query: str, tag: str, skip: int = 0, limit: int = 100) -> list:
    url = f"{AWS_API_URL}/dev/list"
    res = requests.get(url, params={"tag": tag, "query": query, "limit": limit, "skip": skip})
    res.raise_for_status()
    return res.json()

def fetch_all(query: str, tag: str, start_year: int = 2020) -> list:
    all_results, skip, old_streak = [], 0, 0
    while True:
        batch = search_api(query, tag, skip=skip)
        if not batch:
            break
        dates = sorted(set(d for r in batch if (d := (r.get("269__a") or [None])[0])))
        print(f"  {len(batch)} results, dates: {dates[0] if dates else '?'} → {dates[-1] if dates else '?'}")
        all_results.extend(batch)
        if len(batch) < 100:
            break
        old_streak = old_streak + 1 if dates and dates[-1] < str(start_year) else 0
        if old_streak >= 3:
            break
        skip += 100
    return all_results

def get_symbols(results: list) -> set:
    return {s for r in results for s in (r.get("191__a") or [])}

def filter_sg_reports(results: list) -> list:
    """Filter for reports with 'Secretary-General' in title or subtitle (case-insensitive)."""
    return [r for r in results if any(
        "secretary-general" in (t or "").lower()
        for t in (r.get("245__a") or []) + (r.get("245__b") or [])
    )]

if __name__ == "__main__":
    print("\n=== APPROACH 1: doc_type = 'Secretary-General's Reports' (989__c) ===")
    results1 = fetch_all("'Secretary-General's Reports'", "989__c")
    symbols1 = get_symbols(results1)
    print(f"Total: {len(results1)} records, {len(symbols1)} unique symbols")

    # Analyze titles for noise patterns
    print("\n=== ANALYZING APPROACH 1 FOR NOISE ===")
    title_words = {}
    for r in results1:
        title = (r.get("245__a") or [""])[0].lower()
        for word in title.split()[:3]:  # first 3 words
            word = word.strip(":,")
            if len(word) > 3:
                title_words[word] = title_words.get(word, 0) + 1
    print("\nMost common title starting words:")
    for w, c in sorted(title_words.items(), key=lambda x: -x[1])[:30]:
        print(f"  {c:4d} - {w}")

    # Group by title prefix patterns
    print("\n\nGrouped by title pattern (first 40 chars):")
    patterns = {}
    for r in results1:
        title = (r.get("245__a") or [""])[0][:40]
        patterns[title] = patterns.get(title, 0) + 1
    for p, c in sorted(patterns.items(), key=lambda x: -x[1])[:40]:
        print(f"  {c:4d} - {p}")

    # Look for potential noise keywords
    print("\n\nPotential noise (credentials, letters, notes, etc.):")
    noise_keywords = ["credential", "letter", "note by", "corrigendum", "addendum", "errata"]
    for kw in noise_keywords:
        matches = [r for r in results1 if kw in (r.get("245__a") or [""])[0].lower()]
        if matches:
            print(f"\n'{kw}' ({len(matches)} records):")
            for r in matches[:5]:
                sym = (r.get("191__a") or ["?"])[0]
                title = (r.get("245__a") or [""])[0][:70]
                print(f"    {sym}: {title}")

    print("\n=== APPROACH 2: doc_type = 'Reports' (989__b) + title filter ===")
    results2_raw = fetch_all("'Reports'", "989__b")
    results2 = filter_sg_reports(results2_raw)
    symbols2 = get_symbols(results2)
    print(f"Total: {len(results2_raw)} raw → {len(results2)} filtered, {len(symbols2)} unique symbols")

    print("\n=== COMPARISON ===")
    only_in_1 = symbols1 - symbols2
    only_in_2 = symbols2 - symbols1
    common = symbols1 & symbols2
    
    print(f"Common symbols: {len(common)}")
    print(f"Only in approach 1: {len(only_in_1)}")
    print(f"Only in approach 2: {len(only_in_2)}")
    
    if only_in_1:
        print(f"\nSamples only in approach 1:")
        for s in sorted(only_in_1)[:10]:
            r = next((x for x in results1 if s in (x.get("191__a") or [])), None)
            title = (r.get("245__a") or [""])[0][:60] if r else ""
            print(f"  {s}: {title}...")
    
    if only_in_2:
        print(f"\nSamples only in approach 2:")
        for s in sorted(only_in_2)[:10]:
            r = next((x for x in results2 if s in (x.get("191__a") or [])), None)
            title = (r.get("245__a") or [""])[0][:60] if r else ""
            print(f"  {s}: {title}...")

    # Deeper analysis
    print("\n=== DEEPER ANALYSIS ===")
    
    # What doc types (989__c) do approach-2-only records have?
    print("\nDoc types (989__c) of records only in approach 2:")
    types2 = {}
    for s in only_in_2:
        r = next((x for x in results2 if s in (x.get("191__a") or [])), None)
        if r:
            for t in (r.get("989__c") or ["(none)"]):
                types2[t] = types2.get(t, 0) + 1
    for t, c in sorted(types2.items(), key=lambda x: -x[1]):
        print(f"  {c:4d} - {t}")

    # What are title patterns in approach-1-only (why no "of the Secretary-General")?
    print("\nTitle patterns in approach-1-only (first 20):")
    for s in sorted(only_in_1)[:20]:
        r = next((x for x in results1 if s in (x.get("191__a") or [])), None)
        if r:
            title = (r.get("245__a") or [""])[0]
            subtitle = (r.get("245__b") or [""])[0] if r.get("245__b") else ""
            full = f"{title} | {subtitle}" if subtitle else title
            print(f"  {s}: {full[:80]}")

    # Check doc types of approach-1-only
    print("\nDoc types (989__c) of records only in approach 1:")
    types1 = {}
    for s in only_in_1:
        r = next((x for x in results1 if s in (x.get("191__a") or [])), None)
        if r:
            for t in (r.get("989__c") or ["(none)"]):
                types1[t] = types1.get(t, 0) + 1
    for t, c in sorted(types1.items(), key=lambda x: -x[1])[:15]:
        print(f"  {c:4d} - {t}")

    # Check why approach-1-only weren't caught by title filter
    print("\nAnalyzing why 373 in approach-1-only weren't found by title filter:")
    has_sg_in_title = has_sg_in_subtitle = has_sg_nowhere = 0
    sg_variants = {}
    for s in only_in_1:
        r = next((x for x in results1 if s in (x.get("191__a") or [])), None)
        if r:
            title = " ".join(r.get("245__a") or [])
            subtitle = " ".join(r.get("245__b") or [])
            combined = f"{title} {subtitle}".lower()
            if "secretary-general" in combined:
                if "secretary-general" in title.lower():
                    has_sg_in_title += 1
                else:
                    has_sg_in_subtitle += 1
                # Find the actual phrase used
                for m in re.findall(r"(?:of the |the )?secretary.general['']?s?", combined, re.I):
                    sg_variants[m.lower().strip()] = sg_variants.get(m.lower().strip(), 0) + 1
            else:
                has_sg_nowhere += 1
    print(f"  In title: {has_sg_in_title}, In subtitle only: {has_sg_in_subtitle}, Nowhere: {has_sg_nowhere}")
    print(f"  Variants found: {sg_variants}")

    # Sample the ones without SG in title at all
    if has_sg_nowhere:
        print(f"\nSamples with no 'Secretary-General' in title/subtitle:")
        count = 0
        for s in sorted(only_in_1):
            r = next((x for x in results1 if s in (x.get("191__a") or [])), None)
            if r:
                title = " ".join(r.get("245__a") or [])
                subtitle = " ".join(r.get("245__b") or [])
                if "secretary-general" not in f"{title} {subtitle}".lower():
                    print(f"  {s}: {title[:70]}")
                    count += 1
                    if count >= 10:
                        break

    # Year distribution comparison
    print("\nYear distribution:")
    def year_dist(results, symbols_filter=None):
        dist = {}
        for r in results:
            syms = set(r.get("191__a") or [])
            if symbols_filter and not syms & symbols_filter:
                continue
            date = (r.get("269__a") or [""])[0][:4]
            if date.isdigit():
                dist[date] = dist.get(date, 0) + 1
        return dist
    
    years = sorted(set(year_dist(results1).keys()) | set(year_dist(results2).keys()))
    d1, d2 = year_dist(results1), year_dist(results2)
    d1_only = year_dist(results1, only_in_1)
    d2_only = year_dist(results2, only_in_2)
    print(f"{'Year':>6} {'App1':>6} {'App2':>6} {'Only1':>6} {'Only2':>6}")
    for y in years[-8:]:  # last 8 years
        print(f"{y:>6} {d1.get(y,0):>6} {d2.get(y,0):>6} {d1_only.get(y,0):>6} {d2_only.get(y,0):>6}")
