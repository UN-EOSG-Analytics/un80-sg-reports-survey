import { NextResponse } from "next/server";
import { verifyMagicToken, upsertUser, createSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { tables } from "@/lib/config";

export async function POST(request: Request) {
  const { token, entity } = await request.json();
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  const email = await verifyMagicToken(token);
  if (!email) return NextResponse.json({ error: "Invalid or expired link" }, { status: 400 });
  
  // Check if user already exists and has an entity
  const existingUser = await query<{ id: string; entity: string | null }>(
    `SELECT id, entity FROM ${tables.users} WHERE email = $1`,
    [email.toLowerCase()]
  );
  
  const hasExistingEntity = !!existingUser[0]?.entity;
  
  // For new users without entity, entity is required
  if (!hasExistingEntity && (!entity || typeof entity !== "string" || !entity.trim())) {
    return NextResponse.json({ error: "Entity is required" }, { status: 400 });
  }
  
  const userId = await upsertUser(email);
  
  // Only set entity for users without one (entity is locked after first set)
  if (!hasExistingEntity && entity && typeof entity === "string" && entity.trim()) {
    await query(`UPDATE ${tables.users} SET entity = $1 WHERE id = $2`, [entity.trim(), userId]);
  }
  
  await createSession(userId);
  return NextResponse.json({ ok: true });
}
