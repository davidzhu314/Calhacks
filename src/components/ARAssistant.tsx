"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { clampToBox, type Point } from "@/lib/arGeometry";

type Props = { status: string; instruction: string; aligning: boolean; adjusting: boolean; hasPlacement: boolean; onAlign: () => void; onRescan: () => void; onAdjust: () => void; onRotate: (direction: number) => void; onReset: () => void; onReplay: () => void; onHide: () => void; children?: React.ReactNode };
const W = 224, H = 290;
let safe = { top: 0, right: 0, bottom: 0, left: 0 };
function measureSafeArea() {
  const node = document.createElement("div");
  node.style.cssText = "position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.appendChild(node);
  const style = getComputedStyle(node);
  safe = { top: parseFloat(style.paddingTop) || 0, right: parseFloat(style.paddingRight) || 0, bottom: parseFloat(style.paddingBottom) || 0, left: parseFloat(style.paddingLeft) || 0 };
  node.remove();
}
const bounds = () => {
  const left = 8 + safe.left, top = Math.max(72, safe.top + 56);
  const sheetClearBottom = window.innerHeight * .5 - 48;
  return { left, top, right: Math.max(left, window.innerWidth - W - 8 - safe.right), bottom: Math.max(top, Math.min(window.innerHeight - H - 16 - safe.bottom, sheetClearBottom)) };
};
const orientationKey = () => `buildsight:ar-assistant:${window.innerWidth > window.innerHeight ? "landscape" : "portrait"}`;

export default function ARAssistant(p: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Point>({ x: 12, y: 168 });
  const posRef = useRef(pos);
  const drag = useRef<{ x: number; y: number; origin: Point; moved: boolean } | null>(null);
  useEffect(() => {
    measureSafeArea();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { const saved = JSON.parse(localStorage.getItem(orientationKey()) ?? "null") as Point | null; if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) setPos(clampToBox(saved, bounds())); } catch { /* private browsing */ }
    const fit = () => setPos((v) => clampToBox(v, bounds()));
    const rotate = () => {
      measureSafeArea();
      try { const saved = JSON.parse(localStorage.getItem(orientationKey()) ?? "null") as Point | null; setPos(clampToBox(saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) ? saved : posRef.current, bounds())); } catch { fit(); }
    };
    window.addEventListener("resize", fit); window.addEventListener("orientationchange", rotate);
    return () => { window.removeEventListener("resize", fit); window.removeEventListener("orientationchange", rotate); };
  }, []);
  useEffect(() => { posRef.current = pos; }, [pos]);
  const save = (next: Point) => {
    try { localStorage.setItem(orientationKey(), JSON.stringify(next)); } catch { /* storage unavailable */ }
  };
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    drag.current = { x: e.clientX, y: e.clientY, origin: posRef.current, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    if (!drag.current) return;
    e.stopPropagation();
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    if (Math.hypot(dx, dy) > 6) drag.current.moved = true;
    if (drag.current.moved) setPos(clampToBox({ x: drag.current.origin.x + dx, y: drag.current.origin.y + dy }, bounds()));
  };
  const up = (e: PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!drag.current) return;
    if (!drag.current.moved) setOpen((v) => !v);
    else save(posRef.current);
    drag.current = null;
  };
  return <div role="group" aria-label="AR assistant" className="absolute z-[25]" style={{ left: pos.x, top: pos.y }} onPointerDown={(e) => e.stopPropagation()}>
    <button type="button" aria-label="AR assistant; drag to move, tap to open" aria-expanded={open} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; }} onKeyDown={(e) => {
      if (e.key === "Escape") { setOpen(false); return; }
      const vector: Record<string, Point> = { ArrowLeft: { x: -10, y: 0 }, ArrowRight: { x: 10, y: 0 }, ArrowUp: { x: 0, y: -10 }, ArrowDown: { x: 0, y: 10 } };
      if (vector[e.key]) { e.preventDefault(); const next = clampToBox({ x: pos.x + vector[e.key].x, y: pos.y + vector[e.key].y }, bounds()); setPos(next); save(next); }
    }} className="grid h-12 w-12 touch-none place-items-center rounded-full border border-cyan-200/70 bg-slate-950/95 text-cyan-100 shadow-[0_0_24px_#22d3ee66] transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-cyan-200">
      <span aria-hidden className="text-lg">✦</span>
    </button>
    {open && <div className="hud-panel mt-2 max-h-[calc(100dvh-9rem)] w-56 overflow-y-auto rounded-2xl border border-cyan-300/30 bg-slate-950/95 p-3 text-xs text-white shadow-2xl backdrop-blur-xl">
      <p className="font-semibold text-cyan-100">AR assistant</p>
      <p role="status" className="mt-1 text-white/80">{p.status}</p>
      <p className="mt-2 line-clamp-2 text-white/55">{p.instruction}</p>
      {p.children}
      <div className="mt-3 grid grid-cols-2 gap-1.5 [&_button]:rounded-lg [&_button]:border [&_button]:border-white/15 [&_button]:px-2 [&_button]:py-2 [&_button]:text-left [&_button]:transition [&_button:hover]:bg-cyan-300/15">
        <button onClick={() => { p.onAlign(); setOpen(false); }}>{p.aligning ? "Tap A, then B" : "Align / Re-align"}</button>
        <button onClick={() => { p.onRescan(); setOpen(false); }}>Rescan</button>
        <button onClick={() => { p.onAdjust(); setOpen(false); }} aria-pressed={p.adjusting}>{p.adjusting ? "Finish adjust" : "Adjust ghost"}</button>
        <button onClick={p.onReplay}>Replay</button>
        {p.hasPlacement && <><button onClick={() => p.onRotate(-90)} aria-label="Rotate guide left">↶ Rotate</button><button onClick={() => p.onRotate(90)} aria-label="Rotate guide right">↷ Rotate</button></>}
        <button onClick={p.onReset}>Reset adjustment</button>
        <button onClick={() => { p.onHide(); setOpen(false); }}>Hide guide</button>
      </div>
    </div>}
  </div>;
}
