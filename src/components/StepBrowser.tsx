/* eslint-disable @next/next/no-img-element -- preview images come from a rendered PDF or prebuilt manual page */
"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { ExtractedStep } from "@/app/api/extract/route";
import { sameLocation, type StepListItem, type StepLocation } from "@/lib/stepBrowser";

type Props = {
  active: StepLocation;
  activeNumber?: number;
  previewLocation: StepLocation;
  previewStep: ExtractedStep | null;
  previewImage: string | null;
  list: StepListItem[];
  pageCount: number;
  isPrebuilt: boolean;
  loading: boolean;
  error: string | null;
  previousLocation: StepLocation | null;
  nextLocation: StepLocation | null;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onInspect: (location: StepLocation) => void;
  onClose: () => void;
  onSwitch: () => void;
};

export default function StepBrowser({
  active, activeNumber, previewLocation, previewStep, previewImage, list, pageCount, isPrebuilt,
  loading, error, previousLocation, nextLocation, triggerRef, onInspect, onClose, onSwitch,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const trigger = triggerRef.current;
    closeRef.current?.focus();
    return () => trigger?.focus();
  }, [triggerRef]);

  function inspect(location: StepLocation) {
    setZoomed(false);
    onInspect(location);
  }

  function keepFocusInside(event: React.KeyboardEvent) {
    if (event.key !== "Tab" || !dialogRef.current) return;
    const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled])'));
    if (controls.length === 0) return;
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/95 text-white backdrop-blur-xl sm:grid sm:place-items-center sm:bg-ink/85 sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="step-browser-heading"
        onKeyDown={keepFocusInside}
        className="flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-ink sm:h-[min(90dvh,820px)] sm:max-w-6xl sm:rounded-3xl sm:border sm:border-sky-200/20 sm:bg-[#080e18] sm:shadow-[0_30px_100px_rgba(0,0,0,0.65)]"
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:py-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300/75">Manual navigator</p>
            <h2 id="step-browser-heading" className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">Browse steps</h2>
            <p className="mt-1 text-xs text-white/55 sm:text-sm">Active build: {activeNumber == null ? `Page ${active.page}` : `Step ${activeNumber}`} · Previewing {previewStep ? `Step ${previewStep.number}` : `page ${previewLocation.page}`}</p>
          </div>
          <button ref={closeRef} onClick={onClose} className="shrink-0 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-sky-300" aria-label="Close step browser">
            Close
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col sm:grid sm:grid-cols-[minmax(245px,31%)_1fr]">
          <aside className="order-2 min-h-0 border-t border-white/10 sm:order-1 sm:flex sm:flex-col sm:border-r sm:border-t-0">
            <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">{isPrebuilt ? `${list.length} steps` : `Page ${previewLocation.page} steps`}</p>
              {!isPrebuilt && (
                <label className="flex items-center gap-2 text-xs text-white/70">
                  Page
                  <select
                    aria-label="Manual page"
                    value={previewLocation.page}
                    onChange={(event) => inspect({ page: Number(event.target.value), stepIdx: 0 })}
                    className="rounded-lg border border-white/20 bg-[#152031] px-2 py-1.5 text-white focus-visible:outline-2 focus-visible:outline-sky-300"
                  >
                    {Array.from({ length: pageCount }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
                  </select>
                </label>
              )}
            </div>
            <div className="max-h-[21dvh] min-h-0 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-h-none sm:flex-1 sm:px-4 sm:pb-5" aria-label="Manual steps">
              {list.length === 0 && !loading ? <p className="px-2 py-4 text-sm text-white/50">No assembly steps on this page.</p> : null}
              <div className="grid gap-1.5">
                {list.map((item) => {
                  const selected = sameLocation(item, previewLocation);
                  const current = sameLocation(item, active);
                  return (
                    <button
                      key={`${item.page}-${item.stepIdx}`}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => inspect({ page: item.page, stepIdx: item.stepIdx })}
                      className={`w-full rounded-xl border px-3 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-sky-300 ${selected ? "border-sky-300/50 bg-sky-300/15" : "border-transparent bg-white/[0.035] hover:border-white/15 hover:bg-white/[0.07]"}`}
                    >
                      <span className="flex items-center justify-between gap-2 text-[11px] font-semibold text-sky-200/80">
                        <span>Step {item.number} · Page {item.page}</span>
                        {current && <span className="rounded-full bg-sky-300/20 px-2 py-0.5 text-sky-200">Current</span>}
                      </span>
                      <span className="mt-1 block text-sm leading-snug text-white/85">{item.instruction}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          <section className="order-1 flex min-h-0 flex-1 flex-col sm:order-2" aria-label="Step preview">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              {loading ? (
                <div role="status" className="grid h-full min-h-52 content-center gap-4 text-center text-white/65">
                  <div className="scan-bar mx-auto h-1 w-36 rounded-full" />
                  <p>Reading page {previewLocation.page}…</p>
                  {!isPrebuilt && <p className="text-xs text-white/40">Extracting this page may take a moment.</p>}
                </div>
              ) : error ? (
                <div role="alert" className="grid h-full min-h-52 place-content-center gap-3 text-center">
                  <p className="font-semibold text-rose-200">Couldn&apos;t preview this page</p>
                  <p className="max-w-md text-sm text-white/65">{error}</p>
                  <button onClick={() => inspect(previewLocation)} className="mx-auto rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/10">Retry</button>
                </div>
              ) : !previewStep ? (
                <div className="grid h-full min-h-52 place-content-center text-center text-white/60">No assembly steps on this page.</div>
              ) : (
                <div className="mx-auto max-w-3xl">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-300">Step {previewStep.number} <span className="text-white/40">· Page {previewLocation.page}</span></p>
                    {previewImage && <button onClick={() => setZoomed((value) => !value)} aria-pressed={zoomed} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-sky-300">{zoomed ? "Fit image" : "Zoom 2×"}</button>}
                  </div>
                  <div className="max-h-[29dvh] min-h-36 overflow-auto rounded-2xl border border-white/10 bg-white sm:max-h-[42dvh]" style={{ touchAction: "pinch-zoom" }}>
                    {previewImage ? <img src={previewImage} alt={`Manual picture for step ${previewStep.number} on page ${previewLocation.page}`} className={`mx-auto h-auto cursor-zoom-in object-contain ${zoomed ? "w-[200%] max-w-none cursor-zoom-out" : "max-h-[29dvh] w-full sm:max-h-[42dvh]"}`} onClick={() => setZoomed((value) => !value)} /> : <div className="grid min-h-36 place-items-center text-sm text-ink/60">Picture unavailable</div>}
                  </div>
                  <h3 className="mt-4 text-lg font-semibold leading-snug text-white sm:text-xl">{previewStep.instruction}</h3>
                  {previewStep.parts.length > 0 && <ul className="mt-3 flex flex-wrap gap-2">{previewStep.parts.map((part, index) => <li key={`${part.name}-${index}`} className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80"><span className="h-3 w-3 rounded-sm ring-1 ring-white/20" style={{ background: part.color }} />{part.name}<span className="text-white/50">×{part.qty}</span></li>)}</ul>}
                </div>
              )}
            </div>
            <footer className="shrink-0 border-t border-white/10 bg-ink/90 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:py-4">
              <div className="mx-auto flex max-w-3xl items-center gap-2">
                <button onClick={() => previousLocation && inspect(previousLocation)} disabled={!previousLocation || loading} aria-label="Previous preview" className="min-h-11 rounded-xl border border-white/15 px-3 text-sm disabled:opacity-35 hover:bg-white/10">←</button>
                <button onClick={() => nextLocation && inspect(nextLocation)} disabled={!nextLocation || loading} aria-label="Next preview" className="min-h-11 rounded-xl border border-white/15 px-3 text-sm disabled:opacity-35 hover:bg-white/10">→</button>
                <button onClick={onSwitch} disabled={!previewStep || loading || !!error} className="min-h-11 min-w-0 flex-1 rounded-xl bg-sky-300 px-3 text-sm font-semibold text-ink transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-40 sm:ml-auto sm:max-w-56">Switch to this step</button>
              </div>
            </footer>
          </section>
        </div>
      </div>
    </div>
  );
}
