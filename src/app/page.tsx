import { Header } from "@/components/Header";
import { getCurrentUser } from "@/lib/auth";
import { SGReportsList } from "@/components/SGReportsList";

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <Header user={user} />

        <section className="mt-10">
          <h2 className="mb-6 text-2xl font-bold text-foreground">Secretary-General&apos;s Reports</h2>
          <SGReportsList userEntity={user?.entity} />
        </section>
      </div>
    </main>
  );
}
