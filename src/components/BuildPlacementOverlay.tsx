"use client";

import { useEffect, useState, type PointerEvent, type RefObject } from "react";
import type { CameraHandle } from "./CameraFeed";
import type { ExtractedPart } from "@/app/api/extract/route";
import { coverMap, frameToScreen, screenToFrame, type Point } from "@/lib/arGeometry";
import { rotatedSize, type Placement } from "@/lib/buildFrame";
import { frameToStud, studPitch, studToFrame, type Registration } from "@/lib/registration";

type Props = { camera: RefObject<CameraHandle | null>; registration: Registration | null; placement: Placement; part?: ExtractedPart; tapIndex: number | null; onTap: (p: Point) => void; adjusting: boolean; nudge: Point; onNudge: (p: Point) => void; rotation: number; replay: number; success: boolean };

export default function BuildPlacementOverlay(p: Props) {
  const [size, setSize] = useState<ReturnType<CameraHandle["geometry"]>>(null);
  useEffect(() => {
    const refresh = () => setSize(p.camera.current?.geometry() ?? null);
    refresh(); const timer = window.setInterval(refresh, 500);
    window.addEventListener("resize", refresh); window.addEventListener("orientationchange", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("resize", refresh); window.removeEventListener("orientationchange", refresh); };
  }, [p.camera]);
  if (!size) return null;
  const map = coverMap(size.videoWidth, size.videoHeight, size.boxWidth, size.boxHeight);
  const tap = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    p.onTap(screenToFrame({ x: e.clientX - rect.left, y: e.clientY - rect.top }, map));
  };
  if (p.tapIndex !== null) return <>
    <button className="absolute inset-0 z-[8] cursor-crosshair bg-cyan-300/[0.04]" aria-label={`Tap reference stud ${p.tapIndex === 0 ? "A" : "B"} on camera`} onClick={tap} />
    <div className="pointer-events-none absolute left-1/2 top-24 z-[9] w-[min(18rem,80vw)] -translate-x-1/2 rounded-xl border border-cyan-300/50 bg-slate-950/90 p-3 text-center text-xs shadow-xl">
      <p className="font-bold text-cyan-100">Align the first green plate</p>
      <p className="mt-1 text-white/75">Tap {p.tapIndex === 0 ? "A: left end stud" : "B: right end stud"} on the straight edge.</p>
      <div className="mx-auto mt-2 flex w-28 justify-between rounded-full border border-cyan-300/50 bg-green-800/60 px-2 py-1 text-cyan-100"><span>A ●</span><span>● B</span></div>
    </div>
  </>;
  if (!p.registration) return null;
  const r = p.registration;
  const dims = rotatedSize(p.placement);
  const frame = studToFrame({ x: p.placement.dx + p.nudge.x, y: p.placement.dy + p.nudge.y }, r);
  const screen = frameToScreen({ x: frame.x / size.videoWidth, y: frame.y / size.videoHeight }, map) as Point;
  const pitch = studPitch(r) * map.scale;
  const w = pitch * dims.w, h = pitch * dims.h;
  const angle = Math.atan2(r.b, r.a) * 180 / Math.PI + p.rotation;
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
  return <svg aria-label="2D guide ghost" className="pointer-events-none absolute inset-0 z-[8] h-full w-full" viewBox={`0 0 ${map.boxW} ${map.boxH}`} preserveAspectRatio="none" onPointerDown={dragging} onPointerMove={dragging} onPointerUp={dragging}>
    <g key={p.replay} transform={`translate(${screen.x} ${screen.y}) rotate(${angle})`} className={p.success ? "ar-success" : "ar-press"} style={{ pointerEvents: p.adjusting ? "auto" : "none", touchAction: "none", cursor: p.adjusting ? "grab" : undefined }}>
      <rect x={0} y={0} width={w} height={h} rx={Math.min(7, pitch * .2)} fill={color} fillOpacity=".38" stroke={p.success ? "#86efac" : "#67e8f9"} strokeWidth="2.5" />
      {Array.from({ length: Math.min(64, dims.w * dims.h) }, (_, i) => <circle key={i} cx={(i % dims.w + .5) * pitch} cy={(Math.floor(i / dims.w) + .5) * pitch} r={Math.max(2, Math.min(8, pitch * .23))} fill={color} fillOpacity=".28" stroke="#e0faff" strokeOpacity=".8" strokeWidth="1" />)}
      <text x={w / 2} y={h + 17} textAnchor="middle" fill="#a5f3fc" fontSize="12" fontWeight="700">2D guide · check manual</text>
    </g>
  </svg>;
}
