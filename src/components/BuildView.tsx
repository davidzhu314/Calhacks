/* eslint-disable @next/next/no-img-element -- step pictures are data URLs rendered in the browser */
"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { CheckResult } from "@/app/api/check/route";
import CheckErrorOverlay, { IssueBoxes, LiveIssueBoxes, WarnGlyph } from "@/components/CheckErrorOverlay";
import { CATEGORY_TAG, checkVerdict, forStep, isPass, issueCategory, issueLabel, photoLabel, spokenIssues } from "@/lib/issueBox";
import type { ExtractedStep } from "@/app/api/extract/route";
import type { LocateResult } from "@/app/api/locate/route";
import type { PartMark } from "@/components/HighlightBox";
import CameraFeed, { type CameraHandle } from "@/components/CameraFeed";
import PieceHologram from "@/components/PieceHologram";
import { describePart, partLines } from "@/lib/parts";
import type { AssistAction } from "@/lib/assistReply";
import { cutOutPiece, type Cutout } from "@/lib/cutout";
import ManualPanel from "@/components/ManualPanel";
import VoicePanel from "@/components/VoicePanel";
import ShopSheet from "@/components/ShopSheet";
import ZoomViewer from "@/components/ZoomViewer";
import { matchCommand } from "@/lib/commands";
import { getManual, getPageSteps, saveManual, savePageSteps, type Manual } from "@/lib/manuals";
import { openManualPdf, renderPage } from "@/lib/pdf";
import { loadPrebuilt, type Prebuilt } from "@/lib/prebuilt";
import { speak, speaker, stopSpeaking } from "@/lib/speech";
import { AUTO_MIN_CONFIDENCE, changed, decide, MAX_TILES, whereAmI, type Tile } from "@/lib/whereAmI";
import { encodeCanvas } from "@/lib/encode";
import {
  AUTO_ADVANCE_MS,
  AUTO_CHANGE_THRESHOLD,
  AUTO_MAX_MISSES,
  AUTO_SPEAK_FIX_CONFIDENCE,
  MANUAL_ADVANCE_MS,
  markChecked,
  newWatch,
  recordMiss,
  resetForStep,
  tick,
} from "@/lib/autoCheck";


type Phase = { kind: "loading"; label: string } | { kind: "ready" } | { kind: "error"; message: string } | { kind: "done" };
type Check = { state: "checking"; auto?: boolean } | { state: "result"; result: CheckResult; frame: string; id: number; sample: Uint8ClampedArray | null } | { state: "error"; message: string };
// A pending move to the next step after a pass. `id` is the check it came from: it lives only while that result is on
// screen for this step, so a step change, a new check or dismissing the result drops it. `started` once the countdown runs.
type Advance = { id: number; delay: number; waitForVoice: boolean; started: boolean };

// Auto Mode on/off, remembered per device. Off by default, so the manual Check flow is unchanged until it's turned on.
const AUTO_KEY = "buildsight:autoMode";
const autoListeners = new Set<() => void>();
function readAutoMode() {
  try {
    return localStorage.getItem(AUTO_KEY) === "1";
  } catch {
    return false;
  }
}
function setAutoModeStored(on: boolean) {
  try {
    localStorage.setItem(AUTO_KEY, on ? "1" : "0");
  } catch {}
  autoListeners.forEach((fn) => fn());
}
function useAutoMode() {
  return useSyncExternalStore(
    (onChange) => {
      autoListeners.add(onChange);
      return () => void autoListeners.delete(onChange);
    },
    readAutoMode,
    () => false,
  );
}

