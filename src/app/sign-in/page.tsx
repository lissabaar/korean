import AuthForm from "@/components/AuthForm";
import { googleEnabled } from "@/lib/auth";

export default function SignInPage() {
  return <AuthForm mode="sign-in" googleEnabled={googleEnabled} />;
}
