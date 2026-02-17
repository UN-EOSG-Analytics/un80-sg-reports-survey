import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CheckCircle2, FileText, Users, BarChart3 } from "lucide-react";

export const dynamic = "force-dynamic";

const DB_SCHEMA = process.env.DB_SCHEMA || "sg_reports_survey";

interface TotalRow { total_groups: string }
interface RespondedRow { responded_groups: string; total_responses: string }
interface StatusRow { status: string; count: string }
interface UserCountRow { entity: string; user_count: string }
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
  const [totalRows, respondedRows, statusRows, userCountRows, entityProgressRows] =
    await Promise.all([
      query<TotalRow>(
        `SELECT COUNT(*) AS total_groups FROM ${DB_SCHEMA}.report_frequencies`
      ),
      query<RespondedRow>(
        `SELECT
           COUNT(DISTINCT (proper_title, normalized_body)) AS responded_groups,
           COUNT(*) AS total_responses
         FROM ${DB_SCHEMA}.survey_responses`
      ),
      query<StatusRow>(
        `SELECT status, COUNT(*) AS count
         FROM ${DB_SCHEMA}.survey_responses
         GROUP BY status
         ORDER BY count DESC`
      ),
      // User counts per entity
      query<UserCountRow>(
        `SELECT entity, COUNT(*) AS user_count
         FROM ${DB_SCHEMA}.users
         WHERE entity IS NOT NULL AND role != 'admin'
         GROUP BY entity`
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
         ORDER BY confirmed_reports DESC, suggested_reports DESC, entity`
      ),
    ]);

  const totalGroups = parseInt(totalRows[0]?.total_groups ?? "0");
  const respondedGroups = parseInt(respondedRows[0]?.responded_groups ?? "0");
  const totalResponses = parseInt(respondedRows[0]?.total_responses ?? "0");
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
    ])
  );

  // Union of all entities from users table and those with assigned reports
  const allEntities = new Set([
    ...userCountRows.map((r) => r.entity),
    ...entityProgressRows.map((r) => r.entity),
  ]);
  const userCountMap = new Map(
    userCountRows.map((r) => [r.entity, parseInt(r.user_count)])
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
        a.entity.localeCompare(b.entity)
    );

  return {
    totalGroups,
    respondedGroups,
    totalResponses,
    coveragePct,
    byStatus: statusRows.map((r) => ({ status: r.status, count: parseInt(r.count) })),
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
        <div className="mx-auto max-w-7xl px-3 sm:px-4 space-y-8">

          {/* Page header */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Survey Response Analysis</h1>
            <p className="mt-1 text-sm text-gray-500">
              Overview of survey response coverage across report groups and entities.
            </p>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              icon={<FileText className="h-5 w-5 text-un-blue" />}
              label="Total Report Groups"
              value={data.totalGroups}
            />
            <StatCard
              icon={<CheckCircle2 className="h-5 w-5 text-un-blue" />}
              label="Groups with Response"
              value={data.respondedGroups}
              sub={`of ${data.totalGroups}`}
            />
            <StatCard
              icon={<BarChart3 className="h-5 w-5 text-un-blue" />}
              label="Coverage"
              value={`${data.coveragePct}%`}
            />
            <StatCard
              icon={<Users className="h-5 w-5 text-un-blue" />}
              label="Total Responses"
              value={data.totalResponses}
            />
          </div>

          {/* Coverage bar */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-700">Response Coverage</p>
              <p className="text-sm text-gray-500">
                {data.respondedGroups} / {data.totalGroups} report groups
              </p>
            </div>
            <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-un-blue transition-all"
                style={{ width: `${data.coveragePct}%` }}
              />
            </div>
          </div>

          {/* By status */}
          {data.byStatus.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Responses by Recommendation</h2>
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
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Entity Progress</h2>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-5 py-3 font-medium">Entity</th>
                  <th className="px-5 py-3 font-medium text-right" title="Total registered users">
                    <div className="text-[10px] text-gray-400 font-normal normal-case tracking-normal">Users</div>
                    Signed in
                  </th>
                  <th className="px-5 py-3 font-medium text-right" title="Users who have submitted responses">
                    <div className="text-[10px] text-gray-400 font-normal normal-case tracking-normal">Users</div>
                    Active
                  </th>
                  <th className="px-5 py-3 font-medium text-right" title="Reports suggested to this entity (AI/DGACM/DRI)">
                    <div className="text-[10px] text-gray-400 font-normal normal-case tracking-normal">Reports</div>
                    Suggested
                  </th>
                  <th className="px-5 py-3 font-medium text-right" title="Reports confirmed by this entity (shown in their dashboard)">
                    <div className="text-[10px] text-gray-400 font-normal normal-case tracking-normal">Reports</div>
                    Confirmed
                  </th>
                  <th className="px-5 py-3 font-medium" title="Survey responses submitted / Confirmed reports">
                    <div className="text-[10px] text-gray-400 font-normal normal-case tracking-normal">Responses</div>
                    Progress on Confirmed
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.entities.map((e) => {
                  const pct = e.confirmedReports > 0 
                    ? Math.round((e.reportsWithResponse / e.confirmedReports) * 100) 
                    : 0;
                  return (
                    <tr key={e.entity} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 font-medium text-gray-900">{e.entity}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={e.userCount > 0 ? "text-gray-900" : "text-gray-400"}>
                          {e.userCount || "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className={e.respondingUsers > 0 ? "text-gray-900 font-medium" : "text-gray-400"}>
                          {e.respondingUsers || "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className={e.suggestedReports > 0 ? "text-gray-500" : "text-gray-400"}>
                          {e.suggestedReports || "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className={e.confirmedReports > 0 ? "text-gray-900 font-medium" : "text-gray-400"}>
                          {e.confirmedReports || "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {e.confirmedReports > 0 ? (
                          <div className="flex items-center gap-3">
                            <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden min-w-20">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  pct === 100 ? "bg-green-500" : "bg-un-blue"
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500 w-16">
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
                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-gray-400">
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
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-sm text-gray-500 font-medium">{label}</span></div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
