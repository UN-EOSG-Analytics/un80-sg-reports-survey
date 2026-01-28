import { Header } from "@/components/Header";
import { getCurrentUser } from "@/lib/auth";
import { fetchEntities } from "@/lib/entities";
import { SGReportsList } from "@/components/SGReportsList";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [user, entities] = await Promise.all([getCurrentUser(), fetchEntities()]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header user={user} entities={entities} />
      <main className="flex-1 bg-background px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <section>
            <h2 className="mb-6 text-2xl font-bold text-foreground">Secretary-General&apos;s Reports</h2>
            <SGReportsList userEntity={user?.entity} />
          </section>
        </div>
      </main>
    </div>
  );
}
