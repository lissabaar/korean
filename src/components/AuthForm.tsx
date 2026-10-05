"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn, signUp } from "@/lib/auth-client";

export default function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignUp = mode === "sign-up";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    const result = isSignUp
      ? await signUp.email({ email, password, name: name || email })
      : await signIn.email({ email, password });

    setBusy(false);

    if (result.error) {
      setError(result.error.message ?? "That did not work. Try again.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <p className="korean mb-3 text-5xl text-celadon-deep">단어</p>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">
        {isSignUp ? "Make an account" : "Sign in"}
      </h1>
      <p className="mb-8 text-sm text-muted">
        {isSignUp
          ? "Your words and schedule stay in your own database."
          : "Pick up where your reviews left off."}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {isSignUp && (
          <Field
            label="Name"
            value={name}
            onChange={setName}
            type="text"
            autoComplete="name"
            required={false}
          />
        )}
        <Field
          label="Email"
          value={email}
          onChange={setEmail}
          type="email"
          autoComplete="email"
        />
        <Field
          label="Password"
          value={password}
          onChange={setPassword}
          type="password"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          hint={isSignUp ? "At least 10 characters." : undefined}
        />

        {error && (
          <p
            role="alert"
            className="rounded-md bg-clay-soft px-3 py-2 text-sm text-clay"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-2 rounded-md bg-celadon-deep px-4 py-3 font-medium text-paper transition-opacity disabled:opacity-50"
        >
          {busy ? "Working…" : isSignUp ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        {isSignUp ? "Already have an account? " : "No account yet? "}
        <Link
          href={isSignUp ? "/sign-in" : "/sign-up"}
          className="text-celadon-deep underline underline-offset-4"
        >
          {isSignUp ? "Sign in" : "Make one"}
        </Link>
      </p>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type,
  autoComplete,
  hint,
  required = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type: string;
  autoComplete: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        required={required}
        className="rounded-md border border-line bg-surface px-3 py-2.5 text-base outline-none focus:border-celadon"
      />
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}
