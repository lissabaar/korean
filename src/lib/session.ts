import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

/** Current session, or null. Safe to call anywhere on the server. */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/**
 * For route handlers. Returns the user id or null — callers decide the
 * status code, since an API should answer 401 rather than redirect.
 */
export async function getUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.user.id ?? null;
}

/**
 * For pages. Sends anyone without a session to the sign-in screen.
 */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session.user;
}
