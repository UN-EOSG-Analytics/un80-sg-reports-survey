import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { EntityTableExport } from "@/components/EntityTableExport";
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

const STATUS_LABELS: Record<string, string> = {
  continue: "Continue",
  merge: "Merge",
  discontinue: "Discontinue",
};

const STATUS_COLORS: Record<string, string> = {
  continue: "bg-green-100 text-green-800",
  merge: "bg-yellow-100 text-yellow-800",
  discontinue: "bg-red-100 text-red-800",
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
      `SELECT status, COUNT(*) AS count
         FROM ${DB_SCHEMA}.survey_responses
         GROUP BY status
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
      return {
        entity,
        userCount: userCountMap.get(entity) ?? 0,
        suggestedReports: progress?.suggestedReports ?? 0,
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
    byStatus: statusRows.map((r) => ({
      status: r.status,
      count: parseInt(r.count),
    })),
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
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Survey Response Analysis
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Overview of survey response coverage across report groups and
              entities.
            </p>
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
              <div className="flex flex-wrap gap-3">
                {data.byStatus.map((s) => (
                  <div
                    key={s.status}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium ${STATUS_COLORS[s.status] ?? "bg-gray-100 text-gray-800"}`}
                  >
                    {STATUS_LABELS[s.status] ?? s.status}
                    <span className="font-bold">{s.count}</span>
                  </div>
                ))}
              </div>
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
                    title="Reports suggested to this entity (AI/DGACM/DRI)"
                  >
                    <div className="text-[10px] font-normal tracking-normal text-gray-400 normal-case">
                      Reports
                    </div>
                    Suggested
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
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
                            Responded
                          </span>
                        ) : e.confirmedReports > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                            In Progress
                          </span>
                        ) : e.suggestedReports > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
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
                        <span
                          className={
                            e.suggestedReports > 0
                              ? "text-gray-500"
                              : "text-gray-400"
                          }
                        >
                          {e.suggestedReports || "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span
                          className={
                            e.confirmedReports > 0
                              ? "font-medium text-gray-900"
                              : "text-gray-400"
                          }
                        >
                          {e.confirmedReports || "—"}
                        </span>
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
