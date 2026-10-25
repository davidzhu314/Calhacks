"use client";

// What the hub shows while a live search runs: a mono "log" of the steps the search goes through
// (the same steps /api/search takes), ticking off one by one, over placeholder cards with a scan sweep.

import { motion } from "motion/react";
import { useEffect, useState } from "react";

const LEGO_STEPS = ["Contacting lego.com", "Reading building instructions", "Collecting instruction books"];
const IKEA_STEPS = ["Querying IKEA product search", "Opening product pages", "Finding assembly instructions", "Checking PDFs"];
const STEP_MS = 1300;

export default function SearchScan({ query, lego }: { query: string; lego: boolean }) {
  const steps = lego ? LEGO_STEPS : IKEA_STEPS;
  const [at, setAt] = useState(0);
  useEffect(() => {
    // The last step stays active until the results arrive.
    if (at >= steps.length - 1) return;
    const t = setTimeout(() => setAt((a) => a + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [at, steps.length]);

  return (
    <div>
      <h2 className="text-sm font-semibold text-white/90">
        {lego ? `Looking up LEGO set ${query}` : `Searching IKEA for “${query}”`}
      </h2>

      <ol className="mt-3 space-y-1 font-mono text-[11px] leading-5">
        {steps.slice(0, at + 1).map((s, i) => (
          <motion.li key={s} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2">
            {i < at ? <span className="text-emerald-300">✓</span> : <span className="text-sky-300">›</span>}
            <span className={i < at ? "text-white/45" : "text-sky-100"}>{s}</span>
            {i === at && <span className="blink inline-block h-3 w-1.5 bg-sky-300/80" />}
          </motion.li>
        ))}
      </ol>

      {/* placeholder cards being "scanned" */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`relative overflow-hidden rounded-2xl border border-sky-300/15 bg-white/[0.03] ${i === 2 ? "hidden sm:block" : ""}`}>
            <div className="aspect-[4/3] bg-gradient-to-b from-sky-300/[0.06] to-transparent" />
            <div className="space-y-2 p-3">
              <div className="h-3 w-3/4 rounded bg-white/10" />
              <div className="h-2.5 w-1/2 rounded bg-white/5" />
            </div>
            {/* corner brackets */}
            {["left-2 top-2 border-l border-t", "right-2 top-2 border-r border-t", "bottom-2 left-2 border-b border-l", "bottom-2 right-2 border-b border-r"].map((c) => (
              <span key={c} className={`absolute h-3 w-3 border-sky-300/60 ${c}`} />
            ))}
            <span
              className="hud-sweep pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-transparent via-sky-300/20 to-transparent"
              style={{ animationDelay: `${i * 0.35}s` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
