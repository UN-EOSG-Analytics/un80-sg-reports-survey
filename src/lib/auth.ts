// Public deployment stubs.
// The internal app uses a full auth implementation on the `main` branch.
// On `public-page` there is no sign-in: every consumer of these helpers
// gets null. Signatures preserved so existing call sites compile.

export interface CurrentUser {
  id: string;
  email: string;
  entity: string | null;
  role: "user" | "admin";
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  return null;
}

export async function getSession(): Promise<{ userId: string } | null> {
  return null;
}
