import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { getCurrentUser } from "@/lib/auth";
import { ReportsTable } from "@/components/SGReportsList";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-screen flex-col">
      <Header user={user} />
      <main className="flex-1 bg-background px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <section>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-foreground">
                All Secretary-General&apos;s Reports
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Data from the{" "}
                <a
                  href="https://digitallibrary.un.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-un-blue hover:underline"
                >
                  UN Digital Library
                </a>{" "}
                (2023 to present)
              </p>
            </div>
            <ReportsTable mode="all" userEntity={user?.entity} userEmail={user?.email} userRole={user?.role} />
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
