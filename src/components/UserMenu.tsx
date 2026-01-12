"use client";
import { useRouter } from "next/navigation";

export function UserMenu({ email }: { email: string }) {
  const router = useRouter();
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-gray-500">{email}</span>
      <button onClick={handleLogout} className="text-gray-400 hover:text-gray-600 transition-colors">Logout</button>
    </div>
  );
}
