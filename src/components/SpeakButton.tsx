"use client";

/**
 * Pronunciation: a speaker button, plus speakKorean() for playing a word from
 * code (auto-play after answering).
 *
 * React client component ("use client"): runs in the browser, so it can hold
 * state, react to clicks and call the API with fetch(). It cannot touch the
 * database or secret keys.
 *
 * Two voices, in this order:
 *   1. A real audio file from /api/tts (Gemini text-to-speech, made once per
 *      word and stored on the server), played through an <audio> element.
 *      This is what makes sound work on iPhone with the silent switch on —
 *      the browser's own speech is muted there, audio files are not.
 *   2. The browser's built-in speech synthesis (Web Speech API) with a Korean
 *      voice — free and offline — when the file is not available (offline,
 *      anonymous visitor, out of AI credits, server error).
 * The button hides itself only where the browser can do neither.
 */

import { useState, useSyncExternalStore } from "react";

/**
 * The one shared <audio> element. iPhone lets an element play without a tap
 * only if it was started once from a tap, so the first tap or key press
 * anywhere "primes" this element with a silent sound; later words (auto-play
 * after an answer, which comes after a server request) reuse it.
 */
let player: HTMLAudioElement | null = null;
function getPlayer(): HTMLAudioElement {
  if (!player) player = new Audio();
  return player;
}

/** A short silent WAV as an object URL, used only to prime the player. */
function silentWavUrl(): string {
  const samples = 800;
  const bytes = new Uint8Array(44 + samples).fill(128); // 8-bit PCM: 128 = silence
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, value: string) =>
    [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 8000, true); // sample rate
  view.setUint32(28, 8000, true); // bytes per second
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, samples, true);
  return URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
}

/**
 * Pronunciation through the browser's own speech synthesis — free, offline,
 * a Korean voice on iPhone (Yuna), Android and most desktops. Hidden where
 * the browser has no speech synthesis at all.
 */

function koreanVoice(): SpeechSynthesisVoice | undefined {
  return window.speechSynthesis.getVoices().find((voice) => voice.lang.toLowerCase().startsWith("ko"));
}

/**
 * iPhone (Safari and the installed app) speaks only after speech was started
 * once from a tap. Auto-play after an answer comes after a server request,
 * no longer "inside" the tap, and stayed silent. So the first tap or key
 * press anywhere starts a silent utterance, which unlocks speech for the rest
 * of the visit.
 */
let unlocking = false;
if (typeof window !== "undefined") {
  const unlockAudio = () => {
    const primer = getPlayer();
    primer.src = silentWavUrl();
    primer.play().catch(() => {});
    window.removeEventListener("pointerdown", unlockAudio);
    window.removeEventListener("keydown", unlockAudio);
  };
  window.addEventListener("pointerdown", unlockAudio, { once: true });
  window.addEventListener("keydown", unlockAudio, { once: true });
}
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  const unlock = () => {
    const silent = new SpeechSynthesisUtterance(" ");
    silent.volume = 0;
    // While this silent utterance is queued, speakKorean() must not treat it
    // as "something is speaking" (see there).
    unlocking = true;
    silent.onend = silent.onerror = () => {
      unlocking = false;
    };
    // Safety net: iOS may never fire "end" for a silent utterance, and the
    // flag must not stay set for the whole visit.
    setTimeout(() => {
      unlocking = false;
    }, 500);
    window.speechSynthesis.speak(silent);
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

/**
 * Say a Korean word aloud with the browser's own voice. Does nothing where
 * speech is not supported. The fallback of speakKorean().
 *
 * Only what is still speaking is cancelled, and then the new word starts a
 * moment later: on iPhone, cancel() followed at once by speak() often says
 * nothing at all (a WebKit bug) — that was the "no sound" in the app.
 */
function speakWithBrowserVoice(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) return;
  const synth = window.speechSynthesis;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ko-KR";
  const voice = koreanVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = 0.9;
  // Chrome can be left paused (e.g. after the tab was in the background).
  synth.resume();
  if (unlocking) {
    // The very first tap on the page was this speaker button: the unlock
    // above has just queued its silent utterance, so synth.speaking is true.
    // Cancelling it and speaking 80 ms later would run outside the tap and
    // stay silent on iPhone. Speaking at once, inside the tap, queues the word
    // right behind the silent one (it ends instantly).
    synth.speak(utterance);
  } else if (synth.speaking || synth.pending) {
    synth.cancel();
    setTimeout(() => synth.speak(utterance), 80);
  } else {
    synth.speak(utterance);
  }
}

/**
 * Say a Korean word aloud: the stored Gemini recording first (plays even with
 * the iPhone silent switch on), the browser's voice if that is not available.
 * Resolves when sound has started (or the fallback was used) — the button
 * shows a spinner meanwhile, since the very first request for a word waits
 * for Gemini for a few seconds.
 *
 * The element itself loads the URL inside play(), so the call stays "inside
 * the tap" for iPhone. A newer call interrupts an older one (AbortError) —
 * that is not a failure and must not trigger the fallback.
 */
export async function speakKorean(text: string): Promise<void> {
  if (typeof window === "undefined" || !text.trim()) return;
  if ("speechSynthesis" in window && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) {
    window.speechSynthesis.cancel();
  }
  const audio = getPlayer();
  try {
    audio.src = `/api/tts?text=${encodeURIComponent(text)}`;
    await audio.play();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    speakWithBrowserVoice(text);
  }
}

const subscribe = () => () => {};
// The button shows wherever there is some way to make sound: audio files
// (every browser) — the browser voice is only the fallback.
const supported = () => typeof Audio !== "undefined";

/**
 * Speaker icon button that says `text`. Hidden where the browser has no speech
 * synthesis.
 */
export default function SpeakButton({ text, className = "" }: { text: string; className?: string }) {
  const canSpeak = useSyncExternalStore(subscribe, supported, () => false);
  // True while the sound is being fetched (first time for a word: a few seconds).
  const [loading, setLoading] = useState(false);
  if (!canSpeak) return null;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        setLoading(true);
        void speakKorean(text).finally(() => setLoading(false));
      }}
      aria-label={`Pronounce ${text}`}
      title="Pronounce"
      className={`inline-grid size-8 shrink-0 place-items-center rounded-full text-celadon-deep hover:bg-celadon-soft ${className}`}
    >
      <i className={loading ? "bi bi-three-dots" : "bi bi-volume-up"} aria-hidden />
    </button>
  );
}
