"use client";
/* eslint-disable @next/next/no-img-element -- the checked photo is a data URL from the camera */

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { issueMarkers, photoLabel, type CheckIssue } from "@/lib/issueBox";
import { changed } from "@/lib/whereAmI";

// The photo a step check judged, with a numbered red box on each mistake Claude could place.
// Boxes are 0-1 of that exact photo, and the wrapper is sized to the rendered image (no object-fit crop or
// letterbox), so percentages of the wrapper are percentages of the photo. Numbers match the problem list.
// `selected` (a 0-based issue index) brightens that box and fades the others. Tapping the photo calls `onOpen`
// (BuildView opens it full screen in ZoomViewer, which draws the same IssueBoxes).
export default function CheckErrorOverlay({
  frame,
  issues,
  selected,
  show = true,
  onOpen,
  big = false,
}: {
  frame: string;
  issues: CheckIssue[];
  selected: number | null;
  show?: boolean;
  onOpen?: () => void;
  big?: boolean; // phones during a mistake: the holograms have stepped aside, so the photo can be taller
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.currentTarget.focus({ preventScroll: true }); // phones don't focus on tap; the viewer returns focus here
        onOpen?.();
      }}
      aria-label={`${photoLabel(issues)}. Open full screen`}
      className="relative block w-fit max-w-full cursor-zoom-in rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"
    >
      <img
        src={frame}
        alt=""
        draggable={false}
        className={`block h-auto w-auto max-w-full rounded-md ${big ? "max-h-[min(26dvh,14rem)]" : "max-h-44"} sm:max-h-56`}
      />
      {show && <IssueBoxes issues={issues} selected={selected} />}
    </button>
  );
}

/** The boxes alone, for any wrapper that is exactly the size of the checked photo. */
export function IssueBoxes({ issues, selected }: { issues: CheckIssue[]; selected: number | null }) {
  return (
    <>
      {issueMarkers(issues).map(({ n, category, box }) => (
        <motion.span
          key={`${n}-${box.x}-${box.y}`}
          aria-hidden
          data-issue-box={n}
          data-category={category}
          initial={{ opacity: 0, scale: 1.25 }}
          animate={{ opacity: selected == null || selected === n - 1 ? 1 : 0.35, scale: 1 }}
          transition={{ duration: 0.25 }}
          className={`issue-box pointer-events-none absolute rounded-md border-2 border-red-500 bg-red-500/15 ${category === "missing" ? "border-dashed" : ""} ${selected === n - 1 ? "issue-box-on" : ""}`}
          style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
        >
          <span className="absolute -left-1.5 -top-2.5 flex items-center gap-0.5 rounded bg-red-500 px-1 text-[10px] font-bold leading-[16px] text-white shadow">
            <WarnGlyph />
            {n}
          </span>
        </motion.span>
      ))}
    </>
  );
}

/** Small warning triangle, so a box never depends on color alone. Drawn, not an emoji (iOS colors those). */
export function WarnGlyph({ className = "h-2.5 w-2.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className}>
      <path d="M8 1.5 15 14.5H1z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 6v4M8 12v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The same boxes on the live camera. The checked photo is the whole camera frame (just scaled), and the video is
 * shown with object-cover, so the photo's 0-1 box maps onto the screen with the same cover transform. This only
 * holds while the camera stays where it was for the check (BuildSight's phone sits over the build): once the view
 * has changed a lot since the check, the boxes hide and a note asks for a new check.
 */
export function LiveIssueBoxes({
  issues,
  selected,
  baseline,
  camera,
}: {
  issues: CheckIssue[];
  selected: number | null;
  baseline: Uint8ClampedArray | null; // camera sample taken with the checked photo
  camera: { size: () => { w: number; h: number } | null; sample: () => Uint8ClampedArray | null } | null;
}) {
  const area = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<{ rect: { left: number; top: number; width: number; height: number }; moved: boolean } | null>(null);
  useEffect(() => {
    const tick = () => {
      const el = area.current;
      const size = camera?.size();
      if (!el || !size) return;
      const W = el.clientWidth;
      const H = el.clientHeight;
      const k = Math.max(W / size.w, H / size.h); // object-cover
      const width = size.w * k;
      const height = size.h * k;
      const now = camera?.sample();
      const moved = !!(baseline && now && changed(baseline, now) > MOVED);
      setView({ rect: { left: (W - width) / 2, top: (H - height) / 2, width, height }, moved });
    };
    tick();
    const timer = setInterval(tick, 400);
    return () => clearInterval(timer);
  }, [camera, baseline]);

  if (!issueMarkers(issues).length) return null;
  return (
    <div ref={area} className="pointer-events-none absolute inset-0 overflow-hidden" data-live-boxes>
      {view && !view.moved && (
        <div className="absolute" style={view.rect}>
          <IssueBoxes issues={issues} selected={selected} />
        </div>
      )}
      {view?.moved && (
        <p className="absolute left-1/2 top-[30%] -translate-x-1/2 rounded-full bg-ink/85 px-3 py-1.5 text-xs font-medium text-red-100 ring-1 ring-red-400/50">
          The camera moved. Check again to mark the mistakes.
        </p>
      )}
    </div>
  );
}

// Share of the tiny camera sample that changed since the check before the boxes are hidden. Fixing one piece
// changes a few percent; a moved camera (or a hand covering the build) changes far more.
const MOVED = 0.2;
