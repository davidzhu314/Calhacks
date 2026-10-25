/* eslint-disable @next/next/no-img-element -- step pictures are data URLs rendered in the browser */
"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { PartMarks, type PartMark } from "@/components/HighlightBox";

// Where the user put the panel: left/top and width in px. Remembered per device.
type Place = { x: number; y: number; w: number };
const KEY = "buildsight.manualPanel";
const MIN_W = 96;
const MAX_W = 640;
const EDGE = 8; // gap kept from the screen edges
const DRAG = 6; // px of movement before a press counts as a drag instead of a tap

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

// Keeps the panel fully on screen.
function onScreen(p: Place, height: number): Place {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = clamp(p.w, MIN_W, Math.min(MAX_W, vw - 2 * EDGE));
  return { w, x: clamp(p.x, EDGE, vw - w - EDGE), y: clamp(p.y, EDGE, vh - height - EDGE) };
}

function load(): Place | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (![p?.x, p?.y, p?.w].every((n) => typeof n === "number" && Number.isFinite(n))) return null;
    return onScreen(p, p.w); // height isn't known yet; roughly square is close enough until it's measured
  } catch {
    return null;
  }
}

function save(p: Place) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
}

// The manual's picture of this step, top right by default. Drag to move, drag the corner grip to resize, tap to zoom.
export default function ManualPanel({
  target,
  stepNumber,
  glow,
  marks,
  compact,
  defaultClassName,
  onOpen,
}: {
  target: string;
  stepNumber?: string | number;
  glow: boolean;
  marks?: PartMark[]; // every part of this step: where it is in the parts box and where it goes
  compact: boolean;
  defaultClassName: string; // position and width before the user moves or resizes it
  onOpen: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const [place, setPlace] = useState<Place | null>(load);
  const gesture = useRef<{ mode: "move" | "resize"; id: number; sx: number; sy: number; start: Place; last: Place | null } | null>(null);
  const suppressClick = useRef(false);

  // Rotating the phone or resizing the window keeps it on screen.
  useEffect(() => {
    const onResize = () => setPlace((p) => p && onScreen(p, ref.current?.offsetHeight ?? 0));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const start = (e: React.PointerEvent, mode: "move" | "resize") => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    suppressClick.current = false; // a drag that ended without a click mustn't swallow this tap
    const r = ref.current!.getBoundingClientRect();
    gesture.current = { mode, id: e.pointerId, sx: e.clientX, sy: e.clientY, start: place ?? { x: r.left, y: r.top, w: r.width }, last: null };
  };

  const move = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.sx;
    const dy = e.clientY - g.sy;
    if (!g.last && Math.hypot(dx, dy) < DRAG) return;
    const h = ref.current?.offsetHeight ?? 0;
    let next: Place;
    if (g.mode === "move") {
      next = onScreen({ ...g.start, x: g.start.x + dx, y: g.start.y + dy }, h);
    } else {
      // the grip is bottom-left: the left edge follows the finger and the right edge stays put,
      // until the left edge reaches the screen side, then it grows to the right instead
      const right = g.start.x + g.start.w;
      const w = clamp(g.start.w - dx, MIN_W, MAX_W);
      next = onScreen({ x: right - w, y: g.start.y, w }, (h * w) / Math.max(1, g.start.w));
    }
    g.last = next;
    setPlace(next);
  };

  const end = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (!g.last) return; // a tap: the button's click opens the zoom viewer
    suppressClick.current = true;
    // after a resize the height changed, so check it still fits once it has rendered
    requestAnimationFrame(() => {
      const fitted = onScreen(g.last!, ref.current?.offsetHeight ?? 0);
      setPlace(fitted);
      save(fitted);
    });
  };

  const showHeader = place ? place.w >= 128 : !compact;

  return (
    <motion.aside
      ref={ref}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      className={place ? "absolute z-[25]" : defaultClassName}
      style={place ? { left: place.x, top: place.y, width: place.w } : undefined}
      data-testid="manual-panel"
    >
      <button
        onClick={() => {
          if (suppressClick.current) return void (suppressClick.current = false);
          onOpen();
        }}
        onPointerDown={(e) => start(e, "move")}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        aria-label={`Zoom into the manual picture for step ${stepNumber}`}
        aria-haspopup="dialog"
        title="Tap to zoom · drag to move"
        className="hud-panel holo-glow block w-full cursor-grab touch-none select-none overflow-hidden rounded-xl text-left active:cursor-grabbing"
      >
        {showHeader && (
          <div className="flex items-center justify-between px-3 pt-2">
            <span className="text-[10px] font-semibold text-white/70 sm:text-[11px]">Step {stepNumber} · manual</span>
            <span className="text-[10px] text-white/40">Tap to zoom</span>
          </div>
        )}
        <div className="relative m-2 overflow-hidden rounded-lg bg-ink/60">
          <img src={target} alt={`Manual picture for step ${stepNumber}`} draggable={false} className={`w-full ${glow ? "holo-image" : ""}`} />
          <PartMarks marks={marks} />
        </div>
      </button>

      {/* resize grip, bottom-left so a panel at the right edge can grow */}
      <span
        aria-hidden
        title="Drag to resize"
        onPointerDown={(e) => start(e, "resize")}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        data-testid="manual-panel-resize"
        className="absolute -bottom-1.5 -left-1.5 grid h-7 w-7 cursor-nesw-resize touch-none place-items-center"
      >
        <svg viewBox="0 0 12 12" className="h-3.5 w-3.5 text-sky-200/80 drop-shadow-[0_0_4px_rgba(92,200,255,0.8)]">
          <path d="M1 3v8h8M1 7l4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
    </motion.aside>
  );
}
