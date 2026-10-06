"use client";

/**
 * Better Auth's browser client: signIn, signUp, signOut, useSession for the
 * React components. The anonymous plugin lets a visitor start without an
 * account. Its server counterpart is auth.ts.
 */

import { anonymousClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({ plugins: [anonymousClient()] });

export const { signIn, signUp, signOut, useSession } = authClient;
