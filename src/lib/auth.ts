/**
 * Authentication.
 *
 * Better Auth rather than NextAuth: as of 2026 the Auth.js project has
 * merged into Better Auth and its own maintainers point new projects here.
 * next-auth v5 is also still published as a beta.
 *
 * Sessions live in our own Postgres via the Prisma adapter, so there is no
 * third party holding user records.
 *
 * The Session, Account and Verification models are NOT written by hand —
 * run `npx auth generate` to emit the ones matching the
 * installed version, then `npx prisma migrate dev`. Hand-written copies
 * drift from what the library expects and fail in confusing ways.
 */

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { anonymous } from "better-auth/plugins";
import { prisma } from "./db";
import { moveAnonymousData } from "./words/merge-anonymous";

/**
 * Origins allowed to call the auth endpoints. Better Auth rejects any other
 * with "Invalid origin". BETTER_AUTH_URL covers the main address; the Vercel
 * variables cover the production domain and per-deployment preview URLs, so
 * a wrong or stale BETTER_AUTH_URL cannot lock everyone out.
 */
export const googleEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);

const trustedOrigins = [
  process.env.BETTER_AUTH_URL,
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
  process.env.VERCEL_BRANCH_URL,
  process.env.VERCEL_URL,
]
  .filter((value): value is string => Boolean(value))
  .map((value) => (value.startsWith("http") ? value : `https://${value}`).replace(/\/+$/, ""));

/**
 * The site's own address — used for OAuth redirect URIs, so it must be the
 * public one. On Vercel production it comes from Vercel itself, so a
 * BETTER_AUTH_URL copied from a local .env (localhost) cannot send Google
 * sign-ins back to someone's laptop.
 */
const baseURL =
  process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.BETTER_AUTH_URL;

export const auth = betterAuth({
  baseURL,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  trustedOrigins,

  // Google sign-in, switched on only when its keys are configured. The
  // redirect URI to register in Google Cloud is
  //   <site>/api/auth/callback/google
  socialProviders: googleEnabled
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        },
      }
    : {},

  // Signing in with Google using the email of an existing password account
  // joins the two instead of failing. Google has verified the address.
  account: {
    accountLinking: { enabled: true, trustedProviders: ["google"] },
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    // Verification needs a mail provider. Left off so the app runs with no
    // external services; turn it on before this is reachable from outside.
    requireEmailVerification: false,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },

  user: {
    // App-specific columns on the user row. Declared here so Better Auth
    // knows about them; they still need to exist in schema.prisma.
    additionalFields: {
      explanationLang: { type: "string", defaultValue: "EN", input: false },
      desiredRetention: { type: "number", defaultValue: 0.9, input: false },
      hideTranslationAfterStability: {
        type: "number",
        defaultValue: 60,
        input: false,
      },
    },
  },

  plugins: [
    // "Try without an account": a real user row flagged isAnonymous, so the
    // whole app works unchanged — except AI, which ai-budget.ts refuses.
    anonymous({
      emailDomainName: "anonymous.hangugo.invalid",
      // The plugin deletes the anonymous user right after this hook, and
      // all data cascades from User — move it first.
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        await moveAnonymousData(prisma, anonymousUser.user.id, newUser.user.id);
      },
    }),
    // Must come last: it lets server actions set the session cookie.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
