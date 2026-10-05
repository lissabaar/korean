import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// Handles sign-up, sign-in, sign-out, session and verification endpoints.
export const { GET, POST } = toNextJsHandler(auth);
