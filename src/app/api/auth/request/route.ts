import { NextResponse } from "next/server";
import { isValidUnEmail, createMagicToken } from "@/lib/auth";
import { sendMagicLink } from "@/lib/mail";

export async function POST(request: Request) {
  let email: unknown;
  try {
    ({ email } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!email || typeof email !== "string") return NextResponse.json({ error: "Email required" }, { status: 400 });
  if (!isValidUnEmail(email)) return NextResponse.json({ error: "Only @un.org emails allowed" }, { status: 403 });
  const token = await createMagicToken(email);
  await sendMagicLink(email, token);
  return NextResponse.json({ ok: true });
}
