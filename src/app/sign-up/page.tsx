import AuthForm from "@/components/AuthForm";
import { googleEnabled } from "@/lib/auth";

export default function SignUpPage() {
  return <AuthForm mode="sign-up" googleEnabled={googleEnabled} />;
}
