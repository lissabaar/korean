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
 * It also tries two ways to make speech audible while the iPhone's silent
 * switch is on (iOS mutes "ambient" page audio, which is what speech is by
 * default): the Audio Session API (navigator.audioSession.type = "playback")
 * and a silent <audio> loop, which makes iOS treat the page as a media player.
 *
 * Calls: the Web Speech API (window.speechSynthesis) and speakKorean() from
 * components/SpeakButton.tsx — the very function the app's speaker buttons use.
 */

import { useState } from "react";
import { speakKorean } from "@/components/SpeakButton";

/** Test words: Korean for the real check, English to see if speech works at all. */
const KOREAN = "안녕하세요";
const ENGLISH = "hello";

/**
 * A short silent WAV file as a blob URL: 0.5 s of mono 8-bit silence at
 * 8000 Hz (a 44-byte header plus 4000 bytes of the neutral sample 128).
 * Played in a loop, it tells iOS the page is playing media.
 */
function silentWavUrl(): string {
  const samples = 4000;
  const bytes = new Uint8Array(44 + samples).fill(128);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) =>
    [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true); // size of the format block
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 8000, true); // sample rate
  view.setUint32(28, 8000, true); // bytes per second
  view.setUint16(32, 1, true); // bytes per sample frame
  view.setUint16(34, 8, true); // bits per sample
  text(36, "data");
  view.setUint32(40, samples, true);
  return URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
}

/** The Audio Session API (Safari 16.4+), which TypeScript's DOM types do not know yet. */
type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

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
      <p className="pt-2 text-sm text-muted">
        Now turn the silent switch ON (orange) and try these:
      </p>
      <Btn
        onClick={() => {
          const session = (navigator as AudioSessionNavigator).audioSession;
          if (!session) return add("6: navigator.audioSession is NOT supported here");
          session.type = "playback";
          add(`6: audioSession.type is now "${session.type}"`);
          run("6 Korean + playback", KOREAN, "ko-KR", true, true);
        }}
      >
        6. Audio Session “playback”, then Korean
      </Btn>
      <Btn
        onClick={() => {
          const audio = new Audio(silentWavUrl());
          audio.loop = true;
          audio.play().then(
            () => add("7: silent audio is playing"),
            (error) => add(`7: silent audio FAILED ${error}`),
          );
          run("7 Korean + silent audio", KOREAN, "ko-KR", true, true);
          setTimeout(() => audio.pause(), 6000);
        }}
      >
        7. Silent audio loop, then Korean
      </Btn>
      <div className="rounded-xl border border-line p-3 text-xs">
        <p>audioSession: {typeof navigator !== "undefined" && (navigator as AudioSessionNavigator).audioSession ? `supported, type=${(navigator as AudioSessionNavigator).audioSession!.type}` : "not supported"}</p>
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
