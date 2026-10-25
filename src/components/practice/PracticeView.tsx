"use client";

// Practice Mode: learn a build hands-on without the parts. Live rear camera behind a transparent 3D scene;
// pick the right part from the tray, drag it onto the glowing outline, turn it until it fits, and it clicks in.
// Voice: steps are read aloud; say "next", "back", "repeat" or "I'm stuck" (VoicePanel + Azure STT, Cartesia TTS).

import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import VoicePanel from "@/components/VoicePanel";
import { LEGO as LEGO_CATALOG, toResult } from "@/lib/catalog";
import { addFromResult } from "@/lib/manuals";
import { speaker } from "@/lib/speech";
import { evaluate, stepOf, type Pack } from "./engine";
import { useDeviceOrientation } from "./orientation";
import { PACKS, type PackId } from "./packs";
import PracticeScene, { type DropEvent, type Held } from "./Scene";
import { sfx, unlockSfx } from "./sfx";
import { renderThumbnails } from "./thumbs";
import { matchPractice } from "./voice";

type Note = { text: string; tone: "ok" | "warn" | "info"; key: number };
const PRAISE = ["Nice, it clicks in.", "That's it.", "Perfect fit.", "Snapped in."];

// ---------- camera backdrop ----------

function Backdrop({ on, onFail }: { on: boolean; onFail: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        if (video.current) video.current.srcObject = stream;
      } catch {
        if (!cancelled) onFail();
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [on, onFail]);
  return (
    <div className="absolute inset-0 overflow-hidden bg-ink">
      {/* studio: shown without the camera, and under it while it starts */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_38%,#1d2a3a_0%,#0b111b_55%,#04070d_100%)]" />
      <div className="hud-grid absolute inset-0 opacity-60" />
      {on && <video ref={video} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover" />}
      {on && <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(4,7,13,0.55)_100%)]" />}
    </div>
  );
}

// ---------- icons ----------

const Icon = {
  back: <path d="M15 18l-6-6 6-6" />,
  restart: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </>
  ),
  rotate: (
    <>
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v5h-5" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  recenter: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
};
const Svg = ({ d, className = "h-4 w-4" }: { d: React.ReactNode; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);

const stripStep = (s: string) => s.replace(/^Step \d+\.\s*/, "");

// ---------- the screen ----------

export default function PracticeView({ packId }: { packId: PackId }) {
  const pack: Pack = PACKS[packId];
  const router = useRouter();
  const [phase, setPhase] = useState<"intro" | "play" | "done">("intro");
  const [placed, setPlaced] = useState(0);
  const [held, setHeld] = useState<Held | null>(null);
  const [stuck, setStuck] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [success, setSuccess] = useState({ key: 0, fromHeld: true });
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const gyro = useDeviceOrientation();

  const p = pack.placements[placed];
  const step = stepOf(pack, placed);
  const lastStep = pack.placements[pack.placements.length - 1].step;
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const say = useCallback((text: string) => {
    if (!mutedRef.current) speaker().say(text);
  }, []);
  const show = useCallback((text: string, tone: Note["tone"]) => setNote({ text, tone, key: Date.now() }), []);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), note.tone === "warn" ? 5200 : 3600);
    return () => clearTimeout(t);
  }, [note]);

  useEffect(() => {
    let alive = true;
    renderThumbnails(Object.values(pack.parts).filter((q) => q.id !== pack.base)).then((t) => alive && setThumbs(t));
    return () => {
      alive = false;
    };
  }, [pack]);

  useEffect(() => () => speaker().stop(), []);

  // The tray: the right part and its lookalikes, in a different order each placement.
  const options = useMemo(() => {
    if (!p) return [];
    const all = [p.part, ...p.decoys];
    const k = (placed * 2 + 1) % all.length;
    return [...all.slice(k), ...all.slice(0, k)].map((id) => pack.parts[id]);
  }, [p, placed, pack]);

  // ---------- actions ----------

  const start = useCallback(async () => {
    unlockSfx();
    speaker().unlock();
    setCameraOn(true);
    setPhase("play");
    say(`${pack.intro} ${pack.placements[0].say}`);
    gyro.start().catch(() => {});
  }, [gyro, pack, say]);

  const complete = useCallback(
    (fromHeld: boolean) => {
      const cur = pack.placements[placed];
      if (!cur) return;
      sfx(cur.latches?.length ? "latch" : "snap");
      setHeld(null);
      setStuck(false);
      setSuccess((s) => ({ key: s.key + 1, fromHeld }));
      const nextIndex = placed + 1;
      setPlaced(nextIndex);
      const praise = cur.done ?? PRAISE[placed % PRAISE.length];
      const next = pack.placements[nextIndex];
      if (next) {
        show(praise, "ok");
        say(`${praise} ${next.say}`);
      } else {
        show(praise, "ok");
        setTimeout(() => {
          sfx("done");
          setPhase("done");
          say(`${praise} ${pack.finish.title}.`);
        }, 900);
      }
    },
    [pack, placed, say, show],
  );

  const onDrop = useCallback(
    (e: DropEvent) => {
      if (!p || !held) return;
      const v = evaluate(pack, p, held.partId, e.spot, held.rotY);
      if (v.ok) return complete(true);
      if (v.kind === "miss") {
        show(v.message, "info"); // just short of the spot: a nudge, no buzz
        return;
      }
      sfx("wrong");
      setShakeKey((k) => k + 1);
      show(v.message, "warn");
      say(v.message);
    },
    [p, held, pack, complete, show, say],
  );

  const pick = useCallback(
    (partId: string) => {
      if (!p) return;
      unlockSfx();
      sfx("pick");
      setHeld((h) => (h?.partId === partId ? null : { partId, rotY: p.startRotY ?? 0 }));
    },
    [p],
  );

  const rotate = useCallback(() => {
    if (p?.lockRotation) return;
    setHeld((h) => (h ? { ...h, rotY: h.rotY + pack.rotateStep } : h));
    sfx("pick");
  }, [pack.rotateStep, p?.lockRotation]);

  const back = useCallback(() => {
    if (placed === 0) return;
    const prev = pack.placements[placed - 1];
    setPlaced(placed - 1);
    setHeld(null);
    setStuck(false);
    setPhase("play");
    show(`Back to: ${prev.title}`, "info");
    say(prev.say);
  }, [placed, pack, say, show]);

  const help = useCallback(() => {
    if (!p) return;
    setStuck(true);
    show(p.stuck, "info");
    say(p.stuck);
  }, [p, say, show]);

  const restart = useCallback(() => {
    setPlaced(0);
    setHeld(null);
    setStuck(false);
    setSuccess({ key: 0, fromHeld: true });
    setPhase("play");
    say(pack.placements[0].say);
  }, [pack, say]);

  useEffect(() => {
    if (!stuck) return;
    const t = setTimeout(() => setStuck(false), 7000);
    return () => clearTimeout(t);
  }, [stuck, placed]);

  // Voice commands: act at once, reply with a short confirmation (VoicePanel shows it).
  const onCommand = useCallback(
    (text: string): string | null => {
      const c = matchPractice(text);
      if (!c) return null;
      switch (c) {
        case "next":
          if (!p) return "That was the last part.";
          complete(false);
          return "Placed it for you.";
        case "back":
          if (placed === 0) return "You're at the first part.";
          back();
          return "Going back.";
        case "repeat":
          if (p) say(p.say);
          return p ? stripStep(p.say) : "All done.";
        case "stuck":
          help();
          return "Showing you where it goes.";
        case "rotate":
          if (!held) return "Pick a part first.";
          if (p?.lockRotation) return "This one only goes on one way, no turning needed.";
          rotate();
          return "Turned it.";
        case "restart":
          restart();
          return "Starting over.";
      }
    },
    [p, placed, held, complete, back, say, help, rotate, restart],
  );

  // Keyboard: R turns the part, Esc puts it back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key.toLowerCase() === "r" && !e.repeat) rotate();
      if (e.key === "Escape") setHeld(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rotate]);

  const buildForReal = useCallback(async () => {
    if (pack.id !== "parrot") return router.push("/");
    const item = LEGO_CATALOG.find((i) => i.id === "lego-31136");
    if (!item) return router.push("/");
    const m = await addFromResult(toResult(item, item.manuals[0]));
    router.push(`/build/${m.id}`);
  }, [pack.id, router]);

  const leave = () => (window.history.length > 1 ? router.back() : router.push("/"));
  const disableCamera = useCallback(() => setCameraOn(false), []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-ink text-white">
      <Backdrop on={cameraOn} onFail={disableCamera} />

      <Canvas
        className="!absolute inset-0"
        style={{ touchAction: "none" }}
        shadows="percentage"
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: pack.camera.fov, near: 2, far: 6000, position: [0, 200, 300] }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.toneMapping = THREE.NeutralToneMapping; // keeps LEGO colours true to their official values
        }}
      >
        <PracticeScene
          pack={pack}
          placed={placed}
          held={phase === "play" ? held : null}
          stuck={stuck}
          shakeKey={shakeKey}
          successKey={success.key}
          successFromHeld={success.fromHeld}
          gyro={gyro.delta}
          onDrop={onDrop}
        />
      </Canvas>

      {/* top: back, title, controls; progress; the current instruction */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
        <header className="pointer-events-auto flex items-center gap-2">
          <button onClick={leave} aria-label="Back" className="hud-panel grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white/85 transition hover:text-white">
            <Svg d={Icon.back} />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-[15px] font-semibold tracking-tight">{pack.title}</p>
            <p className="truncate text-[11px] text-white/50">Practice in AR · {pack.subtitle}</p>
          </div>
          <button onClick={restart} aria-label="Restart" title="Restart" className="hud-panel grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white/85 transition hover:text-white">
            <Svg d={Icon.restart} />
          </button>
          <button
            onClick={() => setCameraOn((c) => !c)}
            aria-pressed={cameraOn}
            aria-label={cameraOn ? "Camera on" : "Camera off"}
            title={cameraOn ? "Camera on: tap for studio view" : "Studio view: tap for camera"}
            className={`hud-panel grid h-9 w-9 shrink-0 place-items-center rounded-xl transition ${cameraOn ? "text-holo" : "text-white/60 hover:text-white"}`}
          >
            <Svg d={Icon.camera} />
          </button>
          <button
            onClick={() => {
              setMuted((m) => !m);
              speaker().stop();
            }}
            aria-pressed={muted}
            className="hud-panel h-9 shrink-0 rounded-xl px-2.5 text-xs font-medium text-white/85 transition hover:text-white"
          >
            {muted ? "Voice off" : "Voice on"}
          </button>
        </header>

        {phase !== "intro" && (
          <div className="mx-auto mt-3 max-w-xl">
            <div className="flex gap-[3px]" aria-label={`${placed} of ${pack.placements.length} parts placed`}>
              {pack.placements.map((q, i) => (
                <span
                  key={q.id}
                  className={`h-1 flex-1 rounded-full transition-colors duration-500 ${i < placed ? "bg-holo" : i === placed ? "animate-pulse bg-holo/45" : "bg-white/15"}`}
                />
              ))}
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] font-medium text-white/55">
              <span>
                Step {step.step} of {lastStep}
                {step.count > 1 && p ? ` · ${step.within} of ${step.count}` : ""}
              </span>
              <span>
                {placed}/{pack.placements.length} parts
              </span>
            </div>
            {p && phase === "play" && (
              <motion.div key={p.id} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="hud-panel pointer-events-auto mt-2 rounded-2xl px-3.5 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-holo">{p.title}</p>
                  <button onClick={help} className="shrink-0 rounded-full border border-white/15 px-2.5 py-0.5 text-[11px] text-white/75 transition hover:border-holo/50 hover:text-white">
                    I&apos;m stuck
                  </button>
                </div>
                <p className="mt-1 text-[13.5px] leading-snug text-white/90">{stripStep(p.say)}</p>
              </motion.div>
            )}
          </div>
        )}
      </div>

      {/* bottom: feedback, voice and rotate, the parts tray */}
      {phase === "play" && p && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          <div className="mx-auto max-w-xl">
            <AnimatePresence>
              {note && (
                <motion.p
                  key={note.key}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  role="status"
                  className={`hud-panel mx-auto mb-2 w-fit max-w-full rounded-2xl px-3.5 py-2 text-center text-[13px] leading-snug ${
                    note.tone === "warn" ? "text-amber-100" : note.tone === "ok" ? "text-emerald-100" : "text-white/90"
                  }`}
                >
                  {note.tone === "ok" && <span className="mr-1.5 inline-block text-emerald-300">✓</span>}
                  {note.text}
                </motion.p>
              )}
            </AnimatePresence>

            <div className="pointer-events-auto mb-2 flex items-end justify-between gap-2">
              <div className="min-w-0 flex-1">
                <VoicePanel
                  compact
                  muted={muted}
                  onCommand={onCommand}
                  context={{ manual: `${pack.title} (practice in AR)`, step: { number: step.step, instruction: stripStep(p.say), parts: [pack.parts[p.part].name] } }}
                />
              </div>
              {gyro.active && (
                <button onClick={gyro.recenter} className="hud-panel grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/80" aria-label="Recenter" title="Recenter">
                  <Svg d={Icon.recenter} className="h-5 w-5" />
                </button>
              )}
              <button
                onClick={rotate}
                disabled={!held || !!p.lockRotation}
                className="hud-panel flex h-14 shrink-0 items-center gap-2 rounded-full pl-4 pr-5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-35"
              >
                <Svg d={Icon.rotate} className="h-5 w-5 text-holo" />
                Rotate
              </button>
            </div>

            <div className="pointer-events-auto grid grid-cols-3 gap-2" role="listbox" aria-label="Parts tray">
              {options.map((part) => {
                const on = held?.partId === part.id;
                return (
                  <button
                    key={part.id}
                    role="option"
                    aria-selected={on}
                    onClick={() => pick(part.id)}
                    className={`hud-panel group flex flex-col items-center rounded-2xl px-1.5 pb-2 pt-1.5 text-center transition active:scale-[0.97] ${
                      on ? "!border-holo/70 shadow-[0_0_0_1px_rgba(92,200,255,0.5),0_10px_30px_-10px_rgba(92,200,255,0.6)]" : "hover:border-white/25"
                    }`}
                  >
                    <span className="relative grid h-16 w-full place-items-center">
                      {thumbs[part.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element -- rendered in the browser as a data URL
                        <img src={thumbs[part.id]} alt="" className={`h-16 w-16 object-contain transition ${on ? "scale-105" : "group-hover:scale-105"}`} />
                      ) : (
                        <span className="h-10 w-10 animate-pulse rounded-xl bg-white/10" />
                      )}
                      {on && <span className="absolute right-0.5 top-0 rounded-md bg-holo px-1.5 py-px text-[9px] font-bold text-ink">IN HAND</span>}
                    </span>
                    <span className="mt-0.5 line-clamp-1 text-[11.5px] font-semibold leading-tight">{part.label}</span>
                    {part.detail && <span className="line-clamp-1 text-[10px] text-white/50">{part.detail}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* start */}
      <AnimatePresence>
        {phase === "intro" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 grid place-items-end bg-ink/45 p-3 backdrop-blur-[2px] sm:place-items-center">
            <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 28 }} className="hud-panel holo-glow w-full max-w-md rounded-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
              <p className="text-xs font-semibold uppercase tracking-wide text-holo">Practice in AR</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{pack.title}</h1>
              <p className="text-sm text-white/55">{pack.subtitle}</p>
              <ol className="mt-4 space-y-2.5 text-sm text-white/85">
                {[
                  ["Pick", "Choose the right part from the tray. Watch out for lookalikes."],
                  ["Place", "Drag it onto the glowing outline, or tap the outline."],
                  ["Fit", "Rotate until it lines up. It clicks when it's right."],
                ].map(([t, d], i) => (
                  <li key={t} className="flex gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-holo/15 text-xs font-semibold text-holo ring-1 ring-holo/30">{i + 1}</span>
                    <span>
                      <b className="font-semibold text-white">{t}.</b> {d}
                    </span>
                  </li>
                ))}
              </ol>
              <button onClick={start} className="mt-5 w-full rounded-xl bg-holo py-3.5 text-[15px] font-semibold text-ink transition hover:brightness-110 active:scale-[0.99]">
                Start practice
              </button>
              <p className="mt-2.5 text-center text-[11px] text-white/40">Uses your camera and motion sensor to place the model on your table. Nothing is recorded.</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* finish */}
      <AnimatePresence>
        {phase === "done" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-30 grid place-items-end bg-ink/35 p-3 sm:place-items-center">
            <motion.div initial={{ y: 30, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 240, damping: 26 }} className="hud-panel holo-glow w-full max-w-md rounded-3xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-holo/15 text-holo ring-1 ring-holo/40">
                <Svg d={Icon.check} className="h-7 w-7" />
              </span>
              <h2 className="mt-3 text-[22px] font-semibold tracking-tight">{pack.finish.title}</h2>
              <p className="mt-1.5 text-sm text-white/60">{pack.finish.body}</p>
              <div className="mt-5 grid gap-2">
                <button onClick={buildForReal} className="w-full rounded-xl bg-holo py-3.5 text-[15px] font-semibold text-ink transition hover:brightness-110 active:scale-[0.99]">
                  {pack.id === "parrot" ? "Build it for real" : "Back to the hub"}
                </button>
                <button onClick={restart} className="w-full rounded-xl border border-white/15 py-3 text-sm font-medium text-white/85 transition hover:border-white/30 hover:text-white">
                  Practice again
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
