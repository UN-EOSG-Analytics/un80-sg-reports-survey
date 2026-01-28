"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  isAllowedDomain,
  createMagicToken,
  verifyMagicToken,
  upsertUser,
  createSession,
  clearSession,
  getCurrentUser,
  recentTokenExists,
} from "./auth";
import { sendMagicLink } from "./mail";
import { query } from "./db";
import { tables } from "./config";

type ActionResult<T = void> = { success: true; data?: T } | { success: false; error: string };

export async function requestMagicLinkAction(email: string): Promise<ActionResult> {
  if (!email || typeof email !== "string" || !email.trim()) {
    return { success: false, error: "Email required" };
  }
  const trimmedEmail = email.trim();
  if (!(await isAllowedDomain(trimmedEmail))) {
    return { success: false, error: "Email domain not allowed" };
  }
  if (await recentTokenExists(trimmedEmail)) {
    return { success: false, error: "A magic link was recently sent. Please check your email or wait a few minutes." };
  }
  try {
    const token = await createMagicToken(trimmedEmail);
    await sendMagicLink(trimmedEmail, token);
    return { success: true };
  } catch (error) {
    console.error("Error sending magic link:", error);
    return { success: false, error: "Failed to send email. Please try again." };
  }
}

export async function checkEntityForTokenAction(
  token: string
): Promise<ActionResult<{ email: string; hasEntity: boolean; entity: string | null }>> {
  if (!token || typeof token !== "string") {
    return { success: false, error: "Missing token" };
  }
  const tokenRows = await query<{ email: string }>(
    `SELECT email FROM ${tables.magic_tokens} WHERE token = $1 AND expires_at > NOW() AND used_at IS NULL`,
    [token]
  );
  if (!tokenRows[0]) {
    return { success: false, error: "Invalid or expired token" };
  }
  const email = tokenRows[0].email;
  const userRows = await query<{ entity: string | null }>(
    `SELECT entity FROM ${tables.users} WHERE email = $1`,
    [email.toLowerCase()]
  );
  const existingEntity = userRows[0]?.entity || null;
  return { success: true, data: { email, hasEntity: !!existingEntity, entity: existingEntity } };
}

export async function verifyMagicTokenAction(token: string, entity?: string): Promise<ActionResult> {
  if (!token || typeof token !== "string") {
    return { success: false, error: "Missing token" };
  }
  const email = await verifyMagicToken(token);
  if (!email) {
    return { success: false, error: "Invalid or expired link" };
  }
  const userId = await upsertUser(email);
  if (entity && typeof entity === "string" && entity.trim()) {
    await query(`UPDATE ${tables.users} SET entity = $1 WHERE id = $2`, [entity.trim(), userId]);
  }
  await createSession(userId);
  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateEntityAction(entity: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Unauthorized" };
  }
  if (!entity || typeof entity !== "string" || !entity.trim()) {
    return { success: false, error: "Entity is required" };
  }
  await query(`UPDATE ${tables.users} SET entity = $1 WHERE id = $2`, [entity.trim(), user.id]);
  revalidatePath("/", "layout");
  return { success: true };
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/about");
}
