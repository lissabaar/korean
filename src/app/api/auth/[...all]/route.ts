/**
 * /api/auth/* — every authentication endpoint (sign-up, sign-in, sign-out,
 * session, Google OAuth callback, anonymous sign-in).
 *
 * Next.js route handler: an HTTP API endpoint. The folder path is the URL;
 * each exported function (GET, POST, PATCH, DELETE) handles that HTTP method.
 * Runs on the server only, so it may use secret keys and the database.
 *
 * "[...all]" is a catch-all segment: this one file answers /api/auth/anything.
 * Better Auth (configured in lib/auth.ts) does all the work; this file only
 * plugs it into Next.js.
 */

import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// Handles sign-up, sign-in, sign-out, session and verification endpoints.
export const { GET, POST } = toNextJsHandler(auth);
