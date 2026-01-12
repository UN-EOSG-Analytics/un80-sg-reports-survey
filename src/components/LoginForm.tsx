"use client";
import { useState } from "react";

interface Props {
  onSuccess?: (email: string) => void;
  compact?: boolean;
  centered?: boolean;
}

export function LoginForm({ onSuccess, compact, centered }: Props) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    const res = await fetch("/api/auth/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    if (res.ok) { setStatus("sent"); onSuccess?.(email); }
    else { const data = await res.json(); setErrorMsg(data.error || "Something went wrong"); setStatus("error"); }
  }

  if (status === "sent") {
    return (
      <div className="rounded-lg bg-green-50 p-4 text-center text-green-800">
        <p className="font-medium">Check your email</p>
        <p className="mt-1 text-sm">We sent a sign-in link to {email}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={compact ? "flex gap-2" : "space-y-4"}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="your.name@un.org"
        required
        className={`rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-un-blue focus:outline-none focus:ring-1 focus:ring-un-blue ${compact ? "flex-1" : "w-full"}`}
      />
      {status === "error" && <p className="text-sm text-red-600">{errorMsg}</p>}
      {centered && !compact ? (
        <div className="flex justify-center">
          <button type="submit" disabled={status === "loading"} className="rounded-lg bg-un-blue px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-un-blue/90 disabled:opacity-50">
            {status === "loading" ? "Sending..." : "Send sign-in link"}
          </button>
        </div>
      ) : (
        <button type="submit" disabled={status === "loading"} className="rounded-lg bg-un-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-un-blue/90 disabled:opacity-50 whitespace-nowrap">
          {status === "loading" ? "Sending..." : compact ? "Send link" : "Send sign-in link"}
        </button>
      )}
    </form>
  );
}