// The Auto Mode switch. Lit when on; the manual Check button sits beside it and always works.
function AutoToggle({ on, small }: { on: boolean; small?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Auto Mode: check each step automatically"
      title="Auto Mode (A): check each step when you finish it, and move on when it passes"
      onClick={() => setAutoModeStored(!on)}
      className={`flex shrink-0 items-center gap-2 rounded-xl border text-xs font-semibold transition active:scale-95 ${small ? "px-2.5 py-2.5" : "px-3"} ${
        on ? "border-emerald-300/50 bg-emerald-300/15 text-emerald-200" : "border-white/15 bg-white/[0.06] text-white/60 hover:text-white/85"
      }`}
    >
      <span className={`relative h-3.5 w-6 rounded-full transition ${on ? "bg-emerald-300/80" : "bg-white/20"}`}>
        <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all ${on ? "left-3" : "left-0.5"}`} />
      </span>
      Auto
    </button>
  );
}

// Every step picture on one page, cut out and scaled to THUMB_H px tall, decoding the page only once.
// Shared by the step strip and "where am I?" (see thumbsFor), so each picture is cut once per session.
const THUMB_H = 160;
async function stepThumbs(pageImage: string, boxes: ExtractedStep["box"][], pad = 0.02): Promise<string[]> {
  const img = new Image();
  img.src = pageImage;
  await img.decode();
  const out: string[] = [];
  for (const box of boxes) {
    const x = Math.max(0, box.x - pad) * img.width;
    const y = Math.max(0, box.y - pad) * img.height;
    const w = Math.min(Math.min(1, box.w + 2 * pad) * img.width, img.width - x);
    const h = Math.min(Math.min(1, box.h + 2 * pad) * img.height, img.height - y);
    const scale = Math.min(1, THUMB_H / h);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    canvas.getContext("2d")?.drawImage(img, x, y, w, h, 0, 0, canvas.width, canvas.height);
    out.push(await encodeCanvas(canvas, "image/jpeg", 0.8));
  }
  return out;
}

// Lets the phone draw a frame between chunks of picture work, so the screen never freezes.
const breathe = () => new Promise((r) => setTimeout(r, 0));

// Cuts a step's picture out of the rendered page (box is 0–1 of the page), with a little padding.
async function crop(pageImage: string, box: ExtractedStep["box"], pad = 0.02): Promise<string> {
  const img = new Image();
  img.src = pageImage;
  await img.decode();
  const x = Math.max(0, box.x - pad) * img.width;
  const y = Math.max(0, box.y - pad) * img.height;
  const w = Math.min(1, box.w + 2 * pad) * img.width;
  const h = Math.min(1, box.h + 2 * pad) * img.height;
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(w, img.width - x);
  canvas.height = Math.min(h, img.height - y);
  canvas.getContext("2d")?.drawImage(img, x, y, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  return encodeCanvas(canvas, "image/jpeg", 0.75);
}

// Draws a light percentage grid on an image. Claude places boxes far more accurately with it.
async function withGrid(src: string): Promise<string> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const scale = Math.max(1, 700 / img.width); // small crops get upscaled so labels stay legible
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const g = canvas.getContext("2d")!;
  g.drawImage(img, 0, 0, canvas.width, canvas.height);
  g.strokeStyle = "rgba(255,0,150,0.55)";
  g.fillStyle = "rgba(255,0,150,0.9)";
  g.lineWidth = 1;
  g.font = "11px sans-serif";
  for (let i = 1; i < 10; i++) {
    const x = (canvas.width * i) / 10;
    const y = (canvas.height * i) / 10;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, canvas.height);
    g.moveTo(0, y);
    g.lineTo(canvas.width, y);
    g.stroke();
    g.fillText(String(i * 10), x + 2, 11);
    g.fillText(String(i * 10), 2, y - 2);
  }
  return encodeCanvas(canvas, "image/jpeg", 0.75);
}

// "Step 8" or, for a panel inside a step, "Step 8 · 2 of 4".
// A "continued" step (a page with no printed number) shows the step it continues, when known.
function stepLabel(s: ExtractedStep) {
  if (s.continued) return s.number ? `Step ${s.number} · continued` : "Continued";
  return `Step ${s.number}${s.sub ? ` · ${s.sub.replace("/", " of ")}` : ""}`;
}
function spokenStep(s: ExtractedStep) {
  if (s.continued) return `${s.number ? `Step ${s.number}, continued` : "Continuing"}. ${s.instruction}`;
  return `Step ${s.number}${s.sub ? `, part ${s.sub.replace("/", " of ")}` : ""}. ${s.instruction}`;
}

// True on phone-width screens (Tailwind's `sm` breakpoint is 640px).
const PHONE_QUERY = "(max-width: 639px)";
function useIsPhone() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(PHONE_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

// A piece this big on the manual page (geometric mean of width and height, as a share of the page) fills the hologram.
const HOLO_FULL_SIZE = 0.09;

// How many pages ahead to read in the background, and how many Claude calls may run at once.
const LOOKAHEAD = 6;
const MAX_PARALLEL = 3; // uploads share the phone's connection; fewer at once keeps the current page fast
// "Go to step n" searches this many pages each way in a manual that isn't pre-read (each unread page is a Claude call).
const SEARCH_PAGES = 15;

// Runs at most `n` tasks at a time; extra ones wait in line.
function limiter(n: number) {
  let running = 0;
  const queue: (() => void)[] = [];
  return async <T,>(task: () => Promise<T>): Promise<T> => {
    if (running >= n) await new Promise<void>((r) => queue.push(r));
    running++;
    try {
      return await task();
    } finally {
      running--;
      queue.shift()?.();
    }
  };
}

// Where page images come from: pre-read images when we have them, otherwise the PDF (opened only if needed).
type PageSource = { numPages: number; prebuilt: Prebuilt | null; render: (page: number) => Promise<string> };

function makeSource(m: Manual, prebuilt: Prebuilt | null, numPages: number, doc?: PDFDocumentProxy): PageSource {
  let pdf: Promise<PDFDocumentProxy> | null = doc ? Promise.resolve(doc) : null;
  return {
    numPages,
    prebuilt,
    render: (page) =>
      prebuilt?.pages[String(page)]?.length
        ? Promise.resolve(`/steps/${prebuilt.id}/${page}.jpg`)
        : (pdf ??= openManualPdf(m)).then((d) => renderPage(d, page, 1000, 0.7)),
  };
}

type PageJob = { image: () => Promise<string>; steps: Promise<ExtractedStep[]> };

// Renders and reads pages, each at most once: shared by the current page and the read-ahead.
function pageReader(manualId: string, source: PageSource) {
  const jobs = new Map<number, PageJob>();
  const read = new Map<number, ExtractedStep[]>(); // pages whose steps are known, for "where am I?"
  const limit = limiter(MAX_PARALLEL);
  const readPage = (page: number): PageJob => {
    const existing = jobs.get(page);
    if (existing) return existing;
    let rendered: Promise<string> | null = null;
    const image = () => (rendered ??= source.render(page));
    const steps = (async () => {
      const cached = await getPageSteps<ExtractedStep>(manualId, page);
      if (cached) return cached;
      const pre = source.prebuilt?.pages[String(page)];
      if (pre) {
        await savePageSteps(manualId, page, pre);
        return pre;
      }
      const pageImage = await image();
      const data = await limit(async () => {
        const res = await fetch("/api/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page: await withGrid(pageImage) }) });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Couldn't read that page.");
        return body;
      });
      await savePageSteps(manualId, page, data.steps);
      return data.steps as ExtractedStep[];
    })();
    // Continuation pages: a page with no printed step number, or one whose number is lower than the
    // previous page's (step numbers only go up, so a lower one is a panel number from a sub-build),
    // continues the previous page's last step and takes its number.
    const numbered = steps.then(async (found) => {
      if (page < 2 || found.length === 0) return found;
      const before = await (jobs.get(page - 1)?.steps ?? getPageSteps<ExtractedStep>(manualId, page - 1)).catch(() => null);
      const last = before?.filter((s) => s.number).at(-1)?.number;
      if (!last) return found;
      return found.map((s) =>
        (s.continued && !s.number) || (s.number && s.number < last && !s.continued)
          ? { ...s, number: last, continued: true, sub: undefined }
          : s,
      );
    });
    const job = { image, steps: numbered };
    // A failed page can be retried.
    numbered.catch(() => jobs.delete(page));
    numbered.then((found) => read.set(page, found)).catch(() => {});
    jobs.set(page, job);
    return job;
  };
  // Pages read so far that have steps, in order, with their image (for "where am I?").
  const pages = () =>
    [...read.entries()]
      .filter(([, found]) => found.length)
      .sort(([a], [b]) => a - b)
      .map(([p, found]) => ({ page: p, steps: found, image: readPage(p).image }));
  return Object.assign(readPage, { pages, count: () => read.size });
}

export default function BuildView() {
  const { id } = useParams<{ id: string }>();
  const camera = useRef<CameraHandle>(null);
  // What the live mistake boxes need from the camera (read when called, not during render).
  const liveCamera = useMemo(() => ({ size: () => camera.current?.size() ?? null, sample: () => camera.current?.sample() ?? null }), []);
  const direction = useRef<1 | -1>(1);
  const landOn = useRef<number | null>(null); // step number the next page load opens at ("go to step 8")
  const landIdx = useRef<number | null>(null); // exact step index the next page load opens at (step strip)
  const search = useRef(0); // bumped to cancel a running "go to step" search

  const [manual, setManual] = useState<Manual | null>(null);
  const [doc, setDoc] = useState<PageSource | null>(null);
  const [page, setPage] = useState(0);
  const [pageImage, setPageImage] = useState<string | null>(null);
  const [steps, setSteps] = useState<ExtractedStep[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: "loading", label: "Opening manual" });
  const [target, setTarget] = useState<string | null>(null);
  const [targetKey, setTargetKey] = useState<string | null>(null); // which step `target` was cut for
  const [previous, setPrevious] = useState<string | null>(null);
  // A check belongs to the step it ran on (its key); on any other step it isn't shown.
  const [checkState, setCheckState] = useState<(Check & { key: string }) | null>(null);
  const [issuePick, setIssuePick] = useState<number | null>(null); // problem tapped in the list: its box is brightened
  const [showBoxes, setShowBoxes] = useState(true);
  // The checked photo is open full screen while this holds that check's id; a new check (new id), a step change
  // (the check hides) or Close all end it without extra bookkeeping.
  const [photoFor, setPhotoFor] = useState<number | null>(null);
  const checkSeq = useRef(0); // bumped by every new check and step change; older answers are dropped
  // the move to the next step after a pass: shown as a countdown bar with Cancel (see the effect after runCheck)
  const [advance, setAdvance] = useState<Advance | null>(null);
  const voiceDone = useRef<Promise<unknown>>(Promise.resolve()); // resolves when the last check result finishes speaking
  const [muted, setMuted] = useState(false);
  const [showManual, setShowManual] = useState(false); // true = blue "hologram" tint; default is the real colors
  const [zoomOpen, setZoomOpen] = useState(false); // full-screen zoom viewer for the manual picture
  const [shop, setShop] = useState<{ part: string | null } | null>(null); // "Missing a part?" sheet; part = the one a check found missing
  // Phones get a swipeable step card: swipe down to see your build, up for full details.
  const isPhone = useIsPhone();
  const [sheetOpen, setSheetOpen] = useState(true);
  const compact = isPhone && !sheetOpen;

  const stepKey = `${page}-${stepIdx}`;
  // "I'm stuck": smaller sub-steps from the voice assistant, shown as a checklist for this step only.
  const [substeps, setSubsteps] = useState<{ key: string; items: string[]; done: boolean[] } | null>(null);
  const activeSubs = substeps?.key === stepKey ? substeps : null;
  const check = forStep(checkState, stepKey);
  const setCheck = useCallback((c: Check | null) => setCheckState(c && { ...c, key: stepKey }), [stepKey]);
  const verdict = check?.state === "result" ? checkVerdict(check.result) : null;
  const photoOpen = check?.state === "result" && verdict === "fix" && photoFor === check.id;
  // Where each part sits in the manual picture, found once per part (see locatePart).
  const located = useRef(new Map<string, Promise<LocateResult | null>>());
  const [attempt, setAttempt] = useState(0); // bumped by Retry to re-read the page
  const [preview, setPreview] = useState<string | null>(null); // page image shown while Claude reads it
  // Finding the step from the camera, always automatic (no button): see findMyPlace and the auto-detect loop below.
  const [readCount, setReadCount] = useState(0); // pages read so far, in view or in the background
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<{ text: string; problems?: string[] } | null>(null);
  const lastAuto = useRef(0); // when the last automatic check ran
  const lastManual = useRef(0); // when the builder last changed step themselves
  const autoJump = useRef(false); // the next step change is ours, not the builder's
  const firstAutoDone = useRef(false);
  const baseline = useRef<Uint8ClampedArray | null>(null); // camera sample at the last automatic check
  // Auto Mode: checks the build on its own ("changed, then still") and moves on when it passes. See src/lib/autoCheck.ts.
  const autoMode = useAutoMode();
  const watch = useRef(newWatch(0));
  const [autoStatus, setAutoStatus] = useState<string | null>(null); // what Auto Mode is doing, in the step card
  const currentKey = useRef(stepKey);

  // Every page change shows the loading card first.
  const turnTo = useCallback((p: number) => {
    setPhase({ kind: "loading", label: `Reading page ${p}` });
    setCheckState(null);
    setPage(p);
  }, []);

  const step = steps[stepIdx] as ExtractedStep | undefined;
  const part = step?.parts[0];

  // Finds part i of this step in the manual picture (once per part; shared by tap-to-find and the hologram).
  function locatePart(i: number): Promise<LocateResult | null> | null {
    if (!step || !target || targetKey !== stepKey || !step.parts[i]) return null;
    const key = `${stepKey}-${i}`;
    let job = located.current.get(key);
    if (!job) {
      job = withGrid(target)
        .then((image) =>
          fetch("/api/locate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image, part: describePart(step.parts[i]), parts: partLines(step.parts) }) }),
        )
        .then((r) => (r.ok ? (r.json() as Promise<LocateResult>) : null))
        .catch(() => null);
      located.current.set(key, job);
    }
    return job;
  }

  // 1. load the manual and its PDF
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const m = await getManual(id);
      if (!m) return setPhase({ kind: "error", message: "That manual isn't in your library on this device." });
      setManual(m);
      try {
        // A pre-read manual needs no PDF and no Claude calls; otherwise open the PDF.
        const prebuilt = await loadPrebuilt(m);
        const pdf = prebuilt ? undefined : await openManualPdf(m);
        const numPages = prebuilt?.pageCount ?? pdf!.numPages;
        if (cancelled) return;
        const updated = { ...m, pageCount: numPages, openedAt: Date.now() };
        await saveManual(updated);
        setManual(updated);
        setDoc(makeSource(m, prebuilt, numPages, pdf));
        turnTo(Math.min(m.page, numPages));
      } catch (e) {
        setPhase({ kind: "error", message: e instanceof Error ? e.message : "Couldn't open the PDF." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, turnTo]);

  const reader = useMemo(() => (doc && manual ? pageReader(manual.id, doc) : null), [doc, manual?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2. read the current page (and the next few in the background); skip pages with no steps
  useEffect(() => {
    if (!reader || !doc || !manual || page < 1) return;
    let cancelled = false;
    const job = reader(page); // queue the current page before the read-ahead
    for (let k = 1; k <= LOOKAHEAD && page + k <= doc.numPages; k++) reader(page + k);
    const knownEmpty = doc.prebuilt?.pages[String(page)]?.length === 0;
    if (!knownEmpty) job.image().then((img) => !cancelled && setPreview(img)).catch(() => {});
    job.steps
      .then(async (found) => [found.length ? await job.image() : "", found] as const)
      .then(([image, found]) => {
        if (cancelled) return;
        if (found.length === 0) {
          const next = page + direction.current;
          if (next >= 1 && next <= doc.numPages) return turnTo(next);
          if (next > doc.numPages) return setPhase({ kind: "done" });
          direction.current = 1;
          return turnTo(page + 1);
        }
        setPageImage(image);
        setSteps(found);
        const land =
          landIdx.current != null ? Math.min(landIdx.current, found.length - 1) : landOn.current == null ? -1 : found.findIndex((s) => s.number === landOn.current);
        landOn.current = null;
        landIdx.current = null;
        setStepIdx(land >= 0 ? land : direction.current === 1 ? 0 : found.length - 1);
        setPhase({ kind: "ready" });
        saveManual({ ...manual, page, openedAt: Date.now() });
      })
      .catch((e) => !cancelled && setPhase({ kind: "error", message: e instanceof Error ? e.message : "Couldn't read that page." }));
    return () => {
      cancelled = true;
    };
    // manual is saved as a side effect; re-running on its change would loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reader, page, attempt]);

  // 3. cut out this step's target picture (and the one before it) for display and checking
  useEffect(() => {
    if (!pageImage || !step) return;
    let cancelled = false;
    const key = `${page}-${stepIdx}`;
    crop(pageImage, step.box).then((t) => {
      if (cancelled) return;
      setTarget(t);
      setTargetKey(key);
    });
    const prev = steps[stepIdx - 1];
    (prev ? crop(pageImage, prev.box) : Promise.resolve(null)).then((p) => !cancelled && setPrevious(p));
    return () => {
      cancelled = true;
    };
  }, [pageImage, step, steps, stepIdx]); // eslint-disable-line react-hooks/exhaustive-deps -- page changes come with a new pageImage

  // 4. every part of this step, found in the manual's parts box at once (one /api/locate call per part, in
  // parallel, cached), so all parts are boxed on the manual picture and shown as holograms without tapping.
  const MAX_PARTS = 6;
  const [locs, setLocs] = useState<{ key: string; results: (LocateResult | null)[] } | null>(null);
  useEffect(() => {
    if (phase.kind !== "ready" || !step || !target || targetKey !== stepKey) return;
    let cancelled = false;
    const jobs = step.parts.slice(0, MAX_PARTS).map((_, i) => locatePart(i) ?? Promise.resolve(null));
    Promise.all(jobs).then((results) => !cancelled && setLocs({ key: stepKey, results }));
    return () => {
      cancelled = true;
    };
    // locatePart reads the same step/target values listed here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind, step, target, targetKey, stepKey]);
  const stepLocs = locs?.key === stepKey ? locs.results : null;
  const marks: PartMark[] | undefined = stepLocs?.map((r, i) => ({
    callout: r?.callout ?? null,
    placed: r?.placed ?? null,
    label: i + 1,
    dim: false,
  }));

  // Holograms of every part: the real piece cut out of the manual's parts box, at the manual's scale.
  const holos = useRef(new Map<string, Promise<{ cut: Cutout | null; size: number }>>());
  const [holoList, setHoloList] = useState<{ key: string; items: { cut: Cutout | null; size: number }[] } | null>(null);
  useEffect(() => {
    if (phase.kind !== "ready" || !step || !target || targetKey !== stepKey || !pageImage) return;
    let cancelled = false;
    // Cut from the 2400 px page when the manual has one (sharper), else from the page image on screen.
    const hires = doc?.prebuilt?.pages[String(page)]?.length ? `/steps/${doc.prebuilt.id}/hi/${page}.jpg` : null;
    const source = hires ?? pageImage;
    const box = step.box;
    const holoFor = (i: number): Promise<{ cut: Cutout | null; size: number }> => {
      const key = `${stepKey}-${i}`;
      const cached = holos.current.get(key);
      if (cached) return cached;
      const found = locatePart(i);
      if (!found) return Promise.resolve({ cut: null, size: 0 });
      const job = found
        .then(async (result) => {
          const c = result?.callout;
          if (!c) return { cut: null, size: 0 };
          // The callout box is relative to the step picture; map it onto the whole page (same padding as crop()).
          const tx = Math.max(0, box.x - 0.02);
          const ty = Math.max(0, box.y - 0.02);
          const tw = Math.min(box.w + 0.04, 1 - tx);
          const th = Math.min(box.h + 0.04, 1 - ty);
          const onPage = { x: tx + c.x * tw, y: ty + c.y * th, w: c.w * tw, h: c.h * th };
          const pad = 0.008;
          const cut = await cutOutPiece(await crop(source, onPage, pad).catch(() => crop(pageImage, onPage, pad)));
          if (!cut) return { cut: null, size: 0 };
          // Size on the manual page, so pieces keep their proportions to each other from step to step.
          const cropW = Math.min(onPage.w + 2 * pad, 1 - Math.max(0, onPage.x - pad));
          const cropH = Math.min(onPage.h + 2 * pad, 1 - Math.max(0, onPage.y - pad));
          const size = Math.max(0.42, Math.min(1, Math.sqrt(cut.width * cropW * cut.height * cropH) / HOLO_FULL_SIZE));
          return { cut, size };
        })
        .catch(() => ({ cut: null, size: 0 }));
      holos.current.set(key, job);
      return job;
    };
    Promise.all(step.parts.slice(0, MAX_PARTS).map((_, i) => holoFor(i))).then((items) => !cancelled && setHoloList({ key: stepKey, items }));
    return () => {
      cancelled = true;
    };
    // locatePart reads the same step/target values listed here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind, step, target, targetKey, stepKey, pageImage, doc, page]);
  const holoItems = holoList?.key === stepKey ? holoList.items : null;
  const holoState: "scanning" | "ready" | "none" = !holoItems ? "scanning" : holoItems.some((h) => h.cut) ? "ready" : "none";

  // 4. read each new step aloud
  useEffect(() => {
    if (phase.kind === "ready" && step && !muted) speak(spokenStep(step));
  }, [phase.kind, step, muted]);
  useEffect(() => stopSpeaking, []);

  // Back to step 1: page 1 forward, skipping cover/intro pages as usual.
  const restart = useCallback(
    (ask = true) => {
      if (!doc || (ask && !window.confirm("Start over from step 1?"))) return;
      search.current++;
      stopSpeaking();
      direction.current = 1;
      setSheetOpen(true);
      turnTo(1);
      setAttempt((n) => n + 1); // re-read even if we're already on page 1
    },
    [doc, turnTo],
  );

  const go = useCallback(
    (delta: 1 | -1) => {
      if (phase.kind !== "ready" || !doc) return;
      search.current++;
      setCheckState(null);
      direction.current = delta;
      const nextIdx = stepIdx + delta;
      if (nextIdx >= 0 && nextIdx < steps.length) return setStepIdx(nextIdx);
      const nextPage = page + delta;
      if (nextPage < 1) return;
      if (nextPage > doc.numPages) return setPhase({ kind: "done" });
      turnTo(nextPage);
    },
    [phase.kind, doc, stepIdx, steps.length, page, turnTo],
  );

  // Checks the build against this step's manual picture. Asked for (button, Space/Enter, voice "check"): always
  // shows and speaks the result, as before. Automatic (Auto Mode): quiet unless it passes or finds a likely mistake.
  // Either way a pass (isPass) starts a cancellable move to the next step.
  const runCheck = useCallback(async (automatic = false): Promise<CheckResult | null> => {
    if (!step || !target || check?.state === "checking") return null;
    const frame = camera.current?.capture();
    const sample = camera.current?.sample() ?? null; // the view at check time, to tell if the camera moves after
    if (!frame) {
      if (!automatic) setCheck({ state: "error", message: "Camera isn't ready yet." });
      return null;
    }
    if (!automatic) {
      // Pressing Check resumes a paused Auto Mode, and Auto Mode won't re-send the scene just checked.
      const fine = camera.current?.sampleFine();
      if (fine) markChecked(watch.current, fine, Date.now());
      watch.current.misses = 0;
      watch.current.notYet = 0;
    }
    const seq = ++checkSeq.current;
    setAdvance(null);
    setCheck({ state: "checking", auto: automatic });
    setIssuePick(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frame, expected: target, previous: previous ?? undefined, instruction: step.instruction, watchFor: step.watchFor, parts: partLines(step.parts) }),
      });
      const data = await res.json();
      if (seq !== checkSeq.current) return null; // the step changed or a newer check started
      if (!res.ok) throw new Error(data.error);
      const result = data as CheckResult;
      const verdict = checkVerdict(result);
      const pass = isPass(result);
      const loud = !automatic || pass || (verdict === "fix" && result.confidence >= AUTO_SPEAK_FIX_CONFIDENCE);
      voiceDone.current = Promise.resolve();
      if (loud) {
        setCheck({ state: "result", result, frame, id: seq, sample });
        // A mistake is said with where it is ("The red 2x4 near the top left is rotated."), since the builder's eyes
        // are on the bricks; everything else says Claude's own sentence, as before.
        const spoken = verdict === "fix" ? spokenIssues(result.issues) : result.say;
        if (!muted && spoken) voiceDone.current = speaker().say(spoken);
      } else {
        setCheckState(null);
      }
      if (pass) setAdvance({ id: seq, delay: automatic ? AUTO_ADVANCE_MS : MANUAL_ADVANCE_MS, waitForVoice: automatic, started: false });
      return result;
    } catch (e) {
      if (seq !== checkSeq.current) return null;
      if (automatic) setCheckState(null);
      else setCheck({ state: "error", message: e instanceof Error && e.message ? e.message : "Check failed." });
      return null;
    }
  }, [step, target, previous, check?.state, muted, setCheck]);

  // The pending move to the next step. Auto Mode waits for the "verified" line to finish (the mic is off while it
  // speaks), then gives 3 s to cancel: the Cancel button, saying "stop"/"cancel"/"wait", Back or Escape. A manual check
  // moves on 1.8 s after the result, as before. It belongs to the check result on screen, so a step change, a new check
  // or dismissing the result drops it; checkSeq is checked again before moving, so it can never skip an extra step.
  const pending = advance && phase.kind === "ready" && check?.state === "result" && check.id === advance.id ? advance : null;
  const pendingId = pending?.id;
  const pendingDelay = pending?.delay ?? 0;
  const pendingWaits = pending?.waitForVoice ?? false;
  const goNext = useRef(go);
  useEffect(() => {
    goNext.current = go;
  });
  useEffect(() => {
    if (pendingId == null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (pendingWaits ? voiceDone.current : Promise.resolve()).then(() => {
      if (cancelled) return;
      setAdvance((a) => (a?.id === pendingId ? { ...a, started: true } : a));
      timer = setTimeout(() => {
        if (pendingId === checkSeq.current) goNext.current(1);
      }, pendingDelay);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pendingId, pendingDelay, pendingWaits]);

  const speakStep = useCallback(() => {
    if (step && !muted) speak(spokenStep(step));
  }, [step, muted]);

  // Jumps to step n: on this page at once; otherwise reads pages ahead (then behind) until one has step n.
  // Step numbers can repeat in a book (sub-builds restart at 1), so the nearest match wins.
  const goToStep = useCallback(
    async (n: number) => {
      if (!doc || !reader || (phase.kind !== "ready" && phase.kind !== "done")) return;
      const here = phase.kind === "ready" ? steps.findIndex((s) => s.number === n) : -1;
      if (here >= 0) {
        search.current++;
        setCheckState(null);
        if (here === stepIdx) speakStep();
        else setStepIdx(here);
        return;
      }
      const id = ++search.current;
      const reach = doc.prebuilt ? doc.numPages : SEARCH_PAGES; // pre-read books are free to search
      const order: number[] = [];
      for (let k = 1; k <= reach && page + k <= doc.numPages; k++) order.push(page + k);
      for (let k = 1; k <= reach && page - k >= 1; k++) order.push(page - k);
      const wasPhase = phase;
      setCheckState(null);
      setPhase({ kind: "loading", label: `Finding step ${n}` });
      for (let i = 0; i < order.length; i++) {
        order.slice(i + 1, i + 3).forEach((p) => reader(p)); // read the next couple of pages meanwhile
        const found = await reader(order[i]).steps.catch(() => [] as ExtractedStep[]);
        if (search.current !== id) return; // cancelled (Next, Back, Restart, another jump)
        if (found.some((s) => s.number === n)) {
          landOn.current = n;
          direction.current = 1;
          setPhase({ kind: "loading", label: `Opening step ${n}` });
          setPage(order[i]);
          return;
        }
      }
      if (search.current !== id) return;
      setPhase(wasPhase);
      const searchedAll = order.length >= doc.numPages - 1;
      const message = searchedAll ? `I couldn't find step ${n} in this book.` : `I couldn't find step ${n} within ${SEARCH_PAGES} pages of this one.`;
      setCheck({ state: "error", message });
      if (!muted) speak(message);
    },
    [doc, reader, phase, steps, stepIdx, page, muted, speakStep, setCheck],
  );

  // Once a step is up, read the rest of the book in the background, two pages at a time (so the page in view
  // never waits), so "where am I?" can compare against every step. Pre-read manuals are instant.
  // Phones read one page at a time with a short rest between pages, and the screen re-lists the read pages at
  // most every 2 s: rendering and re-rendering for every page made the whole app stutter while a book was read.
  const ready = phase.kind === "ready";
  useEffect(() => {
    if (!reader || !doc || !ready) return;
    let stopped = false;
    let next = 1;
    let shown = 0;
    const show = () => {
      if (stopped) return;
      shown = Date.now();
      setReadCount(reader.count());
    };
    const lane = async () => {
      while (!stopped && next <= doc.numPages) {
        const p = next++;
        await reader(p).steps.catch(() => {});
        if (Date.now() - shown > 2000) show();
        if (isPhone) await new Promise((r) => setTimeout(r, 250));
      }
      show();
    };
    lane();
    if (!isPhone) lane();
    return () => {
      stopped = true;
    };
  }, [reader, doc, ready, isPhone]);

  // Opens a tile's step: on this page at once, otherwise opens its page at that step.
  // Goes straight to a step on a page that's already read: no loading card in between (that flash, and the
  // step strip re-centering from scratch after it, made jumping feel jumpy). False if the page isn't read yet.
  const openReadPage = useCallback(
    (toPage: number, pick: (steps: ExtractedStep[]) => number): boolean => {
      const known = reader?.pages().find((pg) => pg.page === toPage);
      if (!known) return false;
      const idx = Math.max(0, Math.min(pick(known.steps), known.steps.length - 1));
      const id = search.current;
      landIdx.current = idx; // the page effect re-runs for the new page and lands on the same step
      direction.current = 1;
      known
        .image()
        .then((image) => {
          if (search.current !== id) return; // another jump started meanwhile
          setPageImage(image);
          setSteps(known.steps);
          setStepIdx(idx);
          setPage(toPage);
        })
        .catch(() => turnTo(toPage));
      return true;
    },
    [reader, turnTo],
  );

  const openTile = useCallback(
    (t: Tile) => {
      search.current++; // cancel any running "go to step" search
      setCheckState(null);
      if (t.page === page) {
        const idx = steps.findIndex((s) => s.number === t.number);
        if (idx >= 0) return setStepIdx(idx);
      }
      if (openReadPage(t.page, (found) => found.findIndex((s) => s.number === t.number))) return;
      landOn.current = t.number;
      direction.current = 1;
      turnTo(t.page);
    },
    [page, steps, turnTo, openReadPage],
  );

  // Step strip: every step read so far as a small thumbnail, in a sideways scroll inside the step card. Tap one to
  // jump straight there. Fills in as the book is read in the background.
  const stripItems = useMemo(
    () => (reader ? reader.pages().flatMap((pg) => pg.steps.map((st, idx) => ({ page: pg.page, idx, step: st, image: pg.image }))) : []),
    [reader, readCount], // eslint-disable-line react-hooks/exhaustive-deps -- re-list whenever more pages are read
  );
  // Step pictures, cut once per page and kept (the strip shows them, "where am I?" sends them to Claude).
  const pageThumbs = useRef(new Map<number, { steps: ExtractedStep[]; job: Promise<string[]> }>());
  const thumbsFor = useCallback((pg: { page: number; steps: ExtractedStep[]; image: () => Promise<string> }) => {
    const have = pageThumbs.current.get(pg.page);
    if (have && have.steps === pg.steps) return have.job;
    const job = pg
      .image()
      .then((image) => stepThumbs(image, pg.steps.map((st) => st.box)))
      .catch(() => pg.steps.map(() => ""));
    pageThumbs.current.set(pg.page, { steps: pg.steps, job });
    return job;
  }, []);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!reader) return;
    let cancelled = false;
    (async () => {
      for (const pg of reader.pages()) {
        if (pg.steps.every((_, idx) => thumbs[`${pg.page}-${idx}`] !== undefined)) continue;
        const urls = await thumbsFor(pg);
        if (cancelled) return;
        setThumbs((t) => ({ ...t, ...Object.fromEntries(urls.map((u, idx) => [`${pg.page}-${idx}`, u])) }));
        await breathe();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stripItems]); // eslint-disable-line react-hooks/exhaustive-deps -- runs when more pages are read; `thumbs` only skips finished pages
  const jumpToStep = useCallback(
    (toPage: number, idx: number) => {
      search.current++; // cancel any running "go to step" search
      setCheckState(null);
      if (toPage === page) return setStepIdx(idx);
      if (openReadPage(toPage, () => idx)) return;
      landIdx.current = idx;
      direction.current = 1;
      turnTo(toPage);
    },
    [page, turnTo, openReadPage],
  );
  // Centers the current step in the strip whenever it appears or the step changes. Keyed to the step, so swiping
  // the strip doesn't get pulled back on every re-render. A strip that just appeared (still at the start) jumps
  // straight there instead of sliding across every step.
  const centerCurrent = useCallback(
    (el: HTMLButtonElement | null) => {
      if (!el) return;
      const fresh = (el.parentElement?.scrollLeft ?? 0) === 0;
      requestAnimationFrame(() => el.scrollIntoView({ inline: "center", block: "nearest", behavior: fresh ? "auto" : "smooth" }));
    },
    [stepKey], // eslint-disable-line react-hooks/exhaustive-deps -- a new callback per step re-runs it
  );

  // "Where am I?": compares the camera with every step picture read so far. Jumps to the next step, or back to
  // an earlier step that looks broken. Asked for: always answers. Automatic: silent unless the step changes.
  const findMyPlace = useCallback(
    async (automatic = false) => {
      if (!reader || !doc || locating) return;
      const frame = camera.current?.capture();
      const say = (text: string, problems?: string[]) => {
        setNotice({ text, problems });
        if (!muted) speak(text);
      };
      if (!frame) return automatic ? undefined : say("The camera isn't ready yet.");
      const pages = reader.pages();
      if (!pages.length) return automatic ? undefined : say("I haven't read any steps yet. Give me a moment.");
      setLocating(true);
      if (!automatic) setNotice({ text: "Finding your place…" });
      try {
        // The same step pictures the strip shows: already cut, so this is nearly free after the first time.
        const tiles: Tile[] = [];
        for (const pg of pages) {
          const urls = await thumbsFor(pg);
          for (const [idx, st] of pg.steps.entries()) {
            if (tiles.length >= MAX_TILES) break;
            tiles.push({ tile: tiles.length + 1, page: pg.page, number: st.number, image: urls[idx] });
          }
        }
        const complete = reader.count() >= doc.numPages;
        const result = await whereAmI({ frame, tiles, complete });
        const place = decide(result, tiles, complete, step && { page, number: step.number }, automatic ? AUTO_MIN_CONFIDENCE : 0);
        if (place.action === "fix" || place.action === "goto") {
          autoJump.current = true;
          say(place.say, place.action === "fix" ? place.problems : undefined);
          openTile(place.target);
        } else if (!automatic) {
          say(place.say);
        }
      } catch (e) {
        if (!automatic) say(e instanceof Error && e.message ? e.message : "I couldn't find your place.");
      } finally {
        setLocating(false);
      }
    },
    [reader, doc, locating, muted, step, page, openTile, thumbsFor],
  );

  // A new step drops any check still running and a pending auto-advance (the old result hides itself: see `check`).
  useEffect(() => {
    checkSeq.current++;
    // Auto Mode starts each step fresh: new "before" scene, no misses.
    currentKey.current = stepKey;
    resetForStep(watch.current);
  }, [stepKey]);

  // Step changes the builder made (Next, Back, voice, tapping) hold off automatic jumps for a while.
  useEffect(() => {
    if (autoJump.current) autoJump.current = false;
    else lastManual.current = Date.now();
  }, [stepKey]);


  // Automatic detection. Watches a tiny grayscale camera sample on the phone (no network). Once the whole
  // book is read it checks once, then again whenever the build has changed and the scene has held still for
  // 1.5 s (hands out of the way). At most every 20 s, and not within 20 s of the builder changing step.
  //
  // Auto Mode shares this loop: while it's on and the step's picture is ready, the "changed, then still" moment runs the
  // cheap step check (3 images) instead of "where am I" (up to 8 contact sheets). "Where am I" then only runs after 2
  // "not done yet" results in a row, in case the builder skipped ahead. Unlike "where am I", Auto Mode keeps watching
  // while a mistake is on screen, so it notices when the builder fixes it.
  type AutoState = {
    ready: boolean;
    busy: boolean;
    checking: boolean;
    findMyPlace: (automatic?: boolean) => void;
    autoMode: boolean;
    canCheck: boolean;
    pending: boolean;
    runCheck: (automatic?: boolean) => Promise<CheckResult | null>;
  };
  const autoState = useRef<AutoState>({
    ready: false, busy: false, checking: false, findMyPlace: () => {}, autoMode: false, canCheck: false, pending: false, runCheck: async () => null,
  });
  useEffect(() => {
    // A mistake on screen pauses it too, so it doesn't jump away while the builder is fixing it.
    const reviewing = check?.state === "result" && check.result.issues.length > 0;
    autoState.current = {
      ready,
      busy: locating || check?.state === "checking" || reviewing,
      checking: locating || check?.state === "checking",
      findMyPlace,
      autoMode,
      canCheck: !!step && !!target && targetKey === stepKey,
      pending: !!pending,
      runCheck,
    };
  });
  useEffect(() => {
    if (!reader || !doc) return;
    let prev: Uint8ClampedArray | null = null;
    let stillSince = Date.now();
    const timer = setInterval(() => {
      const st = autoState.current;
      if (st.autoMode && st.canCheck) {
        const fine = camera.current?.sampleFine();
        if (!fine) return;
        const now = Date.now();
        const w = watch.current;
        const t = tick(w, fine, now, !st.ready || st.checking || st.pending || speaker().speaking);
        // For tuning under the venue lights: how much the table differs from the last checked scene.
        console.log(
          `[auto] change ${t.change == null ? "—" : (t.change * 100).toFixed(1) + "%"} (needs ${(AUTO_CHANGE_THRESHOLD * 100).toFixed(1)}%)` +
            ` · motion ${(t.motion * 100).toFixed(1)}% · still ${(t.stillMs / 1000).toFixed(1)}s · ${t.reason}`,
        );
        // A miss stays on the status line until the scene moves again.
        if (w.misses >= AUTO_MAX_MISSES) setAutoStatus(`Auto · paused after ${AUTO_MAX_MISSES} tries · press Check`);
        else if (!st.checking && !st.pending && (w.misses === 0 || t.reason === "moving")) setAutoStatus("Auto · watching");
        if (!t.check) return;
        markChecked(w, fine, now);
        setAutoStatus("Auto · checking…");
        const key = currentKey.current;
        st.runCheck(true).then((r) => {
          if (currentKey.current !== key || (r && isPass(r))) return; // moved on meanwhile, or passed
          const verdict = r ? checkVerdict(r) : "unsure";
          setAutoStatus(verdict === "notyet" ? "Auto · not done yet" : verdict === "fix" ? "Auto · needs a fix" : "Auto · need a better look");
          if (recordMiss(w, verdict) && reader.count() >= doc.numPages) autoState.current.findMyPlace(true);
        });
        return;
      }
      const sample = camera.current?.sample();
      if (!sample) return;
      const now = Date.now();
      const moving = !prev || changed(prev, sample) > 0.02;
      prev = sample;
      if (moving) {
        stillSince = now;
        return;
      }
      if (now - stillSince < 1500) return;
      if (!st.ready || st.busy || st.pending || speaker().speaking || reader.count() < doc.numPages) return;
      if (firstAutoDone.current) {
        if (now - lastAuto.current < 20000 || now - lastManual.current < 20000) return;
        if (baseline.current && changed(baseline.current, sample) < 0.04) return; // nothing new on the table
      }
      firstAutoDone.current = true;
      lastAuto.current = now;
      baseline.current = sample;
      st.findMyPlace(true);
    }, 500);
    return () => clearInterval(timer);
  }, [reader, doc]);

  // The notice fades after a while (problem lists stay longer). Tap to dismiss.
  useEffect(() => {
    if (!notice || locating) return;
    const t = setTimeout(() => setNotice(null), notice.problems?.length ? 20000 : 8000);
    return () => clearTimeout(t);
  }, [notice, locating]);

  // Actions from the voice assistant's reply ("go back", "take me to step 5", "I'm stuck").
  const onAction = useCallback(
    (a: AssistAction) => {
      switch (a.action) {
        case "next":
          return go(1);
        case "prev":
          return go(-1);
        case "goto":
          return void goToStep(a.goto_step);
        case "add_substeps":
          return setSubsteps({ key: stepKey, items: a.substeps, done: a.substeps.map(() => false) });
      }
    },
    [go, goToStep, stepKey],
  );

  // Spoken commands from the voice panel; returns what to show in the transcript, or null to ask Claude instead.
  const onCommand = useCallback(
    (text: string): string | null => {
      const c = matchCommand(text);
      if (!c) return null;
      if (c.kind === "stop") {
        stopSpeaking();
        if (pending) {
          setAdvance(null);
          return "Staying on this step.";
        }
        return "Stopped.";
      }
      if (c.kind === "auto") {
        setAutoModeStored(c.on);
        return c.on ? "Auto Mode on: I'll check each step when you finish it." : "Auto Mode off.";
      }
      if (phase.kind === "loading") return "One moment, still loading.";
      switch (c.kind) {
        case "next":
          go(1);
          return "Next step.";
        case "back":
          go(-1);
          return "Previous step.";
        case "repeat":
          if (!step) return null;
          speakStep();
          return spokenStep(step);
        case "check":
          runCheck();
          return "Checking your build…";
        case "goto":
          goToStep(c.step);
          return `Going to step ${c.step}.`;
        case "locate":
          findMyPlace();
          return "Finding your place…";
      }
    },
    [phase.kind, go, step, speakStep, runCheck, goToStep, findMyPlace, pending],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (zoomOpen || photoOpen || shop) return; // the zoom viewer and the shop sheet handle their own keys
      if (e.target instanceof HTMLElement && e.target.closest("button, input, textarea")) return; // a focused button handles its own Enter/Space
      if (e.key === "a" || e.key === "A") setAutoModeStored(!readAutoMode());
      if (e.key === "Escape") setAdvance(null);
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        runCheck();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, runCheck, zoomOpen, photoOpen, shop]);

  // Phones are short: while a check result shows, the step card drops the extras (holograms, chips, tip) to make room.
  const roomForResult = isPhone && check != null && check.state !== "checking";


  return (
    <main className="relative h-dvh w-full overflow-hidden bg-ink text-white">
      <CameraFeed ref={camera} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink/70 via-transparent to-ink/80" />
      {/* the mistake boxes on the live camera too, while the camera stays where it was for the check */}
      {check?.state === "result" && verdict === "fix" && showBoxes && (
        <LiveIssueBoxes issues={check.result.issues} selected={issuePick} baseline={check.sample} camera={liveCamera} />
      )}

      {/* top bar */}
      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
        <Link href="/" className="hud-panel flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-white/85 transition hover:text-white">
          ← Hub
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-[15px] font-semibold tracking-tight">{manual?.title ?? "BuildSight"}</p>
          <p className="truncate text-[11px] text-white/50">
            {manual?.subtitle}
            {doc && page > 0 ? ` · Page ${page}/${doc.numPages}` : ""}
            {doc && readCount > 0 && readCount < doc.numPages ? ` · read ${readCount}/${doc.numPages}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
        <button
          onClick={() => restart()}
          disabled={!doc}
          aria-label="Restart from step 1"
          title="Restart from step 1"
          className="hud-panel grid h-9 w-9 place-items-center rounded-xl text-white/85 transition hover:text-white disabled:opacity-40"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 4v5h5" />
          </svg>
        </button>
        <button
          onClick={() => {
            setMuted((m) => !m);
            stopSpeaking();
          }}
          className="hud-panel rounded-xl px-3 py-2 text-xs font-medium text-white/85"
          aria-pressed={muted}
        >
          {muted ? "Voice off" : "Voice on"}
        </button>
        </div>
      </header>

      {/* reticle: shows while a check is running */}
      <AnimatePresence>
        {check?.state === "checking" && !check.auto && (
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute left-1/2 top-[42%] z-10 -translate-x-1/2 -translate-y-1/2">
            <svg viewBox="0 0 200 200" className="h-56 w-56">
              <g className="spin-fast" style={{ transformBox: "fill-box" }}>
                <circle cx="100" cy="100" r="90" fill="none" stroke="rgba(79,195,255,0.8)" strokeWidth="2" strokeDasharray="30 20" />
              </g>
              <g className="spin-rev" style={{ transformBox: "fill-box" }}>
                <circle cx="100" cy="100" r="70" fill="none" stroke="rgba(79,195,255,0.5)" strokeWidth="1.5" strokeDasharray="4 8" />
              </g>
              <path d="M100 20v20M100 160v20M20 100h20M160 100h20" stroke="rgba(79,195,255,0.9)" strokeWidth="2" />
            </svg>
            <p className="mt-2 text-center text-xs font-medium text-sky-200 holo-text">Checking your build…</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* target state: the manual's picture of this step (drag to move, corner grip to resize, tap to zoom) */}
      <AnimatePresence>
        {target && phase.kind === "ready" && (
          <ManualPanel
            key={target.slice(-40)}
            target={target}
            stepNumber={step && stepLabel(step).replace(/^Step /, "")}
            glow={showManual}
            marks={marks}
            compact={compact}
            defaultClassName={`absolute right-3 top-20 z-10 transition-[width] duration-300 sm:right-6 sm:top-24 sm:w-72 ${compact ? "w-24" : "w-36"}`}
            onOpen={() => setZoomOpen(true)}
          />
        )}
      </AnimatePresence>

      {/* full-screen zoom viewer for the manual picture */}
      {/* "Missing a part?": shopping links for a part of this step */}
      <AnimatePresence>
        {shop && manual && step && (
          <ShopSheet key="shop" manual={manual} parts={step.parts} initial={shop.part} onClose={() => setShop(null)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {zoomOpen && target && phase.kind === "ready" && (
          <ZoomViewer
            key="zoom"
            target={target}
            pageImage={pageImage}
            stepNumber={step && stepLabel(step).replace(/^Step /, "")}
            glow={showManual}
            onGlowChange={setShowManual}
            marks={marks}
            onClose={() => setZoomOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* full-screen checked photo with the mistake boxes (same viewer, photo mode) */}
      <AnimatePresence>
        {photoOpen && check?.state === "result" && (
          <ZoomViewer
            key="photo"
            target={check.frame}
            pageImage={null}
            stepNumber={step && stepLabel(step).replace(/^Step /, "")}
            glow={false}
            onGlowChange={() => {}}
            photo={{ label: photoLabel(check.result.issues), overlay: showBoxes && <IssueBoxes issues={check.result.issues} selected={issuePick} /> }}
            onClose={() => setPhotoFor(null)}
          />
        )}
      </AnimatePresence>

      {/* voice: talk to BuildSight (top-left on phones, bottom-right on desktop) */}
      <div className={`absolute left-3 right-[10.5rem] top-20 z-20 sm:left-auto sm:right-6 sm:top-auto sm:bottom-6 sm:w-80`}>
        <VoicePanel
          getFrame={() => camera.current?.capture() ?? null}
          muted={muted}
          compact={compact}
          onCommand={onCommand}
          onAction={onAction}
          context={{
            manual: manual?.title,
            step: step && { number: step.sub ? `${step.number} (${step.sub.replace("/", " of ")})` : step.number, instruction: step.instruction, parts: step.parts.map((p) => `${p.qty}x ${describePart(p)}`), watchFor: step.watchFor },
          }}
        />
      </div>

      {/* bottom: hologram + step card */}
      {/* above the manual panel (z-25) while a "where am I?" message shows, so it's never hidden */}
      <div className={`absolute inset-x-0 bottom-0 ${notice ? "z-30" : "z-10"} flex flex-col gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:bottom-6 sm:left-6 sm:right-auto sm:w-[440px] sm:p-0`}>
        {/* "where am I?" result (asked for, or an automatic jump) */}
        <AnimatePresence>
          {notice && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              onClick={() => setNotice(null)}
              role="status"
              className={`hud-panel rounded-2xl !bg-ink/95 px-4 py-3 text-sm ${notice.problems?.length ? "border border-amber-300/40 text-amber-50" : "text-sky-50"}`}
            >
              <p>{notice.text}</p>
              {notice.problems && notice.problems.length > 1 && (
                <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-white/75">
                  {notice.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ol>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        {/* a pass: moving to the next step, with a chance to cancel */}
        <AnimatePresence>
          {pending && (
            <motion.div
              key={`advance-${pending.id}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              role="status"
              className="hud-panel overflow-hidden rounded-2xl border border-emerald-400/40 !bg-ink/95 text-sm text-emerald-100"
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <p className="min-w-0 flex-1">
                  <span className="font-semibold">Verified</span>
                  <span className="text-emerald-100/70"> · {pending.started ? `next step in ${Math.round(pending.delay / 1000)} s` : "next step after this"}</span>
                </p>
                <button
                  onClick={() => setAdvance(null)}
                  className="shrink-0 rounded-lg border border-white/20 bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/15 active:scale-95"
                >
                  Cancel
                </button>
              </div>
              {pending.started && (
                <motion.div
                  className="h-1 origin-left bg-emerald-300/80"
                  initial={{ scaleX: 1 }}
                  animate={{ scaleX: 0 }}
                  transition={{ duration: pending.delay / 1000, ease: "linear" }}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {phase.kind === "ready" && part && !compact && !roomForResult && (
          // On phones the manual panel sits top right (about 9rem wide), so keep the holograms left of it.
          <div className="flex items-end justify-start gap-3 pr-[10rem] sm:pr-0">
            {holoState !== "none" && step && (
              // Every part of the step as a hologram, numbered to match its boxes on the manual picture.
              <div className="flex max-w-full items-end gap-1 overflow-x-auto pb-4 [scrollbar-width:none] sm:gap-2">
                {step.parts.slice(0, MAX_PARTS).map((p, i) => {
                  const h = holoItems?.[i];
                  if (holoItems && !h?.cut) return null; // couldn't cut this one out of the manual
                  const many = step.parts.length > 1;
                  const lots = step.parts.length > 2; // one part is as small as two, so the row never dominates the screen
                  return (
                    <div
                      key={`${stepKey}-${i}`}
                      aria-label={`${p.name}, ${p.qty} needed`}
                      className={`relative shrink-0 ${lots ? "h-20 w-20 sm:h-28 sm:w-28" : "h-24 w-24 sm:h-32 sm:w-32"}`}
                    >
                      <PieceHologram state={h?.cut ? "ready" : "scanning"} cutout={h?.cut} size={h?.size} pieceKey={`${stepKey}-${i}`} />
                      {h?.cut && (
                        // How many to grab: big and bold, amber when it's more than one so it isn't missed.
                        <span
                          aria-hidden
                          className={`absolute right-0 top-0 rounded-lg px-2 py-0.5 text-base font-extrabold leading-tight shadow-[0_2px_10px_rgba(0,0,0,0.5)] ${
                            p.qty > 1 ? "bg-amber-300 text-ink" : "bg-white text-ink"
                          }`}
                        >
                          ×{p.qty}
                        </span>
                      )}
                      {h?.cut && check?.state !== "checking" && (
                        <span className="absolute -bottom-3 left-1/2 flex max-w-full -translate-x-1/2 items-center gap-1 whitespace-nowrap text-[11px] font-medium text-sky-200/80">
                          {many ? <span className="rounded bg-sky-300 px-1 text-[9px] font-bold leading-[14px] text-ink">{i + 1}</span> : <span>Next part</span>}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.section
            key={phase.kind} // one card for all steps: a step change updates it in place instead of fading it out and in
            initial={{ opacity: 0, y: 24, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -12, filter: "blur(6px)" }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            // Phones: swipe down to collapse to a slim bar, swipe up to expand.
            drag={isPhone ? "y" : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.35}
            dragSnapToOrigin
            onDragEnd={(_, info) => {
              if (info.offset.y > 50 || info.velocity.y > 400) setSheetOpen(false);
              else if (info.offset.y < -50 || info.velocity.y < -400) setSheetOpen(true);
            }}
            className={`hud-panel holo-glow rounded-3xl touch-none sm:touch-auto ${compact ? "px-4 pb-3 pt-2" : "px-4 pb-4 pt-2 sm:p-5"}`}
          >
            {isPhone && (
              <button
                onClick={() => setSheetOpen((o) => !o)}
                aria-label={sheetOpen ? "Collapse step card" : "Expand step card"}
                className="mx-auto mb-2 block h-5 w-16"
              >
                <span className="mx-auto block h-1.5 w-10 rounded-full bg-white/30" />
              </button>
            )}

            {compact && phase.kind === "ready" && step && (
              <div className="flex items-center gap-3">
                <button onClick={() => setSheetOpen(true)} className="min-w-0 flex-1 text-left">
                  <p className="text-[11px] font-semibold text-sky-300">
                    {stepLabel(step)}
                    {check?.state === "result" && (
                      <span className={verdict === "pass" ? "text-emerald-300" : verdict === "fix" ? "text-red-300" : "text-white/50"}>
                        {" "}· {{ pass: "Verified", fix: "Hold on", notyet: "Not done yet", unsure: "Need a better look" }[verdict ?? "unsure"]}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm font-medium">{step.instruction}</p>
                </button>
                <AutoToggle on={autoMode} small />
                <button
                  onClick={() => runCheck()}
                  disabled={check?.state === "checking"}
                  className="shrink-0 rounded-xl bg-gradient-to-b from-sky-300 to-sky-500 px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-60"
                >
                  {check?.state === "checking" ? "…" : "Check"}
                </button>
              </div>
            )}

            {phase.kind === "loading" && (
              <div>
                <p className="text-xs font-semibold text-sky-300">
                  {phase.label}
                  {doc && page > 0 && phase.label.startsWith("Reading page") ? ` of ${doc.numPages}` : ""}
                </p>
                {!compact && steps.length === 0 && page > 1 && (
                  <p className="mt-1 text-[11px] text-white/50">Finding step 1: manuals often open with safety and parts pages, which I skip.</p>
                )}
                <div className="scan-bar mt-3 h-1 rounded-full" />
                {compact ? null : preview ? (
                  <div className="relative mt-3 overflow-hidden rounded-xl bg-ink/60">
                    <img src={preview} alt="Manual page being read" className="max-h-56 w-full object-contain" />
                    <span className="hud-sweep pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-transparent via-sky-300/25 to-transparent" />
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-white/50">Opening the manual…</p>
                )}
              </div>
            )}

            {phase.kind === "error" && (
              <div>
                <p className="text-xs font-semibold text-rose-300">System error</p>
                <p className="mt-2 text-sm text-white/80">{phase.message}</p>
                <div className="mt-4 flex gap-2">
                  <Link href="/" className="rounded-xl border border-white/15 px-4 py-2.5 text-sm">Back to hub</Link>
                  {doc && (
                    <button
                      onClick={() => {
                        setPhase({ kind: "loading", label: `Reading page ${page}` });
                        setAttempt((a) => a + 1);
                      }}
                      className="rounded-xl bg-holo px-4 py-2.5 text-sm font-semibold text-ink"
                    >
                      Retry
                    </button>
                  )}
                </div>
              </div>
            )}

            {phase.kind === "done" && (
              <div>
                <p className="text-xs font-semibold text-emerald-300">Build complete</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">That&apos;s the last step in this manual.</p>
                <div className="mt-4 flex gap-2">
                  <button onClick={() => restart(false)} className="rounded-xl bg-holo px-4 py-2.5 text-sm font-semibold text-ink">
                    Start over
                  </button>
                  <Link href="/" className="rounded-xl border border-white/15 px-4 py-2.5 text-sm">Back to hub</Link>
                </div>
              </div>
            )}

            {phase.kind === "ready" && step && !compact && (
              <>
                {stripItems.length > 1 && (
                  <div
                    aria-label="All steps"
                    className="-mx-2 mb-2 flex snap-x gap-1.5 overflow-x-auto px-2 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                    {stripItems.map((item) => {
                      const key = `${item.page}-${item.idx}`;
                      const current = item.page === page && item.idx === stepIdx;
                      const thumb = thumbs[key];
                      return (
                        <button
                          key={key}
                          ref={current ? centerCurrent : undefined}
                          onClick={() => jumpToStep(item.page, item.idx)}
                          aria-current={current ? "step" : undefined}
                          aria-label={`Go to step ${item.step.number}${item.step.sub ? `, part ${item.step.sub}` : ""}`}
                          className={`relative h-10 w-14 shrink-0 snap-center overflow-hidden rounded-lg bg-white transition ${
                            current ? "ring-2 ring-sky-300 ring-offset-2 ring-offset-ink" : "opacity-60 hover:opacity-100"
                          }`}
                        >
                          {thumb ? <img src={thumb} alt="" className="h-full w-full object-contain" /> : <span className="absolute inset-0 animate-pulse bg-white/80" />}
                          <span className={`absolute left-0 top-0 rounded-br px-1 text-[9px] font-bold leading-[13px] ${current ? "bg-sky-300 text-ink" : "bg-ink/80 text-white"}`}>
                            {item.step.number}
                            {item.step.sub ? `·${item.step.sub.split("/")[0]}` : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="flex items-baseline justify-between">
                  <p className="text-xs font-semibold text-sky-300">{stepLabel(step)}</p>
                  {/* the step is found from the camera automatically; while a check runs it says so here */}
                  <p className={`truncate pl-3 text-[11px] ${locating || autoMode ? "text-sky-300/80" : "text-white/40"}`} aria-live="polite">
                    {locating ? "Checking where you are…" : autoMode ? (autoStatus ?? "Auto · watching") : `${stepIdx + 1}/${steps.length} on page ${page}`}
                  </p>
                </div>
                {/* the card stays put between steps; just the new instruction fades in */}
                <motion.h1
                  key={stepKey}
                  initial={{ opacity: 0.3 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                  className="mt-0.5 text-[17px] font-semibold leading-snug sm:text-2xl"
                >
                  {step.instruction}
                </motion.h1>
                {step.parts.length > 0 && manual && !roomForResult && (
                  <button onClick={() => setShop({ part: null })} className="mt-1 text-[11px] font-medium text-sky-300/80 underline-offset-2 hover:text-sky-200 hover:underline">
                    Missing a part?
                  </button>
                )}

                {/* "I'm stuck": the step broken into smaller actions. Tap one to tick it off. */}
                <AnimatePresence>
                  {activeSubs && !roomForResult && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-2 overflow-hidden rounded-xl border border-sky-300/25 bg-sky-300/[0.06] px-3 py-2"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-semibold text-sky-300">Smaller steps</p>
                        <button onClick={() => setSubsteps(null)} aria-label="Hide smaller steps" className="px-1 text-xs text-white/40 hover:text-white/80">
                          ✕
                        </button>
                      </div>
                      <ol className="mt-1 space-y-1">
                        {activeSubs.items.map((text, i) => {
                          const done = activeSubs.done[i];
                          return (
                            <li key={i}>
                              <button
                                onClick={() => setSubsteps((sub) => sub && { ...sub, done: sub.done.map((d, j) => (j === i ? !d : d)) })}
                                aria-pressed={done}
                                className="flex w-full items-start gap-2 text-left text-[13px] leading-snug"
                              >
                                <span
                                  className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[9px] font-bold ${
                                    done ? "border-emerald-300 bg-emerald-300/20 text-emerald-200" : "border-white/30 text-white/55"
                                  }`}
                                >
                                  {done ? "✓" : i + 1}
                                </span>
                                <span className={done ? "text-white/40 line-through" : "text-white/85"}>{text}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ol>
                    </motion.div>
                  )}
                </AnimatePresence>

                {step.watchFor[0] && !roomForResult && !(isPhone && activeSubs) && (
                  <p className="mt-2 flex gap-2 text-xs text-amber-200/90">
                    <span className="font-mono">⚠</span>
                    <span className="line-clamp-2">{step.watchFor[0]}</span>
                  </p>
                )}

                <AnimatePresence>
                  {check && check.state !== "checking" && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      // a mistake stays until Check again passes or Close; other results close on a tap
                      onClick={verdict === "fix" ? undefined : () => setCheckState(null)}
                      title={verdict === "fix" ? undefined : "Tap to dismiss"}
                      className={`mt-4 overflow-hidden rounded-xl border p-3 text-sm ${verdict === "fix" ? "" : "cursor-pointer"} ${
                        check.state === "error" || verdict === "unsure" || verdict === "notyet"
                          ? "border-white/15 bg-white/5 text-white/80"
                          : verdict === "pass"
                            ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                            : "border-red-400/50 bg-red-500/10 text-red-50"
                      }`}
                    >
                      {check.state === "error" ? (
                        check.message
                      ) : (
                        <>
                          <p className="text-[11px] font-semibold">
                            {{ pass: "Verified", fix: "Hold on", notyet: "Not done yet", unsure: "Need a better look" }[verdict ?? "unsure"]}
                            {verdict !== "unsure" && ` · ${Math.round(check.result.confidence * 100)}%`}
                          </p>
                          <p className="mt-1">{check.result.say}</p>
                          {verdict === "fix" && check.result.issues.length > 0 && (
                            <>
                              {/* Phones: just your photo with the boxes (the manual picture is already on screen). Desktop: side by side. */}
                              <div className="mt-3 grid grid-cols-[auto] items-start gap-2 sm:grid-cols-2">
                                <figure className="hidden sm:block">
                                  <img src={target ?? ""} alt="Manual" className="max-h-56 w-full rounded-md bg-white object-contain" />
                                  <figcaption className="mt-1 text-[10px] text-white/50">Manual</figcaption>
                                </figure>
                                <figure>
                                  <CheckErrorOverlay
                                    frame={check.frame}
                                    issues={check.result.issues}
                                    selected={issuePick}
                                    show={showBoxes}
                                    big={isPhone}
                                    onOpen={() => setPhotoFor(check.id)}
                                  />
                                  <figcaption className="mt-1 text-[10px] text-white/50">Your build</figcaption>
                                </figure>
                              </div>
                              {/* phones: a long list scrolls inside the card so the card never grows past the header */}
                              <ol
                                className={`mt-3 space-y-1.5 ${isPhone ? "max-h-[22dvh] touch-pan-y overflow-y-auto overscroll-contain" : ""}`}
                                data-issue-list
                              >
                                {check.result.issues.map((issue, i) => (
                                  <li key={i} className="flex gap-1.5">
                                    <button
                                      onClick={() => setIssuePick((p) => (p === i ? null : i))}
                                      aria-label={issueLabel(issue, i + 1)}
                                      aria-pressed={issuePick === i}
                                      className={`flex min-w-0 flex-1 gap-2 rounded-lg px-2 py-1.5 text-left transition ${issuePick === i ? "bg-red-500/25" : "bg-black/20"}`}
                                    >
                                      <span className="mt-px flex h-[18px] min-w-[18px] items-center justify-center gap-0.5 rounded bg-red-500 px-1 text-[11px] font-bold leading-[18px] text-white">
                                        <WarnGlyph />
                                        {i + 1}
                                      </span>
                                      <span className="min-w-0">
                                        <span className="mr-1.5 rounded border border-red-400/60 px-1 text-[10px] font-semibold uppercase tracking-wide text-red-200">
                                          {CATEGORY_TAG[issueCategory(issue.kind)]}
                                        </span>
                                        <span className="font-semibold">{issue.part || "Piece"}</span>
                                        {issue.problem && <span className="text-red-100/80">: {issue.problem}</span>}
                                        {issue.fix && <span className="block text-white/85">{issue.fix}</span>}
                                        {!issue.box && <span className="block text-[10px] text-white/45">Couldn&apos;t pin this one on the photo</span>}
                                      </span>
                                    </button>
                                    {/* a missing piece can be ordered: opens the shop sheet on that part */}
                                    {issueCategory(issue.kind) === "missing" && manual && (
                                      <button
                                        onClick={() => setShop({ part: issue.part || null })}
                                        aria-label={`Shop for ${issue.part || "the missing piece"}`}
                                        className="shrink-0 self-start rounded-lg border border-sky-300/40 bg-sky-300/10 px-2.5 py-1.5 text-[11px] font-semibold text-sky-100 active:scale-95"
                                      >
                                        Shop
                                      </button>
                                    )}
                                  </li>
                                ))}
                              </ol>
                              <div className="mt-3 flex gap-2">
                                <button
                                  onClick={() => runCheck()}
                                  className="flex-1 rounded-lg bg-red-500 py-2 text-xs font-semibold text-white active:scale-[0.98]"
                                >
                                  Check again
                                </button>
                                {check.result.issues.some((i) => i.box) && (
                                  <button onClick={() => setShowBoxes((v) => !v)} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-medium">
                                    {showBoxes ? "Hide boxes" : "Show boxes"}
                                  </button>
                                )}
                                <button onClick={() => setCheckState(null)} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-medium">
                                  Close
                                </button>
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Back / Next are gone: the step strip, voice ("next", "go to step 8") and auto-detect move between steps.
                    Phones hide it during a mistake review: "Check again" does the same and the photo needs the room. */}
                <div className={`${isPhone && verdict === "fix" ? "hidden" : "flex"} mt-3 gap-2`}>
                <button
                  onClick={() => runCheck()}
                  disabled={check?.state === "checking"}
                  className={`min-w-0 flex-1 rounded-xl bg-gradient-to-b from-sky-300 to-sky-500 py-2.5 text-sm font-semibold text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_6px_20px_-6px_rgba(92,200,255,0.7)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60`}
                >
                  {check?.state === "checking" ? "Checking…" : "Check build"}
                </button>
                <AutoToggle on={autoMode} />
                </div>
              </>
            )}
          </motion.section>
        </AnimatePresence>
      </div>
    </main>
  );
}
