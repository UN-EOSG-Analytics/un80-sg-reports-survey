import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { EntityTableExport } from "@/components/EntityTableExport";
import { SurveyExportButton } from "@/components/SurveyExportButton";
import { getCurrentUser } from "@/lib/auth";
import { notAdminSQL } from "@/lib/config";
import { query } from "@/lib/db";
import { BarChart3, CheckCircle2, Circle, Clock, FileText, Users } from "lucide-react";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const DB_SCHEMA = process.env.DB_SCHEMA || "sg_reports_survey";

interface TotalRow {
  total_groups: string;
}
interface RespondedRow {
  responded_groups: string;
  total_responses: string;
}
interface StatusRow {
  status: string;
  count: string;
}
interface UserCountRow {
  entity: string;
  user_count: string;
}
interface TotalUsersRow {
  total_users: string;
}
interface ActiveUsersRow {
  active_users: string;
}
interface EntityProgressRow {
  entity: string;
  suggested_reports: string;
  confirmed_reports: string;
  reports_with_response: string;
  responding_users: string;
}
interface EntitySourceRow {
  entity: string;
  source: string;
  cnt: string;
}
interface FrequencyBreakdownRow {
  frequency: string | null;
  count: string;
}
interface FormatBreakdownRow {
  format: string | null;
  count: string;
}
interface WithCommentsRow {
  with_comments: string;
}
interface FreqDirectionRow {
  direction: string;
  count: string;
}

const STATUS_LABELS: Record<string, string> = {
  continue: "Continue as is",
  continue_with_changes: "Continue with changes",
  merge: "Merge",
  discontinue: "Discontinue",
};

const STATUS_COLORS: Record<string, string> = {
  continue: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  continue_with_changes: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  merge: "bg-slate-50 text-slate-600 ring-1 ring-slate-200",
  discontinue: "bg-rose-50 text-rose-600 ring-1 ring-rose-200",
};

const STATUS_BAR_COLORS: Record<string, string> = {
  continue: "bg-emerald-400",
  continue_with_changes: "bg-sky-400",
  merge: "bg-slate-400",
  discontinue: "bg-rose-400",
};

const STATUS_ORDER = ["continue", "continue_with_changes", "merge", "discontinue"];

const FREQUENCY_LABELS: Record<string, string> = {
  "multiple-per-year": "Multiple/year",
  annual: "Annual",
  biennial: "Biennial",
  triennial: "Triennial",
  quadrennial: "Quadrennial",
  "one-time": "One-time",
  __none__: "No change",
};

const FORMAT_LABELS: Record<string, string> = {
  shorter: "Shorter",
  oral: "Oral presentation",
  dashboard: "Dashboard",
  other: "Other format",
  "no-change": "No change",
  __none__: "No change",
};

