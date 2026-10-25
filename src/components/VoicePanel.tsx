"use client";

// Voice loop panel: a small pill with a mic toggle, one-line status (Listening / Thinking / Speaking),
// and the latest question and answer underneath while active.
// The mic works like a mute button: tap (or press M) to go live, tap again to mute. While live, each pause
// in your speech sends a question; listening stops while BuildSight thinks or speaks, so it never hears itself.

import { useCallback, useEffect, useRef, useState } from "react";
import type { AssistRequest } from "@/app/api/assist/route";
import { Listener } from "@/lib/listen";
import { speaker } from "@/lib/speech";

export type VoiceStatus = "idle" | "listening" | "thinking" | "speaking";
type Line = { who: "you" | "assistant"; text: string; frame?: string };

const STATUS_DOT: Record<VoiceStatus, string> = {
  idle: "bg-white/40",
  listening: "bg-rose-400 animate-pulse",
  thinking: "bg-amber-300 animate-pulse",
  speaking: "bg-sky-300 animate-pulse",
};

function MicIcon({ off, className }: { off?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0M12 17v4M8 21h8" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}

type Props = {
  getFrame?: () => string | null; // latest camera frame, grabbed when you stop talking
  context?: Pick<AssistRequest, "manual" | "step" | "ar">;
  muted?: boolean; // BuildSight's voice is muted (the build screen's Voice on/off)
  compact?: boolean; // phones with the step card collapsed: just a round mic button
  // Spoken build commands ("next", "go to step 8"): returns a short confirmation if it handled the phrase
  // (then Claude isn't asked), or null to send it to Claude as a question.
  onCommand?: (text: string) => string | null;
};

export default function VoicePanel({ getFrame, context, muted, compact, onCommand }: Props) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [lines, setLines] = useState<Line[]>([]);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false); // mic unmuted
  // The latest answer shows below the pill while active and for a few seconds after.
  const [faded, setFaded] = useState(true);
  const [pinned, setPinned] = useState(false); // tap the status line to keep the full transcript open
  const liveRef = useRef(false);
  liveRef.current = live;

  const listener = useRef<Listener | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const linesRef = useRef<Line[]>([]);
  linesRef.current = lines;
  const props = useRef({ getFrame, context, muted, onCommand });
  props.current = { getFrame, context, muted, onCommand };
  const asking = useRef<AbortController | null>(null);
  const commandPauseUntil = useRef(0);

  useEffect(() => {
    const l = new Listener({
      onInterim: (t) => {
        setInterim(t);
        setFaded(false);
      },
      // A finished sentence is sent at once; listening pauses until the answer has been spoken.
      onPhrase: async () => {
        if (!liveRef.current || !l.listening) return;
        const text = await l.stop();
        setInterim("");
        if (!text) return setStatus("idle");
        // Commands act at once, no Claude call; the step change (if any) is read aloud by the build screen.
        const handled = props.current.onCommand?.(text);
        if (handled) {
          commandPauseUntil.current = Date.now() + 900;
          setLines((ls) => [...ls, { who: "you", text }, { who: "assistant", text: handled }]);
          setFaded(false);
          setStatus(speaker().speaking ? "speaking" : "idle");
        } else ask(text);
      },
      onError: (m) => {
        setError(m);
        setStatus("idle");
        setInterim("");
      },
    });
    listener.current = l;
    l.warm().catch(() => {}); // errors show when you unmute instead
    return () => {
      l.close();
      asking.current?.abort();
    };
  }, []);

  // Show "Speaking" whenever the voice is playing (replies and step announcements alike).
  useEffect(() => speaker().subscribe((on) => setStatus((s) => (on ? "speaking" : s === "speaking" ? "idle" : s))), []);

  // While live: listen whenever idle; stop listening while thinking or speaking so it never hears itself.
  useEffect(() => {
    const l = listener.current;
    if (!live || !l) return;
    if (status === "thinking" || status === "speaking") {
      if (l.listening) l.stop(); // discard: anything heard now is our own voice
      return;
    }
    if (status !== "idle") return;
    const t = setTimeout(() => {
      setStatus("listening");
      l.start().catch((e) => {
        setError(e instanceof Error ? e.message : "Couldn't start listening.");
        setLive(false);
        setStatus("idle");
      });
    }, Math.max(300, commandPauseUntil.current - Date.now())); // pause after commands and our own voice
    return () => clearTimeout(t);
  }, [live, status]);

  // Tap the mic: unmute, or mute (which also stops BuildSight mid-sentence).
  const toggleMic = useCallback(() => {
    speaker().unlock(); // browsers only allow audio after a tap
    setError(null);
    if (speaker().speaking) speaker().stop();
    if (liveRef.current) {
      setLive(false);
      if (listener.current?.listening) listener.current.stop();
      setInterim("");
      setStatus((s) => (s === "listening" ? "idle" : s));
    } else {
      setLive(true);
      setFaded(false);
    }
  }, []);

  // Shrink back to the pill a few seconds after the answer finishes.
  useEffect(() => {
    if (status !== "idle" || faded) return;
    const t = setTimeout(() => setFaded(true), 6000);
    return () => clearTimeout(t);
  }, [status, faded]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [lines, interim]);

  // Sends the question (plus a camera frame) to Claude and shows the reply as it streams in.
  async function ask(question: string) {
    asking.current?.abort();
    const ctrl = new AbortController();
    asking.current = ctrl;
    const { getFrame, context, muted } = props.current;
    const history = linesRef.current.map((l) => ({ role: l.who === "you" ? ("user" as const) : ("assistant" as const), text: l.text }));
    const frame = getFrame?.() ?? undefined; // what the camera sees the moment you stop talking
    setLines((ls) => [...ls, { who: "you", text: question, frame }, { who: "assistant", text: "" }]);
    setFaded(false);
    setStatus("thinking");
    const voice = muted ? null : speaker().stream();
    // Done with this answer. If something else is speaking now (e.g. the next step's announcement), stay "speaking"
    // so the mic doesn't switch back on and hear it.
    const finish = () => setStatus((s) => (speaker().speaking ? "speaking" : s === "thinking" || s === "speaking" ? "idle" : s));

    const setReply = (text: string) =>
      setLines((ls) => {
        const next = [...ls];
        next[next.length - 1] = { who: "assistant", text };
        return next;
      });

    try {
      const body: AssistRequest = { question, history, frame, ...context };
      const res = await fetch("/api/assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't get an answer.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let reply = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        reply += chunk;
        setReply(reply);
        voice?.push(chunk); // each finished sentence starts speaking right away
      }
      reply = reply.trim();
      if (!reply) throw new Error("Got an empty answer. Try again.");
      if (voice) voice.end().then(() => !ctrl.signal.aborted && finish());
      else finish();
    } catch (e) {
      if (ctrl.signal.aborted) return;
      voice?.end();
      setLines((ls) => (ls[ls.length - 1]?.who === "assistant" && !ls[ls.length - 1].text ? ls.slice(0, -1) : ls));
      setError(e instanceof TypeError ? "Network problem. Check the connection and try again." : e instanceof Error ? e.message : "Something went wrong.");
      setStatus("idle");
    }
  }

  // M toggles the mic too (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.key.toLowerCase() === "m" && !e.repeat && !typing) toggleMic();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleMic]);

  const statusLine =
    status === "listening"
      ? interim || "Listening…"
      : status === "thinking"
        ? "Thinking…"
        : status === "speaking"
          ? "Speaking · tap mic to stop"
          : live
            ? "Listening…"
            : "Muted · tap to talk";
  const micLabel = live ? "Mute microphone" : "Unmute microphone";
  const micClass = live
    ? "bg-rose-400 text-ink shadow-[0_0_16px_rgba(251,113,133,0.7)]"
    : "bg-white/10 text-white/70 hover:bg-white/20";

  if (compact) {
    const last = interim || lines[lines.length - 1]?.text;
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={toggleMic}
          aria-label={micLabel}
          aria-pressed={live}
          className={`hud-panel relative grid h-14 w-14 shrink-0 select-none place-items-center rounded-full transition active:scale-95 ${micClass}`}
        >
          <MicIcon off={!live} className="h-6 w-6" />
          <span className={`absolute right-1 top-1 h-2.5 w-2.5 rounded-full ${STATUS_DOT[status]}`} />
        </button>
        {(status !== "idle" || error) && (
          <p className={`hud-panel line-clamp-2 rounded-xl px-2.5 py-1.5 text-xs ${error ? "text-rose-100" : "text-white/80"}`}>
            {error ?? (last || statusLine)}
          </p>
        )}
      </div>
    );
  }

  const shown = pinned ? lines : lines.slice(-2);
  const open = pinned || error !== null || (!faded && lines.length > 0);

  return (
    <section className="hud-panel w-full overflow-hidden rounded-2xl">
      <div className="flex h-11 items-center gap-2 pl-1 pr-2">
        <button
          onClick={toggleMic}
          aria-label={micLabel}
          aria-pressed={live}
          className={`relative grid h-9 w-9 shrink-0 select-none place-items-center rounded-full transition active:scale-95 ${micClass}`}
        >
          <MicIcon off={!live} className="h-[18px] w-[18px]" />
          <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-ink ${STATUS_DOT[status]}`} />
        </button>
        <button
          onClick={() => setPinned((p) => !p)}
          className={`min-w-0 flex-1 truncate text-left text-[13px] ${status === "listening" && interim ? "italic text-white/70" : "text-white/85"}`}
          title={pinned ? "Hide transcript" : "Show transcript"}
        >
          {statusLine}
          {!live && status === "idle" && <span className="ml-1.5 hidden text-[10px] text-white/40 sm:inline">or press M</span>}
        </button>
      </div>

      {open && (
        <div ref={scroller} className={`space-y-1.5 overflow-y-auto border-t border-white/10 px-3 py-2 text-[13px] leading-snug ${pinned ? "max-h-48 sm:max-h-72" : "max-h-28 sm:max-h-40"}`}>
          {shown.map((l, i) => (
            <p key={lines.length - shown.length + i} className={l.who === "you" ? "text-white/90" : "text-sky-200"}>
              {l.frame && (
                // eslint-disable-next-line @next/next/no-img-element -- camera frame is a data URL
                <img src={l.frame} alt="What BuildSight saw" className="float-right ml-2 h-9 w-12 rounded object-cover ring-1 ring-white/20" />
              )}
              <span className="mr-1.5 text-[10px] font-semibold uppercase text-white/40">{l.who === "you" ? "You" : "BuildSight"}</span>
              {l.text || <span className="animate-pulse text-white/40">…</span>}
            </p>
          ))}
          {error && <p className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-2.5 py-1.5 text-xs text-rose-100">{error}</p>}
        </div>
      )}
    </section>
  );
}
