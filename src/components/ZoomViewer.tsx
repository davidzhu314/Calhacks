/* eslint-disable @next/next/no-img-element -- manual pictures are data URLs rendered in the browser */
"use client";

import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PartMarks, type PartMark } from "@/components/HighlightBox";

const MIN = 1; // 1 = the whole picture fits the screen
const MAX = 6;
const DOUBLE_TAP = 2.5;
const PAD = 12; // gap around the picture at 1x

type View = { s: number; x: number; y: number };
type Pt = { x: number; y: number };

const clampScale = (s: number) => Math.min(MAX, Math.max(MIN, s));

// Full-screen manual picture: pinch, wheel or double-tap to zoom, drag to pan.
export default function ZoomViewer({
  target,
  pageImage,
  stepNumber,
  glow,
  onGlowChange,
  marks,
  onClose,
}: {
  target: string;
  pageImage: string | null;
  stepNumber?: string | number;
  glow: boolean;
  onGlowChange: (glow: boolean) => void;
  marks?: PartMark[]; // every part of this step: where it is in the parts box and where it goes
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const [mode, setMode] = useState<"step" | "page">("step");
  const src = mode === "page" && pageImage ? pageImage : target;

  const area = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  // Screen size of the zoom area and the picture's own size give the 1x ("fit") rectangle.
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [natural, setNatural] = useState<{ src: string; w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = area.current!;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.src = src;
    img
      .decode()
      .then(() => !cancelled && setNatural({ src, w: img.naturalWidth, h: img.naturalHeight }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [src]);
  const fit = useMemo(() => {
    if (!box || !natural || natural.src !== src) return null;
    const k = Math.min((box.w - 2 * PAD) / natural.w, (box.h - 2 * PAD) / natural.h);
    const w = natural.w * k;
    const h = natural.h * k;
    return { w, h, x: (box.w - w) / 2, y: (box.h - h) / 2, vw: box.w, vh: box.h };
  }, [box, natural, src]);

  // The current zoom lives in a ref and is written straight to the layer's transform, so gestures don't re-render.
  const view = useRef<View>({ s: 1, x: 0, y: 0 });
  const [zoom, setZoom] = useState(1); // rounded copy for the toolbar

  // Keeps the picture covering the screen once it's bigger than it, and centered while it's smaller.
  const clamp = useCallback(
    (v: View): View => {
      if (!fit) return v;
      const axis = (t: number, size: number, offset: number, screen: number) => {
        const scaled = size * v.s;
        if (scaled <= screen) return (screen - scaled) / 2 - offset;
        return Math.min(-offset, Math.max(screen - offset - scaled, t));
      };
      return { s: v.s, x: axis(v.x, fit.w, fit.x, fit.vw), y: axis(v.y, fit.h, fit.y, fit.vh) };
    },
    [fit],
  );

  const write = useCallback(
    (v: View, animate: boolean) => {
      view.current = v;
      const el = layer.current;
      if (!el) return;
      el.style.transition = animate && !reduced ? "transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)" : "none";
      el.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.s})`;
    },
    [reduced],
  );
  const apply = useCallback(
    (next: View, animate = false) => {
      const v = clamp(next);
      write(v, animate);
      setZoom(Math.round(v.s * 10) / 10);
    },
    [clamp, write],
  );

  // Zooms to scale `s` keeping the point `c` (relative to the zoom area) still on screen.
  const zoomAt = useCallback(
    (c: Pt, s: number, animate = false, from: View = view.current) => {
      if (!fit) return;
      const next = clampScale(s);
      const px = (c.x - fit.x - from.x) / from.s;
      const py = (c.y - fit.y - from.y) / from.s;
      apply({ s: next, x: c.x - fit.x - next * px, y: c.y - fit.y - next * py }, animate);
    },
    [fit, apply],
  );
  const center = useCallback((): Pt => ({ x: (fit?.vw ?? 0) / 2, y: (fit?.vh ?? 0) / 2 }), [fit]);
  const reset = useCallback((animate = false) => apply({ s: 1, x: 0, y: 0 }, animate), [apply]);

  // A new picture or screen size starts at 1x.
  const [shownFit, setShownFit] = useState(fit);
  if (shownFit !== fit) {
    setShownFit(fit);
    setZoom(1);
  }
  useLayoutEffect(() => {
    if (fit) write(clamp({ s: 1, x: 0, y: 0 }), false);
  }, [fit, clamp, write]);

  // ---- pointer gestures: one finger pans, two pinch, a quick double tap toggles 2.5x ----
  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<{ view: View; a: Pt; dist: number; multi: boolean; downAt: number; moved: boolean } | null>(null);
  const lastTap = useRef<{ t: number; p: Pt } | null>(null);

  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = area.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const twoPoints = () => [...pointers.current.values()].slice(0, 2);
  const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  // (Re)starts the gesture from the current view, so lifting one finger of a pinch carries on as a pan.
  const begin = (keepTapState: boolean) => {
    const pts = twoPoints();
    const prev = gesture.current;
    gesture.current = {
      view: view.current,
      a: pts.length === 2 ? mid(pts[0], pts[1]) : pts[0],
      dist: pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0,
      multi: (keepTapState && prev?.multi) || pts.length > 1,
      downAt: keepTapState && prev ? prev.downAt : performance.now(),
      moved: keepTapState && prev ? prev.moved : false,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    begin(pointers.current.size > 1);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, local(e));
    const g = gesture.current;
    if (!g || !fit) return;
    const pts = twoPoints();
    if (pts.length === 2) {
      const m = mid(pts[0], pts[1]);
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const s = clampScale(g.view.s * (dist / (g.dist || 1)));
      // point under the starting midpoint follows the fingers' midpoint
      const px = (g.a.x - fit.x - g.view.x) / g.view.s;
      const py = (g.a.y - fit.y - g.view.y) / g.view.s;
      g.moved = true;
      apply({ s, x: m.x - fit.x - s * px, y: m.y - fit.y - s * py });
    } else {
      const dx = pts[0].x - g.a.x;
      const dy = pts[0].y - g.a.y;
      if (Math.hypot(dx, dy) > 8) g.moved = true;
      if (g.moved) apply({ s: g.view.s, x: g.view.x + dx, y: g.view.y + dy });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = pointers.current.get(e.pointerId)!;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size > 0) return begin(true);
    gesture.current = null;
    if (e.type === "pointercancel" || !g || g.multi || g.moved || performance.now() - g.downAt > 300) return;
    const now = performance.now();
    const last = lastTap.current;
    if (last && now - last.t < 320 && Math.hypot(p.x - last.p.x, p.y - last.p.y) < 30) {
      lastTap.current = null;
      if (view.current.s > 1.05) reset(true);
      else zoomAt(p, DOUBLE_TAP, true);
    } else {
      lastTap.current = { t: now, p };
    }
  };

  // ---- wheel / trackpad (needs a non-passive listener to stop the page from scrolling) ----
  useEffect(() => {
    const el = area.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      // trackpad pinch arrives as ctrl+wheel with small deltas
      zoomAt(local(e), view.current.s * Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.002)));
    };
    // Safari: stop page zoom; on a Mac trackpad, pinch arrives only as gesture events.
    let gestureStart = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureStart = view.current.s;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      if (pointers.current.size > 0) return; // touch screens pinch through pointer events
      const ge = e as Event & { scale: number; clientX: number; clientY: number };
      zoomAt(local(ge), gestureStart * ge.scale);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onGestureStart);
    el.addEventListener("gesturechange", onGestureChange);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
    };
  }, [zoomAt]);

  // ---- keyboard: Escape closes, + / − / 0 zoom ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "+" || e.key === "=") zoomAt(center(), view.current.s * 1.5, true);
      else if (e.key === "-") zoomAt(center(), view.current.s / 1.5, true);
      else if (e.key === "0") reset(true);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, zoomAt, center, reset]);

  // Focus moves into the viewer and back to the panel afterwards.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus({ preventScroll: true });
    return () => before?.focus?.({ preventScroll: true });
  }, []);

  const toolBtn = "grid h-10 min-w-10 place-items-center rounded-xl border border-white/15 bg-white/[0.06] px-3 text-sm font-medium text-white/85 transition hover:bg-white/10 active:scale-95 disabled:opacity-40";

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`Manual picture for step ${stepNumber ?? ""}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.2 }}
      className="fixed inset-0 z-50 flex flex-col bg-ink/90 backdrop-blur-md"
    >
      {/* header: title, close, and what to show */}
      <motion.header
        initial={reduced ? false : { y: -12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative z-10 flex flex-col gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-white/85">
            Step {stepNumber} <span className="text-white/40">· manual</span>
          </p>
          <button ref={closeBtn} onClick={onClose} className="hud-panel rounded-xl px-3 py-2 text-sm font-medium text-white/85 hover:text-white">
            Close
          </button>
        </div>
        <div className="flex items-center justify-between gap-2">
          {pageImage ? (
            <div role="radiogroup" aria-label="Picture" className="hud-panel flex rounded-xl p-1 text-xs font-medium">
              {(
                [
                  ["step", "This step"],
                  ["page", "Whole page"],
                ] as const
              ).map(([m, label]) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={`rounded-lg px-3 py-1.5 transition ${mode === m ? "bg-sky-300/20 text-sky-100 shadow-[0_0_16px_-4px_rgba(92,200,255,0.8)]" : "text-white/60 hover:text-white"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <span />
          )}
          <button
            role="switch"
            aria-checked={glow}
            onClick={() => onGlowChange(!glow)}
            className="hud-panel flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-white/80"
          >
            Glow
            <span className={`relative h-4 w-7 rounded-full transition-colors ${glow ? "bg-sky-400/80" : "bg-white/20"}`}>
              <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-[left] ${glow ? "left-3.5" : "left-0.5"}`} />
            </span>
          </button>
        </div>
      </motion.header>

      {/* zoom area: touch-action none so iOS Safari leaves the page zoom alone */}
      <motion.div
        ref={area}
        initial={reduced ? false : { scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`relative min-h-0 flex-1 touch-none select-none overflow-hidden ${zoom > 1 ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
        data-testid="zoom-area"
      >
        {fit && (
          <div
            ref={layer}
            data-testid="zoom-layer"
            className="absolute origin-top-left will-change-transform"
            style={{ left: fit.x, top: fit.y, width: fit.w, height: fit.h }}
          >
            <img src={src} alt={mode === "page" ? "Whole manual page" : `Manual picture for step ${stepNumber ?? ""}`} draggable={false} className={`h-full w-full rounded-lg ${glow ? "holo-image" : ""}`} />
            {mode === "step" && <PartMarks marks={marks} />}
          </div>
        )}
      </motion.div>

      {/* zoom controls */}
      <div className="relative z-10 flex items-center justify-center gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <button onClick={() => zoomAt(center(), view.current.s / 1.5, true)} disabled={zoom <= MIN} aria-label="Zoom out" className={toolBtn}>
          −
        </button>
        <span className="w-12 text-center font-mono text-xs text-white/60" aria-live="polite">
          {zoom.toFixed(1)}×
        </span>
        <button onClick={() => zoomAt(center(), view.current.s * 1.5, true)} disabled={zoom >= MAX} aria-label="Zoom in" className={toolBtn}>
          +
        </button>
        <button onClick={() => reset(true)} disabled={zoom <= MIN} className={toolBtn}>
          Fit
        </button>
      </div>
    </motion.div>
  );
}
