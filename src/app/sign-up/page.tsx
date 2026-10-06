/**
 * "/sign-up" — creating an account. Same form as sign-in, other mode.
 *
 * Next.js page (server component): runs on the server for every request, may
 * read the database directly, and returns HTML. The folder path is the URL. An
 * anonymous visitor who signs up keeps their words: see
 * lib/words/merge-anonymous.ts.
 */

import AuthForm from "@/components/AuthForm";
import { googleEnabled } from "@/lib/auth";

/**
 * The sign-up page; `googleEnabled` shows the Google button only when its keys
 * are set.
 */
export default function SignUpPage() {
  return <AuthForm mode="sign-up" googleEnabled={googleEnabled} />;
}
