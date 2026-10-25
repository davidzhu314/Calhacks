"use client";

import { useEffect, useState, type PointerEvent, type RefObject } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { CameraHandle } from "./CameraFeed";
import type { ExtractedPart } from "@/app/api/extract/route";
import type { ArBox } from "@/lib/arGuide";
import { coverMap, frameToScreen, screenToFrame, type Point } from "@/lib/arGeometry";
import { rotatedSize, type Placement } from "@/lib/buildFrame";
import { frameToStud, studPitch, studToFrame, type Registration } from "@/lib/registration";

type Props = { camera: RefObject<CameraHandle | null>; registration: Registration | null; placement: Placement; part?: ExtractedPart; stepLabel: string; sourceBox: ArBox | null; tapIndex: number | null; onTap: (p: Point) => void; onRestartAlign: () => void; adjusting: boolean; nudge: Point; onNudge: (p: Point) => void; rotation: number; replay: number; success: boolean };

export default function BuildPlacementOverlay(p: Props) {
  const reduceMotion = useReducedMotion();
  const [size, setSize] = useState<ReturnType<CameraHandle["geometry"]>>(null);
  const [firstTap, setFirstTap] = useState<Point | null>(null);
  useEffect(() => {
    const refresh = () => setSize(p.camera.current?.geometry() ?? null);
    refresh(); const timer = window.setInterval(refresh, 500);
    window.addEventListener("resize", refresh); window.addEventListener("orientationchange", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("resize", refresh); window.removeEventListener("orientationchange", refresh); };
  }, [p.camera]);
  if (!size) return null;
  const map = coverMap(size.videoWidth, size.videoHeight, size.boxWidth, size.boxHeight);
  const source = p.sourceBox ? frameToScreen(p.sourceBox, map) as ArBox : null;
  const sourceMarker = source && <g aria-label="Required loose piece">
    <rect key={p.replay} x={source.left} y={source.top} width={source.right - source.left} height={source.bottom - source.top} rx="6" fill="#67e8f9" fillOpacity=".08" stroke="#67e8f9" strokeWidth="2.5" className={reduceMotion ? "" : "ar-pick"} />
    <text x={source.left + 2} y={Math.max(14, source.top - 6)} fill="#a5f3fc" fontSize="11" fontWeight="700">PICK UP</text>
  </g>;
  const tap = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const point = screenToFrame({ x: e.clientX - rect.left, y: e.clientY - rect.top }, map);
    if (p.tapIndex === 0) setFirstTap(frameToScreen(point, map) as Point);
    p.onTap(point);
  };
  if (p.tapIndex !== null) return <>
    <button className="absolute inset-0 z-[11] cursor-crosshair bg-cyan-300/[0.04]" aria-label={`Tap ${p.tapIndex === 0 ? "1: left end stud" : "2: right end stud"} on the first green plate in the camera`} onClick={tap} />
    {p.tapIndex === 1 && firstTap && <div data-testid="ar-first-tap-marker" aria-hidden className="pointer-events-none absolute z-[12] -translate-x-1/2 -translate-y-1/2" style={{ left: firstTap.x, top: firstTap.y }}><span className="grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-cyan-400 text-sm font-black text-slate-950 shadow-[0_0_0_5px_#22d3ee55]">1</span></div>}
    <div className="pointer-events-auto absolute left-1/2 top-36 z-[12] w-[min(20rem,86vw)] -translate-x-1/2 rounded-2xl border border-cyan-300/50 bg-slate-950/95 p-4 text-center text-xs text-white shadow-2xl backdrop-blur-xl sm:top-28">
      <p className="text-sm font-bold text-cyan-100">Line up the guide with your base plate</p>
      <p className="mt-1 leading-relaxed text-white/75">Find the <strong className="text-white">first green half-circle plate</strong>. Hold it so its straight edge is across the top of the camera view, with the rounded side below.</p>
      <svg aria-label="Diagram of the first green plate, with tap 1 on the left end stud and tap 2 on the right end stud" className="mx-auto mt-2 h-[70px] w-[210px] max-w-full" viewBox="0 0 210 70" role="img">
        <path d="M35 23H175A70 43 0 0 1 35 23Z" fill="#166534" stroke="#86efac" strokeWidth="2" />
        {Array.from({ length: 8 }, (_, i) => <circle key={i} cx={35 + i * 20} cy="23" r="5" fill="#4ade80" stroke="#bbf7d0" />)}
        <circle cx="35" cy="23" r="10" fill="none" stroke="#67e8f9" strokeWidth="2" /><circle cx="175" cy="23" r="10" fill="none" stroke="#67e8f9" strokeWidth="2" />
        <text x="35" y="13" textAnchor="middle" fill="#a5f3fc" fontSize="11" fontWeight="800">1</text><text x="175" y="13" textAnchor="middle" fill="#a5f3fc" fontSize="11" fontWeight="800">2</text>
      </svg>
      <p className="font-semibold text-cyan-100">{p.tapIndex === 0 ? "1 of 2 · Tap the left end stud" : "2 of 2 · Tap the right end stud"}</p>
      <p className="mt-1 text-white/60">Tap the studs on the real plate in the camera, not on this diagram.</p>
      {p.tapIndex === 1 && <button type="button" className="pointer-events-auto mt-2 rounded-lg px-3 py-1.5 text-cyan-200 underline underline-offset-2 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-200" onClick={p.onRestartAlign}>Start again</button>}
    </div>
  </>;
  if (!p.registration) return source ? <svg aria-label="2D guide source piece" className="pointer-events-none absolute inset-0 z-[8] h-full w-full" viewBox={`0 0 ${map.boxW} ${map.boxH}`} preserveAspectRatio="none">{sourceMarker}</svg> : null;
  const r = p.registration;
  const baseDims = rotatedSize(p.placement);
  const turn = ((p.rotation % 360) + 360) % 360;
  const dims = turn % 180 ? { w: baseDims.h, h: baseDims.w } : baseDims;
  const frame = studToFrame({ x: p.placement.dx + p.nudge.x, y: p.placement.dy + p.nudge.y }, r);
  const screen = frameToScreen({ x: frame.x / size.videoWidth, y: frame.y / size.videoHeight }, map) as Point;
  const pitch = studPitch(r) * map.scale;
  const w = pitch * dims.w, h = pitch * dims.h;
  const angle = Math.atan2(r.b, r.a) * 180 / Math.PI;
  const color = p.part?.color || "#67e8f9";
  const dragging = (e: PointerEvent<SVGSVGElement>) => {
    if (!p.adjusting) return;
    e.stopPropagation();
    if (e.type === "pointerdown") e.currentTarget.setPointerCapture(e.pointerId);
    if (e.type !== "pointermove" && e.type !== "pointerup") return;
    if (e.type === "pointermove" && !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const normalized = screenToFrame({ x: e.clientX - rect.left, y: e.clientY - rect.top }, map);
    const stud = frameToStud({ x: normalized.x * size.videoWidth, y: normalized.y * size.videoHeight }, r);
    const x = stud.x - p.placement.dx, y = stud.y - p.placement.dy;
    p.onNudge(e.type === "pointerup" ? { x: Math.round(x), y: Math.round(y) } : { x, y });
  };
  const sourceX = source ? (source.left + source.right) / 2 : 0;
  const sourceY = source ? (source.top + source.bottom) / 2 : 0;
  const targetX = screen.x + w / 2, targetY = screen.y + h / 2;
  return <svg aria-label="2D guide ghost" className="pointer-events-none absolute inset-0 z-[8] h-full w-full" viewBox={`0 0 ${map.boxW} ${map.boxH}`} preserveAspectRatio="none" onPointerDown={dragging} onPointerMove={dragging} onPointerUp={dragging}>
    {sourceMarker}
    {source && <><defs><marker id="stored-ar-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10Z" fill="#67e8f9" /></marker></defs><path d={`M ${sourceX} ${sourceY} Q ${(sourceX + targetX) / 2} ${Math.min(sourceY, targetY) - 28} ${targetX} ${targetY}`} fill="none" stroke="#67e8f9" strokeOpacity=".75" strokeWidth="1.5" strokeDasharray="5 5" markerEnd="url(#stored-ar-arrow)" /></>}
    {source && !reduceMotion && !p.adjusting && <motion.g key={`flight-${p.replay}-${p.stepLabel}`} aria-hidden="true" initial={{ x: sourceX, y: sourceY, opacity: 0, scale: .75 }} animate={{ x: [sourceX, (sourceX + targetX) / 2, targetX], y: [sourceY, Math.min(sourceY, targetY) - 28, targetY], opacity: [0, .75, 0], scale: [.75, 1, 1], rotate: [0, p.placement.rotation / 2, p.placement.rotation + p.rotation] }} transition={{ duration: 1.5, times: [0, .55, 1], ease: "easeInOut", repeat: 1, repeatDelay: .3 }}><rect x={-w / 2} y={-h / 2} width={w} height={h} rx="6" fill={color} fillOpacity=".38" stroke="#67e8f9" strokeWidth="2" /></motion.g>}
    <g key={p.replay} aria-label="Placement ghost" transform={`translate(${screen.x} ${screen.y}) rotate(${angle})`} className={p.success ? "ar-success" : "ar-press"} style={{ pointerEvents: p.adjusting ? "auto" : "none", touchAction: "none", cursor: p.adjusting ? "grab" : undefined }}>
      <circle className="ar-ripple" cx={w / 2} cy={h / 2} r={Math.max(w, h) * .48} fill="none" stroke={p.success ? "#86efac" : "#67e8f9"} strokeWidth="2" style={{ pointerEvents: "none" }} />
      <rect x={0} y={0} width={w} height={h} rx={Math.min(7, pitch * .2)} fill={color} fillOpacity=".38" stroke={p.success ? "#86efac" : "#67e8f9"} strokeWidth="2.5" />
      {Array.from({ length: Math.min(64, dims.w * dims.h) }, (_, i) => <circle key={i} cx={(i % dims.w + .5) * pitch} cy={(Math.floor(i / dims.w) + .5) * pitch} r={Math.max(2, Math.min(8, pitch * .23))} fill={color} fillOpacity=".28" stroke="#e0faff" strokeOpacity=".8" strokeWidth="1" />)}
      <path d={`M ${w / 2} ${h / 2 + Math.min(12, pitch * .28)} L ${w / 2} ${h / 2 - Math.min(12, pitch * .28)} m -5 5 l 5 -5 5 5`} transform={`rotate(${p.placement.rotation + turn} ${w / 2} ${h / 2})`} fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <text x={w / 2} y={h + 17} textAnchor="middle" fill="#a5f3fc" fontSize="12" fontWeight="700">{p.stepLabel}: place here · 2D guide</text>
    </g>
  </svg>;
}
