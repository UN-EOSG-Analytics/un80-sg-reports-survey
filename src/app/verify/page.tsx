"use client";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import { EntitySearch } from "@/components/EntitySearch";

function VerifyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState("");
  const [hasExistingEntity, setHasExistingEntity] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setChecking(false); return; }
    fetch("/api/auth/check-entity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error);
        else { setUserEmail(data.email); setHasExistingEntity(data.hasEntity); if (data.entity) setSelectedEntity(data.entity); }
        setChecking(false);
      })
      .catch(() => { setError("Failed to verify token"); setChecking(false); });
  }, [token]);

  const handleVerify = async () => {
    if (!token) return;
    const entity = hasExistingEntity ? undefined : selectedEntity.trim();
    if (!hasExistingEntity && !entity) { setError("Please select your entity"); return; }
    setLoading(true);
    const res = await fetch("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, entity }) });
    if (res.ok) router.push("/");
    else { const data = await res.json(); setError(data.error || "Verification failed"); setLoading(false); }
  };

  if (!token) return <p className="text-red-600">Missing verification token.</p>;
  if (checking) return <p className="text-gray-500">Verifying...</p>;

  if (hasExistingEntity) return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">Signing in as <span className="font-medium">{userEmail}</span></p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button onClick={handleVerify} disabled={loading} className="w-full rounded-lg bg-un-blue px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
        {loading ? "Signing in..." : "Complete Sign In"}
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      {userEmail && <p className="text-sm text-gray-600">Signing in as <span className="font-medium">{userEmail}</span></p>}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">Select your entity</label>
        <EntitySearch value={selectedEntity} onChange={setSelectedEntity} placeholder="Search or enter entity..." />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button onClick={handleVerify} disabled={loading || !selectedEntity.trim()} className="w-full rounded-lg bg-un-blue px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
        {loading ? "Signing in..." : "Complete Sign In"}
      </button>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white">
      <div className="w-full max-w-xs px-6">
        <h1 className="mb-6 text-xl font-bold text-gray-900">Complete Sign In</h1>
        <Suspense fallback={<p className="text-gray-500">Loading...</p>}><VerifyContent /></Suspense>
      </div>
    </main>
  );
}
