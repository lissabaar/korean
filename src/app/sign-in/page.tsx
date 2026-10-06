/**
 * "/sign-in" — the sign-in form (email + password, or Google).
 *
 * Next.js page (server component): runs on the server for every request, may
 * read the database directly, and returns HTML. The folder path is the URL.
 * Outside the (app) group on purpose: no navigation bar, no anonymous
 * session. The form itself is <AuthForm/>.
 */

import AuthForm from "@/components/AuthForm";
import { googleEnabled } from "@/lib/auth";

/**
 * The sign-in page; `googleEnabled` shows the Google button only when its keys
 * are set.
 */
export default function SignInPage() {
  return <AuthForm mode="sign-in" googleEnabled={googleEnabled} />;
}