async function getAnalysisData() {
  const [
    totalRows,
    respondedRows,
    statusRows,
    userCountRows,
    entityProgressRows,
    totalUsersRows,
    activeUsersRows,
    entitySourceRows,
    frequencyBreakdownRows,
    formatBreakdownRows,
    withCommentsRows,
    freqDirectionRows,
  ] = await Promise.all([
    query<TotalRow>(
      `SELECT COUNT(*) AS total_groups FROM ${DB_SCHEMA}.report_frequencies`,
    ),
    query<RespondedRow>(
      `SELECT
           COUNT(DISTINCT (proper_title, normalized_body)) AS responded_groups,
           COUNT(*) AS total_responses
         FROM ${DB_SCHEMA}.survey_responses`,
    ),
    query<StatusRow>(
      `SELECT
           CASE
             WHEN status = 'continue' AND (frequency IS NOT NULL OR format IS NOT NULL)
               THEN 'continue_with_changes'
             ELSE status
           END AS status,
           COUNT(*) AS count
         FROM ${DB_SCHEMA}.survey_responses
         GROUP BY 1
         ORDER BY count DESC`,
    ),
    // User counts per entity
    query<UserCountRow>(
      `SELECT entity, COUNT(*) AS user_count
         FROM ${DB_SCHEMA}.users u
         WHERE entity IS NOT NULL
           AND ${notAdminSQL()}
         GROUP BY entity`,
    ),
    // Per-entity progress: suggested vs confirmed vs responded
    // suggested_reports = reports suggested to this entity (from AI/DGACM/DRI)
    // confirmed_reports = reports the entity has confirmed (what they see in their dashboard)
    // reports_with_response = confirmed reports that have survey responses from this entity
    query<EntityProgressRow>(
      `WITH entity_suggested AS (
           -- Reports suggested to each entity
           SELECT DISTINCT
             entity,
             rf.proper_title,
             rf.normalized_body
           FROM ${DB_SCHEMA}.report_entities re
           CROSS JOIN LATERAL unnest(COALESCE(re.suggested_entities, ARRAY[]::text[])) AS entity
           JOIN ${DB_SCHEMA}.report_frequencies rf ON rf.proper_title = re.proper_title
         ),
         entity_confirmed AS (
           -- Reports confirmed by each entity (what they see in dashboard)
           SELECT DISTINCT
             entity,
             rf.proper_title,
             rf.normalized_body
           FROM ${DB_SCHEMA}.report_entities re
           CROSS JOIN LATERAL unnest(COALESCE(re.confirmed_entities, ARRAY[]::text[])) AS entity
           JOIN ${DB_SCHEMA}.report_frequencies rf ON rf.proper_title = re.proper_title
         ),
         entity_responses AS (
           SELECT DISTINCT
             user_entity AS entity,
             proper_title,
             normalized_body,
             responded_by_user_id
           FROM ${DB_SCHEMA}.survey_responses
         ),
         suggested_counts AS (
           SELECT entity, COUNT(DISTINCT (proper_title, normalized_body)) AS cnt
           FROM entity_suggested GROUP BY entity
         ),
         confirmed_counts AS (
           SELECT entity, COUNT(DISTINCT (proper_title, normalized_body)) AS cnt
           FROM entity_confirmed GROUP BY entity
         ),
         response_stats AS (
           SELECT
             ec.entity,
             COUNT(DISTINCT CASE WHEN er.proper_title IS NOT NULL THEN (ec.proper_title, ec.normalized_body) END) AS reports_with_response,
             COUNT(DISTINCT er.responded_by_user_id) AS responding_users
           FROM entity_confirmed ec
           LEFT JOIN entity_responses er
             ON er.entity = ec.entity
             AND er.proper_title = ec.proper_title
             AND er.normalized_body = ec.normalized_body
           GROUP BY ec.entity
         )
         SELECT
           COALESCE(sc.entity, cc.entity, rs.entity) AS entity,
           COALESCE(sc.cnt, 0) AS suggested_reports,
           COALESCE(cc.cnt, 0) AS confirmed_reports,
           COALESCE(rs.reports_with_response, 0) AS reports_with_response,
           COALESCE(rs.responding_users, 0) AS responding_users
         FROM suggested_counts sc
         FULL OUTER JOIN confirmed_counts cc ON sc.entity = cc.entity
         FULL OUTER JOIN response_stats rs ON COALESCE(sc.entity, cc.entity) = rs.entity
         ORDER BY confirmed_reports DESC, suggested_reports DESC, entity`,
    ),
    query<TotalUsersRow>(
      `SELECT COUNT(*) AS total_users FROM ${DB_SCHEMA}.users u WHERE ${notAdminSQL()}`,
    ),
    query<ActiveUsersRow>(
      `SELECT COUNT(DISTINCT responded_by_user_id) AS active_users FROM ${DB_SCHEMA}.survey_responses`,
    ),
    // Per-entity suggestion counts broken down by source (dgacm / dri / ai)
    query<EntitySourceRow>(
      `SELECT
           res.entity,
           res.source,
           COUNT(DISTINCT (rf.proper_title, rf.normalized_body)) AS cnt
         FROM ${DB_SCHEMA}.report_entity_suggestions res
         JOIN ${DB_SCHEMA}.report_frequencies rf ON rf.proper_title = res.proper_title
         GROUP BY res.entity, res.source`,
    ),
    // Frequency preferences for continue-with-changes responses only
    query<FrequencyBreakdownRow>(
      `SELECT COALESCE(frequency, '__none__') AS frequency, COUNT(*) AS count
         FROM ${DB_SCHEMA}.survey_responses
         WHERE status = 'continue' AND (frequency IS NOT NULL OR format IS NOT NULL)
         GROUP BY 1
         ORDER BY count DESC`,
    ),
    // Format preferences for continue-with-changes responses only
    query<FormatBreakdownRow>(
      `SELECT
           CASE WHEN format IS NULL OR format = 'no-change' THEN '__none__' ELSE format END AS format,
           COUNT(*) AS count
         FROM ${DB_SCHEMA}.survey_responses
         WHERE status = 'continue' AND (frequency IS NOT NULL OR format IS NOT NULL)
         GROUP BY 1
         ORDER BY count DESC`,
    ),
    // Responses with comments
    query<WithCommentsRow>(
      `SELECT COUNT(*) AS with_comments
         FROM ${DB_SCHEMA}.survey_responses
         WHERE comments IS NOT NULL AND TRIM(comments) != ''`,
    ),
    // Frequency directionality: compare preferred vs current frequency
    query<FreqDirectionRow>(
      `WITH freq_order(freq, ord) AS (
           VALUES
             ('multiple-per-year', 1),
             ('annual', 2),
             ('biennial', 3),
             ('triennial', 4),
             ('quadrennial', 5),
             ('one-time', 6)
         )
         SELECT
           CASE
             WHEN fo_pref.ord < fo_curr.ord THEN 'increase'
             WHEN fo_pref.ord > fo_curr.ord THEN 'decrease'
             ELSE 'same'
           END AS direction,
           COUNT(*) AS count
         FROM ${DB_SCHEMA}.survey_responses sr
         JOIN ${DB_SCHEMA}.report_frequencies rf
           ON rf.proper_title = sr.proper_title AND rf.normalized_body = sr.normalized_body
         JOIN freq_order fo_pref ON fo_pref.freq = sr.frequency
         JOIN freq_order fo_curr ON fo_curr.freq = rf.calculated_frequency
         WHERE sr.frequency IS NOT NULL
         GROUP BY 1
         ORDER BY 1`,
    ),
  ]);

  const totalGroups = parseInt(totalRows[0]?.total_groups ?? "0");
  const respondedGroups = parseInt(respondedRows[0]?.responded_groups ?? "0");
  const totalResponses = parseInt(respondedRows[0]?.total_responses ?? "0");
  const totalUsers = parseInt(totalUsersRows[0]?.total_users ?? "0");
  const activeUsers = parseInt(activeUsersRows[0]?.active_users ?? "0");
  const coveragePct =
    totalGroups > 0 ? Math.round((respondedGroups / totalGroups) * 100) : 0;

  // Index progress by entity
  const progressByEntity = new Map(
    entityProgressRows.map((r) => [
      r.entity,
      {
        suggestedReports: parseInt(r.suggested_reports),
        confirmedReports: parseInt(r.confirmed_reports),
        reportsWithResponse: parseInt(r.reports_with_response),
        respondingUsers: parseInt(r.responding_users),
      },
    ]),
  );

  // Index suggestion source counts by entity
  const sourceByEntity = new Map<string, { dgacm: number; dri: number; ai: number }>();
  for (const r of entitySourceRows) {
    if (!sourceByEntity.has(r.entity)) {
      sourceByEntity.set(r.entity, { dgacm: 0, dri: 0, ai: 0 });
    }
    const bucket = sourceByEntity.get(r.entity)!;
    if (r.source === "dgacm" || r.source === "dri" || r.source === "ai") {
      bucket[r.source] = parseInt(r.cnt);
    }
  }

  // Union of all entities from users table and those with assigned reports
  const allEntities = new Set([
    ...userCountRows.map((r) => r.entity),
    ...entityProgressRows.map((r) => r.entity),
  ]);
  const userCountMap = new Map(
    userCountRows.map((r) => [r.entity, parseInt(r.user_count)]),
  );

  const entities = Array.from(allEntities)
    .map((entity) => {
      const progress = progressByEntity.get(entity);
      const sources = sourceByEntity.get(entity) ?? { dgacm: 0, dri: 0, ai: 0 };
      return {
        entity,
        userCount: userCountMap.get(entity) ?? 0,
        suggestedReports: progress?.suggestedReports ?? 0,
        suggestedBySource: sources,
        confirmedReports: progress?.confirmedReports ?? 0,
        reportsWithResponse: progress?.reportsWithResponse ?? 0,
        respondingUsers: progress?.respondingUsers ?? 0,
      };
    })
    .sort(
      (a, b) =>
        b.confirmedReports - a.confirmedReports ||
        b.suggestedReports - a.suggestedReports ||
        a.entity.localeCompare(b.entity),
    );

  const entitiesResponded = entities.filter(
    (e) => e.reportsWithResponse > 0,
  ).length;
  // Has confirmed at least one report but submitted no responses yet
  const entitiesInProgress = entities.filter(
    (e) => e.confirmedReports > 0 && e.reportsWithResponse === 0,
  ).length;
  // Has suggestions but has not confirmed anything and has no responses
  const entitiesNotStarted = entities.filter(
    (e) =>
      e.suggestedReports > 0 &&
      e.confirmedReports === 0 &&
      e.reportsWithResponse === 0,
  ).length;

  const withComments = parseInt(withCommentsRows[0]?.with_comments ?? "0");

  const freqDirection = (["increase", "same", "decrease"] as const).map((dir) => ({
    direction: dir,
    count: parseInt(freqDirectionRows.find((r) => r.direction === dir)?.count ?? "0"),
  }));
  const totalFreqDirection = freqDirection.reduce((s, r) => s + r.count, 0);

  const frequencyBreakdown = frequencyBreakdownRows.map((r) => ({
    frequency: r.frequency ?? "__none__",
    count: parseInt(r.count),
  }));
  const totalContinueResponses = frequencyBreakdown.reduce((s, r) => s + r.count, 0);

  const formatBreakdown = formatBreakdownRows.map((r) => ({
    format: r.format ?? "__none__",
    count: parseInt(r.count),
  }));

  const byStatus = statusRows.map((r) => ({ status: r.status, count: parseInt(r.count) }));
  const byStatusOrdered = STATUS_ORDER
    .map((s) => byStatus.find((r) => r.status === s))
    .filter(Boolean) as { status: string; count: number }[];

  return {
    totalGroups,
    respondedGroups,
    totalResponses,
    totalUsers,
    activeUsers,
    coveragePct,
    entitiesResponded,
    entitiesInProgress,
    entitiesNotStarted,
    withComments,
    byStatus,
    byStatusOrdered,
    frequencyBreakdown,
    totalContinueResponses,
    formatBreakdown,
    freqDirection,
    totalFreqDirection,
    entities,
  };
}

