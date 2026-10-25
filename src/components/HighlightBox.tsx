"use client";

import { motion } from "motion/react";
import type { Box } from "@/app/api/locate/route";

// Glowing outline over the manual picture: cyan around the piece in the parts box, amber where it goes.
// `label` numbers it to match its hologram; `dim` fades it while another part is tapped.
export type PartMark = { callout: Box | null; placed: Box | null; label: number; dim: boolean };

export function PartMarks({ marks }: { marks?: PartMark[] }) {
  return (
    <>
      {marks?.map((m) => (
        <span key={m.label}>
          {m.callout && <HighlightBox box={m.callout} kind="callout" label={marks.length > 1 ? m.label : undefined} dim={m.dim} />}
          {m.placed && <HighlightBox box={m.placed} kind="placed" label={marks.length > 1 ? m.label : undefined} dim={m.dim} />}
        </span>
      ))}
    </>
  );
}

export default function HighlightBox({ box, kind, label, dim }: { box: Box; kind: "callout" | "placed"; label?: number; dim?: boolean }) {
  const pad = 0.015;
  return (
    <motion.span
      aria-hidden
      initial={{ opacity: 0, scale: 1.3 }}
      animate={{ opacity: dim ? 0.3 : 1, scale: 1 }}
      className={`pointer-events-none absolute rounded-md border-2 ${
        kind === "callout" ? "border-sky-300 shadow-[0_0_14px_2px_rgba(92,200,255,0.8)]" : "border-dashed border-amber-300 shadow-[0_0_14px_2px_rgba(252,211,77,0.6)]"
      }`}
      style={{
        left: `${Math.max(0, box.x - pad) * 100}%`,
        top: `${Math.max(0, box.y - pad) * 100}%`,
        width: `${Math.min(1, box.w + 2 * pad) * 100}%`,
        height: `${Math.min(1, box.h + 2 * pad) * 100}%`,
      }}
    >
      {kind === "callout" && !dim && <span className="absolute inset-0 animate-pulse rounded-md bg-sky-300/15" />}
      {label != null && (
        <span
          className={`absolute -left-1.5 -top-2 rounded px-1 text-[9px] font-bold leading-[14px] text-ink ${kind === "callout" ? "bg-sky-300" : "bg-amber-300"}`}
        >
          {label}
        </span>
      )}
    </motion.span>
  );
}
