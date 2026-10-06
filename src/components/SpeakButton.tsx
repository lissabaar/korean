"use client";

/**
 * Pronunciation: a speaker button, plus speakKorean() for playing a word from
 * code (auto-play after answering).
 *
 * React client component ("use client"): runs in the browser, so it can hold
 * state, react to clicks and call the API with fetch(). It cannot touch the
 * database or secret keys.
 *
 * Uses the browser's built-in speech synthesis (Web Speech API) with a Korean
 * voice — free and offline; the voice quality depends on the device. The
 * button hides itself where the browser cannot speak.
 */

import { useSyncExternalStore } from "react";

/**
 * Pronunciation through the browser's own speech synthesis — free, offline,
 * a Korean voice on iPhone (Yuna), Android and most desktops. Hidden where
 * the browser has no speech synthesis at all.
 */

function koreanVoice(): SpeechSynthesisVoice | undefined {
  return window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("ko"));
}

/**
 * Say a Korean word aloud with the browser's voice (cancels whatever is still
 * speaking). Does nothing where speech is not supported.
 */
export function speakKorean(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ko-KR";
  const voice = koreanVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

const subscribe = () => () => {};
const supported = () => "speechSynthesis" in window;

/**
 * Speaker icon button that says `text`. Hidden where the browser has no speech
 * synthesis.
 */
export default function SpeakButton({ text, className = "" }: { text: string; className?: string }) {
  const canSpeak = useSyncExternalStore(subscribe, supported, () => false);
  if (!canSpeak) return null;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        speakKorean(text);
      }}
      aria-label={`Pronounce ${text}`}
      title="Pronounce"
      className={`inline-grid size-8 shrink-0 place-items-center rounded-full text-celadon-deep hover:bg-celadon-soft ${className}`}
    >
      <i className="bi bi-volume-up" aria-hidden />
    </button>
  );
}