export default async function AnalysisPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/");

  const data = await getAnalysisData();

  return (
    <div className="flex min-h-screen flex-col">
      <Header user={user} />
      <main className="flex-1 bg-gray-50 py-8">
        <div className="mx-auto max-w-7xl space-y-8 px-3 sm:px-4">
          {/* Page header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Survey Response Analysis
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Overview of survey response coverage across report groups and
                entities.
              </p>
            </div>
            <div className="shrink-0 pt-1">
              <SurveyExportButton />
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard
              icon={<FileText className="h-5 w-5 text-un-blue" />}
              label="Total Report Groups"
              value={data.totalGroups}
              sub="unique report (series) title / UN body combinations"
            />
            <StatCard
              icon={<CheckCircle2 className="h-5 w-5 text-un-blue" />}
              label="Groups with Response"
              value={data.respondedGroups}
              sub="have at least one survey response"
            />
            <StatCard
              icon={<BarChart3 className="h-5 w-5 text-un-blue" />}
              label="Coverage"
              value={`${data.coveragePct}%`}
              sub="of report groups covered"
            />
            <StatCard
              icon={<Users className="h-5 w-5 text-un-blue" />}
              label="Total Responses"
              value={data.totalResponses}
              sub="individual survey submissions"
            />
            <StatCard
              icon={<Users className="h-5 w-5 text-un-blue" />}
              label="Users Signed In"
              value={data.totalUsers}
              sub="registered non-admin users"
            />
            <StatCard
              icon={<CheckCircle2 className="h-5 w-5 text-green-600" />}
              label="Users Active"
              value={data.activeUsers}
              sub="submitted at least one response"
            />
            <StatCard
              icon={<CheckCircle2 className="h-5 w-5 text-green-600" />}
              label="Entities Responded"
              value={data.entitiesResponded}
              sub="submitted at least one response"
            />
            <StatCard
              icon={<Clock className="h-5 w-5 text-un-blue" />}
              label="Entities In Progress"
              value={data.entitiesInProgress}
              sub="confirmed, no responses yet"
            />
            <StatCard
              icon={<Circle className="h-5 w-5 text-amber-500" />}
              label="Entities Not Started"
              value={data.entitiesNotStarted}
              sub="suggested, nothing confirmed"
            />
          </div>

          {/* Coverage bar */}
          <div className="rounded-lg border border-un-blue/20 bg-gradient-to-br from-un-blue/5 to-white p-6">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-un-blue/70">
                  Response Coverage
                </p>
                <p className="mt-0.5 text-4xl font-bold text-un-blue">
                  {data.coveragePct}%
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-gray-800">
                  {data.respondedGroups}
                  <span className="text-base font-normal text-gray-400">
                    {" "}
                    / {data.totalGroups}
                  </span>
                </p>
                <p className="text-xs text-gray-400">report groups covered</p>
              </div>
            </div>
            <div className="h-4 w-full overflow-hidden rounded-full bg-un-blue/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-un-blue to-sky-400 shadow-sm transition-all duration-700"
                style={{ width: `${data.coveragePct}%` }}
              />
            </div>
            <p className="mt-3 text-xs text-gray-400">
              {data.totalGroups - data.respondedGroups} report groups still
              awaiting a response
            </p>
          </div>

          {/* By status */}
          {data.byStatus.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="mb-4 text-sm font-semibold text-gray-900">
                Responses by Recommendation
              </h2>

              {/* Stacked proportion bar */}
              <div className="mb-4 flex h-5 w-full overflow-hidden rounded-full bg-gray-100">
                {data.byStatusOrdered.map((s) => (
                  <div
                    key={s.status}
                    className={`h-full transition-all ${STATUS_BAR_COLORS[s.status] ?? "bg-gray-400"}`}
                    style={{ width: `${(s.count / data.totalResponses) * 100}%` }}
                    title={`${STATUS_LABELS[s.status] ?? s.status}: ${s.count} (${Math.round((s.count / data.totalResponses) * 100)}%)`}
                  />
                ))}
              </div>

              {/* Pills with counts and percentages */}
              <div className="flex flex-wrap gap-3">
                {data.byStatusOrdered.map((s) => (
                  <div
                    key={s.status}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium ${STATUS_COLORS[s.status] ?? "bg-gray-100 text-gray-800"}`}
                  >
                    {STATUS_LABELS[s.status] ?? s.status}
                    <span className="font-bold">{s.count}</span>
                    <span className="opacity-50 text-xs">
                      {Math.round((s.count / data.totalResponses) * 100)}%
                    </span>
                  </div>
                ))}
              </div>

              {/* Comments note */}
              {data.withComments > 0 && (
                <p className="mt-3 text-xs text-gray-400">
                  <span className="font-medium text-gray-600">{data.withComments}</span> of{" "}
                  {data.totalResponses} responses include written comments (
                  {Math.round((data.withComments / data.totalResponses) * 100)}%)
                </p>
              )}

              {/* Frequency / direction / format sub-breakdowns */}
              {data.totalContinueResponses > 0 && (
                <div className="mt-5 border-t border-gray-100 pt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
                  {/* Frequency preference */}
                  <div>
                    <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Frequency preference
                      <span className="ml-1.5 font-normal normal-case tracking-normal text-gray-300">
                        (continue with changes)
                      </span>
                    </p>
                    <div className="space-y-1.5">
                      {data.frequencyBreakdown.map((f) => (
                        <div key={f.frequency} className="flex items-center gap-2">
                          <div className="w-28 shrink-0 truncate text-xs text-gray-600">
                            {FREQUENCY_LABELS[f.frequency] ?? f.frequency}
                          </div>
                          <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100">
                            <div
                              className={`h-full rounded-full ${f.frequency === "__none__" ? "bg-slate-200" : "bg-sky-400"}`}
                              style={{ width: `${Math.round((f.count / data.totalContinueResponses) * 100)}%` }}
                            />
                          </div>
                          <div className="w-14 shrink-0 text-right text-xs text-gray-400">
                            {f.count}
                            <span className="ml-1 text-gray-300">
                              ({Math.round((f.count / data.totalContinueResponses) * 100)}%)
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Frequency direction */}
                  {data.totalFreqDirection > 0 && (
                    <div>
                      <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
                        Frequency direction
                        <span className="ml-1.5 font-normal normal-case tracking-normal text-gray-300">
                          vs. current
                        </span>
                      </p>
                      <div className="space-y-1.5">
                        {data.freqDirection.map((d) => {
                          const cfg = {
                            increase: { label: "↑ More frequent", color: "bg-emerald-400" },
                            same:     { label: "→ Same",          color: "bg-slate-300"   },
                            decrease: { label: "↓ Less frequent", color: "bg-rose-400"    },
                          }[d.direction];
                          return (
                            <div key={d.direction} className="flex items-center gap-2">
                              <div className="w-28 shrink-0 text-xs text-gray-600">{cfg.label}</div>
                              <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100">
                                <div
                                  className={`h-full rounded-full ${cfg.color}`}
                                  style={{ width: `${Math.round((d.count / data.totalFreqDirection) * 100)}%` }}
                                />
                              </div>
                              <div className="w-14 shrink-0 text-right text-xs text-gray-400">
                                {d.count}
                                <span className="ml-1 text-gray-300">
                                  ({Math.round((d.count / data.totalFreqDirection) * 100)}%)
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Format preference */}
                  <div>
                    <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Format preference
                      <span className="ml-1.5 font-normal normal-case tracking-normal text-gray-300">
                        (continue with changes)
                      </span>
                    </p>
                    <div className="space-y-1.5">
                      {data.formatBreakdown.map((f) => (
                        <div key={f.format} className="flex items-center gap-2">
                          <div className="w-28 shrink-0 truncate text-xs text-gray-600">
                            {FORMAT_LABELS[f.format] ?? f.format}
                          </div>
                          <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100">
                            <div
                              className={`h-full rounded-full ${f.format === "__none__" ? "bg-slate-200" : "bg-sky-400"}`}
                              style={{ width: `${Math.round((f.count / data.totalContinueResponses) * 100)}%` }}
                            />
                          </div>
                          <div className="w-14 shrink-0 text-right text-xs text-gray-400">
                            {f.count}
                            <span className="ml-1 text-gray-300">
                              ({Math.round((f.count / data.totalContinueResponses) * 100)}%)
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* Entity table */}
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-gray-900">
                Entity Progress
              </h2>
              <EntityTableExport entities={data.entities} />
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs tracking-wide text-gray-500 uppercase">
                  <th className="px-5 py-3 font-medium">Entity</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th
                    className="px-5 py-3 text-right font-medium"
                    title="Total registered users"
                  >
                    <div className="text-[10px] font-normal tracking-normal text-gray-400 normal-case">
                      Users
                    </div>
                    Signed in
                  </th>
                  <th
                    className="px-5 py-3 text-right font-medium"
                    title="Users who have submitted responses"
                  >
                    <div className="text-[10px] font-normal tracking-normal text-gray-400 normal-case">
                      Users
                    </div>
                    Active
                  </th>
                  <th
                    className="px-5 py-3 text-right font-medium"
                    title="Reports suggested to this entity — broken down by source (DGACM / DRI / AI)"
                  >
                    <div className="text-[10px] font-normal tracking-normal text-gray-400 normal-case">
                      Reports
                    </div>
                    Suggested
                    <div className="mt-0.5 flex justify-end gap-1 text-[9px] font-normal normal-case tracking-normal text-gray-400">
                      <span>DGACM</span>
                      <span>·</span>
                      <span>DRI</span>
                      <span>·</span>
                      <span>AI</span>
                    </div>
                  </th>
                  <th
                    className="px-5 py-3 text-right font-medium"
                    title="Reports confirmed by this entity (shown in their dashboard)"
                  >
                    <div className="text-[10px] font-normal tracking-normal text-gray-400 normal-case">
                      Reports
                    </div>
                    Confirmed
                  </th>
                  <th
                    className="px-5 py-3 font-medium"
                    title="Survey responses submitted / Confirmed reports"
                  >
                    <div className="text-[10px] font-normal tracking-normal text-gray-400 normal-case">
                      Responses
                    </div>
                    Progress on Confirmed
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.entities.map((e) => {
                  const pct =
                    e.confirmedReports > 0
                      ? Math.round(
                          (e.reportsWithResponse / e.confirmedReports) * 100,
                        )
                      : 0;
                  return (
                    <tr
                      key={e.entity}
                      className="transition-colors hover:bg-gray-50"
                    >
                      <td className="px-5 py-3 font-medium text-gray-900">
                        {e.entity}
                      </td>
                      <td className="px-5 py-3">
                        {e.reportsWithResponse > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                            Responded
                          </span>
                        ) : e.confirmedReports > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 ring-1 ring-sky-200">
                            In Progress
                          </span>
                        ) : e.suggestedReports > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                            Not Started
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span
                          className={
                            e.userCount > 0 ? "text-gray-900" : "text-gray-400"
                          }
                        >
                          {e.userCount || "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span
                          className={
                            e.respondingUsers > 0
                              ? "font-medium text-gray-900"
                              : "text-gray-400"
                          }
                        >
                          {e.respondingUsers || "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {e.suggestedReports > 0 ? (
                          <>
                            <span className="font-medium text-gray-900">{e.suggestedReports}</span>
                            <div className="mt-0.5 flex justify-end gap-1 text-[10px] text-gray-400">
                              <span>{e.suggestedBySource.dgacm || "—"}</span>
                              <span>·</span>
                              <span>{e.suggestedBySource.dri || "—"}</span>
                              <span>·</span>
                              <span>{e.suggestedBySource.ai || "—"}</span>
                            </div>
                          </>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {e.confirmedReports > 0 ? (
                          <>
                            <span className="font-medium text-gray-900">{e.confirmedReports}</span>
                            {e.suggestedReports > 0 && (
                              <div className="mt-0.5 text-[10px] text-gray-400">
                                {Math.round((e.confirmedReports / e.suggestedReports) * 100)}%
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {e.confirmedReports > 0 ? (
                          <div className="flex items-center gap-3">
                            <div className="h-2 min-w-20 flex-1 overflow-hidden rounded-full bg-gray-100">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  pct === 100 ? "bg-green-500" : "bg-un-blue"
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="w-16 text-xs text-gray-500">
                              {e.reportsWithResponse} / {e.confirmedReports}
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {data.entities.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-8 text-center text-sm text-gray-400"
                    >
                      No entities with user accounts found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-5 py-4">
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <span className="text-sm font-medium text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}
