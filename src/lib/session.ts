/**
 * Who is making this request — server-side helpers around Better Auth.
 *
 *   getSession()   the session or null (cached per request)
 *   getUserId()    for API routes: the user id or null (the route answers 401)
 *   currentUser()  for pages: the user or null (first visit, see (app)/layout)
 */

import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "./auth";

/**
 * Current session, or null. Safe to call anywhere on the server; cached per
 * request, so the layout and the page share one lookup.
 */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/**
 * For route handlers. Returns the user id or null — callers decide the
 * status code, since an API should answer 401 rather than redirect.
 */
export async function getUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.user.id ?? null;
}

/**
 * For pages in the (app) group. Null only on a visitor's very first load:
 * the layout then starts an anonymous session in the browser and reloads,
 * so pages simply render nothing in that moment.
 */
export async function currentUser() {
  const session = await getSession();
  return session?.user ?? null;
}
