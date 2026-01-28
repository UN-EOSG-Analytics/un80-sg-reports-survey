"use client";

import { useState } from "react";
import { requestMagicLinkAction } from "@/lib/actions";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    const result = await requestMagicLinkAction(email);
    if (result.success) {
      setStatus("sent");
    } else {
      setErrorMsg(result.error);
      setStatus("error");
    }
  }

  return (
    <div className="w-full max-w-sm">
      <h2 className="mb-2 text-xl font-semibold text-foreground">Sign In</h2>
      <p className="mb-6 text-sm text-gray-500">Enter your email address to receive a sign-in link</p>
      {status === "sent" ? (
        <div className="rounded-lg bg-green-50 p-4 text-green-800">
          <p className="font-medium">Please check your e-mail</p>
          <p className="mt-1 text-sm">We have sent a sign-in link to {email}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your.name@un.org"
            required
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-un-blue focus:ring-1 focus:ring-un-blue focus:outline-none"
          />
          {status === "error" && <p className="text-sm text-red-600">{errorMsg}</p>}
          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full rounded-lg bg-un-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-un-blue/90 disabled:opacity-50"
          >
            {status === "loading" ? "Sending..." : "Send sign-in link"}
          </button>
        </form>
      )}
    </div>
  );
}
