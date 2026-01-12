import { NextResponse } from "next/server";
import { verifyMagicToken, upsertUser, createSession } from "@/lib/auth";

export async function POST(request: Request) {
  const { token, entity } = await request.json();
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  const email = await verifyMagicToken(token);
  if (!email) return NextResponse.json({ error: "Invalid or expired link" }, { status: 400 });
  const userId = await upsertUser(email, entity);
  await createSession(userId);
  return NextResponse.json({ ok: true });
}
