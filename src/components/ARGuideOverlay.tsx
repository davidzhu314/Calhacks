"use client";

import { useEffect, useState, type RefObject } from "react";
import type { CameraHandle } from "./CameraFeed";
import type { ExtractedPart } from "@/app/api/extract/route";
import type { ArGuide } from "@/lib/arGuide";
import { coverMap, frameToScreen, screenToFrame, type Box, type Point } from "@/lib/arGeometry";
import type { GuidePhase } from "./useArGuide";

type Props = { camera: RefObject<CameraHandle | null>; phase: GuidePhase; guide: ArGuide | null; message: string; part?: ExtractedPart; adjusting: boolean; rotation: number; onAdjust: (point: Point) => void };
export default function ARGuideOverlay({ camera, phase, guide, message, part, adjusting, rotation, onAdjust }: Props) {
  const [size, setSize] = useState<ReturnType<CameraHandle["geometry"]>>(null);
  useEffect(() => {
    const refresh = () => setSize(camera.current?.geometry() ?? null);
    refresh();
    const timer = window.setInterval(refresh, 500);
    window.addEventListener("resize", refresh);
    window.addEventListener("orientationchange", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("resize", refresh); window.removeEventListener("orientationchange", refresh); };
  }, [camera]);
  if (phase === "off") return null;
  const map = size ? coverMap(size.videoWidth, size.videoHeight, size.boxWidth, size.boxHeight) : null;
  const partBox = map && guide?.partBox ? frameToScreen(guide.partBox, map) as Box : null;
  const place = map && guide?.placement ? frameToScreen(guide.placement, map) as Point : null;
  const assembly = map && guide?.assemblyBox ? frameToScreen(guide.assemblyBox, map) as Box : null;
  const uncertain = phase === "degraded" || phase === "lost" || (guide?.confidence ?? 0) < .7;
  const color = uncertain ? "#fbbf24" : "#67e8f9";
  const showSpatial = phase !== "lost" && guide?.visible !== false;
  const ghostW = Math.max(42, Math.min(100, (part?.studsX ?? 3) * 14));
  const ghostH = Math.max(32, Math.min(80, (part?.studsY ?? 2) * 14));
  return <>
    {adjusting && map && <button aria-label="Tap camera to place guide" className="absolute inset-0 z-[5] cursor-crosshair bg-sky-300/[0.03]" onClick={(e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const p = screenToFrame({ x: e.clientX - rect.left, y: e.clientY - rect.top }, map);
      onAdjust({ x: Math.max(0, Math.min(1, p.x)), y: Math.max(0, Math.min(1, p.y)) });
    }} />}
    {map && <svg aria-label="2D AR guide overlay" className="pointer-events-none absolute inset-0 z-[6] h-full w-full" viewBox={`0 0 ${map.boxW} ${map.boxH}`} preserveAspectRatio="none">
      {showSpatial && assembly && <rect data-testid="ar-assembly" x={assembly.left} y={assembly.top} width={assembly.right - assembly.left} height={assembly.bottom - assembly.top} rx="12" fill="none" stroke={color} strokeOpacity=".42" strokeWidth="1.5" strokeDasharray="8 7" />}
      {showSpatial && partBox && <g data-testid="ar-part"><rect x={partBox.left} y={partBox.top} width={partBox.right - partBox.left} height={partBox.bottom - partBox.top} rx="8" fill={color} fillOpacity=".08" stroke={color} strokeWidth="3" className="ar-guide-outline" /><text x={partBox.left + 4} y={Math.max(16, partBox.top - 7)} fill={color} fontSize="13" fontWeight="700">REQUIRED PIECE</text></g>}
      {showSpatial && partBox && place && <path d={`M ${partBox.left + (partBox.right - partBox.left) / 2} ${partBox.top + (partBox.bottom - partBox.top) / 2} L ${place.x} ${place.y}`} stroke={color} strokeWidth="2" strokeDasharray="6 5" markerEnd="url(#ar-arrow)" />}
      <defs><marker id="ar-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10Z" fill={color} /></marker></defs>
      {showSpatial && place && <g data-testid="ar-placement" transform={`translate(${place.x} ${place.y}) rotate(${rotation + (guide?.orientationDegrees ?? 0)})`}><rect x={-ghostW / 2} y={-ghostH / 2} width={ghostW} height={ghostH} rx="7" fill={part?.color || color} fillOpacity=".18" stroke={color} strokeWidth="2.5" className="ar-guide-outline" /><path d={`M ${-ghostW / 2 - 8} 0 H ${ghostW / 2 + 8} M 0 ${-ghostH / 2 - 8} V ${ghostH / 2 + 8}`} stroke={color} strokeWidth="1" /><text y={ghostH / 2 + 19} textAnchor="middle" fill={color} fontSize="12" fontWeight="700">PLACE HERE · 2D</text></g>}
    </svg>}
    <div role="status" className={`pointer-events-none absolute left-3 top-36 z-[7] max-w-[min(13rem,55vw)] rounded-xl border px-3 py-2 text-xs shadow-xl backdrop-blur-md sm:left-6 sm:top-28 ${uncertain ? "border-amber-300/40 bg-amber-950/75 text-amber-100" : "border-cyan-300/40 bg-slate-950/80 text-cyan-100"}`}>
      <p className="font-bold tracking-wide">{guide?.demo ? "2D demo" : "2D guide"} · {phase === "finding" ? "Locating assembly…" : phase === "guiding" ? "Guide ready" : phase === "lost" ? "Alignment lost" : "Confirm alignment"}</p>
      <p className="mt-1 leading-snug">{phase === "finding" ? "Hold the camera steady with the assembly in view." : message || guide?.explanation || (guide?.placement ? "Place the required piece at the outline." : "Tap Adjust placement to position the guide.")}</p>
      {guide && !guide.placement && phase !== "finding" && <p className="mt-1 font-medium">No placement found · tap to position</p>}
    </div>
  </>;
}
