"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/lib/auth-client";

interface FillResult {
  fromDictionary: number;
  fromAi: number;
  remaining: number;
  aiBlocked?: "anonymous" | "user" | "daily";
}

export default function SettingsPanel({
  email,
  askRecognition: initialAsk,
  showKoreanDefinition: initialKorean,
  credits,
  missingExamples,
}: {
  /** null = no account yet. */
  email: string | null;
  askRecognition: boolean;
  showKoreanDefinition: boolean;
  /** null = unlimited. */
  credits: number | null;
  missingExamples: number;
}) {
  const router = useRouter();
  const [askRecognition, setAskRecognition] = useState(initialAsk);
  const [showKorean, setShowKorean] = useState(initialKorean);
  const [error, setError] = useState<string | null>(null);
  const [filling, setFilling] = useState(false);
  const [filled, setFilled] = useState<FillResult | null>(null);

  async function save(change: Record<string, boolean>, undo: () => void) {
    setError(null);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Could not save.");
    } catch (cause) {
      undo();
      setError(cause instanceof Error ? cause.message : "Could not save.");
    }
  }

  async function fillExamples() {
    setFilling(true);
    setError(null);
    try {
      const response = await fetch("/api/examples", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not add examples.");
      setFilled(data);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add examples.");
    } finally {
      setFilling(false);
    }
  }

  const section = "rounded-lg border border-line bg-surface p-4";

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pb-16 pt-8 sm:px-6">
      <header className="mb-2">
        <p className="korean text-4xl text-celadon-deep">설정</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Settings</h1>
      </header>

      {error && (
        <p role="alert" className="rounded-md bg-clay-soft px-3 py-2.5 text-sm text-clay">
          {error}
        </p>
      )}

      <section className={section}>
        <h2 className="font-medium">Cards</h2>
        <p className="mt-1 text-sm text-muted">
          Cards show the English meaning and ask for the Korean word.
        </p>
        <Toggle
          checked={showKorean}
          onChange={(value) => {
            setShowKorean(value);
            save({ showKoreanDefinition: value }, () => setShowKorean(!value));
          }}
          label="Show the Korean definition under the English meaning"
        />
        <Toggle
          checked={askRecognition}
          onChange={(value) => {
            setAskRecognition(value);
            save({ askRecognition: value }, () => setAskRecognition(!value));
          }}
          label="Also ask the other way: Korean word → English meaning"
        />
      </section>

      <section className={section}>
        <h2 className="font-medium">Examples</h2>
        <p className="mt-1 text-sm text-muted">
          {missingExamples === 0
            ? "Every word has an example sentence."
            : `${missingExamples} ${missingExamples === 1 ? "word has" : "words have"} no example yet. Examples come from the dictionary first; the AI writes one only where the dictionary has none${email === null ? " (needs an account)" : ""}.`}
        </p>
        {missingExamples > 0 && (
          <button
            type="button"
            onClick={fillExamples}
            disabled={filling}
            className="mt-3 rounded-md bg-celadon-deep px-4 py-2.5 text-sm font-medium text-paper disabled:opacity-50"
          >
            <i className={`bi ${filling ? "bi-hourglass-split" : "bi-chat-quote"} mr-1.5`} aria-hidden />
            {filling ? "Adding examples…" : "Add missing examples"}
          </button>
        )}
        {filled && (
          <p className="mt-3 text-sm">
            Added {filled.fromDictionary} from the dictionary and {filled.fromAi} written by AI.
            {filled.remaining > 0 && ` ${filled.remaining} still without — `}
            {filled.remaining > 0 &&
              (filled.aiBlocked === "anonymous"
                ? "create an account to let the AI fill those."
                : filled.aiBlocked
                  ? "out of AI credits for now."
                  : "run it again.")}
          </p>
        )}
      </section>

      <section className={section}>
        <h2 className="font-medium">Account</h2>
        {email === null ? (
          <>
            <p className="mt-1 text-sm text-muted">
              You are using the app without an account. Your words are kept on this device&apos;s
              session; sign in or create an account to keep them anywhere and to use AI.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Link href="/sign-up" className="rounded-md bg-celadon-deep px-4 py-2.5 text-sm font-medium text-paper">
                Create account
              </Link>
              <Link href="/sign-in" className="rounded-md border border-line px-4 py-2.5 text-sm">
                Sign in
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm">{email}</p>
            <p className="mt-1 text-sm text-muted">
              {credits === null ? "Unlimited AI." : `${credits} AI credits left.`}{" "}
              <Link href="/pricing" className="text-celadon-deep underline underline-offset-4">
                Plans
              </Link>
            </p>
            <button
              type="button"
              onClick={async () => {
                await signOut();
                router.push("/");
                router.refresh();
              }}
              className="mt-3 rounded-md border border-line px-4 py-2.5 text-sm"
            >
              <i className="bi bi-box-arrow-right mr-1.5" aria-hidden />
              Sign out
            </button>
          </>
        )}
      </section>
    </main>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="mt-3 flex items-start gap-3 text-sm">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? "bg-celadon-deep" : "bg-line"
        }`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-surface shadow transition-[left] ${
            checked ? "left-[1.125rem]" : "left-0.5"
          }`}
        />
      </button>
      {label}
    </label>
  );
}
