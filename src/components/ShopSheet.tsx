"use client";

// "Missing a part?": pick the part, then open a store searched for it. BuildSight never takes payment;
// every link opens the store in a new tab.

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { ExtractedPart } from "@/app/api/extract/route";
import type { Manual } from "@/lib/manuals";
import { shopLinks } from "@/lib/shop";

/** The step part a check's issue is about ("red 2x4" → "red 2x4 brick"), or null if none matches. */
export function matchPart(parts: ExtractedPart[], name: string): number | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  const exact = parts.findIndex((p) => p.name.toLowerCase() === n);
  if (exact >= 0) return exact;
  const loose = parts.findIndex((p) => p.name.toLowerCase().includes(n) || n.includes(p.name.toLowerCase()));
  return loose >= 0 ? loose : null;
}

export default function ShopSheet({
  manual,
  parts,
  initial,
  onClose,
}: {
  manual: Pick<Manual, "source" | "title" | "subtitle">;
  parts: ExtractedPart[];
  initial: string | null; // the missing part's name from a check, or null to start with the first part
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const closeBtn = useRef<HTMLButtonElement>(null);
  // A check can name a part that isn't in the step's list; it's offered as its own choice.
  const startIdx = initial ? matchPart(parts, initial) : 0;
  const extra = initial && startIdx == null ? initial : null;
  const [pick, setPick] = useState<number | "extra">(startIdx ?? (extra ? "extra" : 0));
  const part = pick === "extra" ? null : parts[pick];
  const links = shopLinks({
    source: manual.source,
    part: part?.name ?? extra ?? "",
    description: part?.visual_description,
    title: manual.title,
    subtitle: manual.subtitle,
  });

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      before?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  const chip = (selected: boolean) =>
    `flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition active:scale-95 ${
      selected ? "border-sky-300/70 bg-sky-300/15 shadow-[0_0_16px_-4px_rgba(92,200,255,0.8)]" : "border-white/15 bg-white/5 hover:border-white/30"
    }`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.2 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 backdrop-blur-sm sm:items-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shop-title"
        initial={reduced ? false : { y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={reduced ? { opacity: 0 } : { y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        className="hud-panel holo-glow m-0 w-full max-w-md rounded-t-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:m-4 sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-sky-300">Missing a part?</p>
            <h2 id="shop-title" className="mt-0.5 text-lg font-semibold leading-snug">
              Get a replacement
            </h2>
          </div>
          <button ref={closeBtn} onClick={onClose} className="rounded-xl bg-white/10 px-3 py-1.5 text-sm font-medium text-white/85 hover:text-white">
            Close
          </button>
        </div>

        {(parts.length > 1 || extra) && (
          <div role="radiogroup" aria-label="Which part" className="mt-3 flex flex-wrap gap-2">
            {extra && (
              <button role="radio" aria-checked={pick === "extra"} onClick={() => setPick("extra")} className={chip(pick === "extra")}>
                {extra}
              </button>
            )}
            {parts.map((p, i) => (
              <button key={`${p.name}-${i}`} role="radio" aria-checked={pick === i} onClick={() => setPick(i)} className={chip(pick === i)}>
                <span className="h-3 w-3 rounded-sm ring-1 ring-white/20" style={{ background: p.color }} />
                {p.name}
              </button>
            ))}
          </div>
        )}
        {parts.length === 1 && !extra && <p className="mt-3 text-sm text-white/80">{parts[0].name}</p>}

        <ul className="mt-4 space-y-2">
          {links.map((l) => (
            <li key={l.store}>
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2.5 transition hover:bg-white/10 active:scale-[0.99]"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {l.label} <span className="font-normal text-white/50">· {l.store}</span>
                  </span>
                  {l.note && <span className="mt-0.5 block text-[11px] leading-snug text-white/55">{l.note}</span>}
                </span>
                <span aria-hidden className="shrink-0 text-sky-300">↗</span>
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-white/40">Opens the store in a new tab. BuildSight doesn&apos;t sell parts or take payment.</p>
      </motion.div>
    </motion.div>
  );
}
