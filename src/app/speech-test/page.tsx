"use client";

/**
 * "/speech-test" — a temporary diagnostic page for pronunciation problems.
 *
 * React client component ("use client"): runs in the browser. It tries the
 * browser's speech synthesis in four different ways and prints what the
 * browser reports (voices, speaking state, start/end/error events), so a
 * silent device can be understood from one screenshot instead of guessing.
 * No server, database or AI involved. Delete this page once speech works.
 *
 * Calls: the Web Speech API (window.speechSynthesis) and speakKorean() from
 * components/SpeakButton.tsx — the very function the app's speaker buttons use.
 */

import { useState } from "react";
import { speakKorean } from "@/components/SpeakButton";

/** Test words: Korean for the real check, English to see if speech works at all. */
const KOREAN = "안녕하세요";
const ENGLISH = "hello";

/** One small button of the page. */
function Btn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-xl border border-line px-4 py-3 text-left"
    >
      {children}
    </button>
  );
}

/** The diagnostic page. */
export default function SpeechTestPage() {
  const [log, setLog] = useState<string[]>([]);
  const add = (line: string) =>
    setLog((old) => [...old.slice(-30), `${new Date().toLocaleTimeString()} ${line}`]);

  /** What the browser says about itself right now. */
  const state = () => {
    if (!("speechSynthesis" in window)) return "NO speechSynthesis";
    const s = window.speechSynthesis;
    return `speaking=${s.speaking} pending=${s.pending} paused=${s.paused}`;
  };

  /** Speak `text` with an utterance, logging every event it fires. */
  const run = (name: string, text: string, lang: string, withVoice: boolean, cancelFirst: boolean) => {
    if (!("speechSynthesis" in window)) return add(`${name}: no speechSynthesis`);
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    if (withVoice) {
      const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2)));
      if (voice) utterance.voice = voice;
      add(`${name}: voice=${voice ? `${voice.name} ${voice.lang}` : "none found"}`);
    }
    utterance.onstart = () => add(`${name}: start`);
    utterance.onend = () => add(`${name}: end`);
    utterance.onerror = (event) => add(`${name}: ERROR ${event.error}`);
    if (cancelFirst) synth.cancel();
    synth.speak(utterance);
    add(`${name}: sent. ${state()}`);
  };

  const voices = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis.getVoices() : [];
  const korean = voices.filter((v) => v.lang.toLowerCase().startsWith("ko"));

  return (
    <main className="mx-auto max-w-xl space-y-3 px-4 py-8">
      <h1 className="text-xl font-bold">Speech test</h1>
      <p className="text-sm text-muted">
        Tap each button, say whether you heard a sound, and send a screenshot of this page.
      </p>
      <Btn onClick={() => run("1 English", ENGLISH, "en-US", false, false)}>1. English “hello” (does speech work at all?)</Btn>
      <Btn onClick={() => run("2 Korean plain", KOREAN, "ko-KR", false, false)}>2. Korean, plain</Btn>
      <Btn onClick={() => run("3 Korean voice", KOREAN, "ko-KR", true, false)}>3. Korean, with a chosen voice</Btn>
      <Btn onClick={() => run("4 Korean cancel", KOREAN, "ko-KR", true, true)}>4. Korean, cancel() first</Btn>
      <Btn onClick={() => { speakKorean(KOREAN); add(`5 app function: called. ${state()}`); }}>
        5. The app’s own speaker function
      </Btn>
      <div className="rounded-xl border border-line p-3 text-xs">
        <p>{typeof navigator !== "undefined" ? navigator.userAgent : ""}</p>
        <p className="mt-1">
          voices: {voices.length}, Korean: {korean.length ? korean.map((v) => `${v.name} (${v.lang}, ${v.localService ? "on device" : "online"})`).join("; ") : "none"}
        </p>
        <p className="mt-1">{typeof window !== "undefined" ? state() : ""}</p>
      </div>
      <pre className="whitespace-pre-wrap rounded-xl border border-line p-3 text-xs">{log.join("\n") || "(log is empty)"}</pre>
    </main>
  );
}
