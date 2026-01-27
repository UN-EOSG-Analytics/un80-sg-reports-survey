import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

const DB_SCHEMA = process.env.DB_SCHEMA || "sg_reports_survey";

interface TreemapRow {
  level2: string;
  level3: string;
  subject: string;
  count: number;
}

interface ReportRow {
  symbol: string;
  title: string;
  date_year: number | null;
}

export async function GET(req: NextRequest) {
  const level2 = req.nextUrl.searchParams.get("level2");
  const level3 = req.nextUrl.searchParams.get("level3");
  const subject = req.nextUrl.searchParams.get("subject");

  // If filters provided, return list of reports
  if (level2 && level3 && subject) {
    const reports = await query<ReportRow>(`
      SELECT symbol, COALESCE(proper_title, title) as title, date_year
      FROM ${DB_SCHEMA}.reports
      WHERE symbol NOT LIKE '%/CORR.%' AND symbol NOT LIKE '%/REV.%'
        AND COALESCE(resource_type_level2[1], 'Unknown') = $1
        AND COALESCE(resource_type_level3[1], 'Unknown') = $2
        AND $3 = ANY(subject_terms)
      ORDER BY date_year DESC NULLS LAST, symbol
      LIMIT 100
    `, [level2, level3, subject]);
    return NextResponse.json({ reports });
  }
  // Get hierarchical counts: level2 -> level3 -> subject
  // For each report, only use the subject tag that is globally most frequent
  const rows = await query<TreemapRow>(`
    WITH 
    -- Global frequency of each subject tag
    subject_freq AS (
      SELECT unnest(subject_terms) as subject, COUNT(*) as freq
      FROM ${DB_SCHEMA}.reports
      WHERE symbol NOT LIKE '%/CORR.%' AND symbol NOT LIKE '%/REV.%'
        AND subject_terms IS NOT NULL
      GROUP BY 1
    ),
    -- For each report, pick the subject with highest global frequency
    report_best_subject AS (
      SELECT DISTINCT ON (r.symbol)
        r.symbol,
        COALESCE(resource_type_level2[1], 'Unknown') as level2,
        COALESCE(resource_type_level3[1], 'Unknown') as level3,
        COALESCE(s.subject, 'No subject') as subject
      FROM ${DB_SCHEMA}.reports r
      LEFT JOIN LATERAL unnest(r.subject_terms) as s(subject) ON true
      LEFT JOIN subject_freq sf ON sf.subject = s.subject
      WHERE r.symbol NOT LIKE '%/CORR.%' AND r.symbol NOT LIKE '%/REV.%'
        AND s.subject != 'Representative''s credentials'
      ORDER BY r.symbol, sf.freq DESC NULLS LAST
    )
    SELECT level2, level3, subject, COUNT(*)::int as count
    FROM report_best_subject
    GROUP BY level2, level3, subject
    ORDER BY count DESC
  `);

  // Build hierarchy
  const level2Map = new Map<string, Map<string, Map<string, number>>>();
  
  for (const row of rows) {
    if (!level2Map.has(row.level2)) level2Map.set(row.level2, new Map());
    const l3Map = level2Map.get(row.level2)!;
    if (!l3Map.has(row.level3)) l3Map.set(row.level3, new Map());
    l3Map.get(row.level3)!.set(row.subject, row.count);
  }

  // Convert to nested structure
  const data = Array.from(level2Map.entries()).map(([level2, l3Map]) => ({
    name: level2,
    children: Array.from(l3Map.entries()).map(([level3, subjects]) => ({
      name: level3,
      children: Array.from(subjects.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([subject, count]) => ({ name: subject, value: count })),
    })),
  })).sort((a, b) => {
    const aTotal = a.children.reduce((s, c) => s + c.children.reduce((s2, c2) => s2 + c2.value, 0), 0);
    const bTotal = b.children.reduce((s, c) => s + c.children.reduce((s2, c2) => s2 + c2.value, 0), 0);
    return bTotal - aTotal;
  });

  return NextResponse.json({ data });
}
