import { Header } from "@/components/Header";
import { getCurrentUser } from "@/lib/auth";
import { fetchEntities } from "@/lib/entities";
import { EntityDashboard } from "@/components/EntityDashboard";
import Link from "next/link";
import { FileText, LogIn } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [user, entities] = await Promise.all([getCurrentUser(), fetchEntities()]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header user={user} entities={entities} />
      <main className="flex-1 bg-background px-6 py-8">
        <div className="mx-auto max-w-7xl">
          {user?.entity ? (
            <EntityDashboard entity={user.entity} userName={user.email} />
          ) : (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="max-w-md text-center">
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
                  <FileText className="h-8 w-8 text-un-blue" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900">
                  SG Reports Survey
                </h1>
                <p className="mt-3 text-gray-600">
                  {user ? (
                    <>
                      Select your entity to manage your Secretary-General reports
                      and complete surveys.
                    </>
                  ) : (
                    <>
                      Log in with your UN email to manage your entity&apos;s
                      Secretary-General reports and complete surveys.
                    </>
                  )}
                </p>
                <div className="mt-8 flex flex-col gap-3">
                  {!user && (
                    <Link
                      href="/login"
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-un-blue px-6 py-3 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
                    >
                      <LogIn className="h-4 w-4" />
                      Log In
                    </Link>
                  )}
                  <Link
                    href="/reports"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
                  >
                    <FileText className="h-4 w-4" />
                    Browse All Reports
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
