"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { CameraHandle } from "./CameraFeed";
import type { ArGuide, ArPoint } from "@/lib/arGuide";
import { parseGuide } from "@/lib/arGuide";
import { parseFineGuide } from "@/lib/arGuide";
import { cropAssembly, cropPointToFrame } from "@/lib/arCrop";
import { acceptDetection, isLost, pinPlacement, sceneDelta, type Anchor } from "@/lib/arTracker";
import { mayGround, responseIsCurrent, viewReadyForRetry } from "@/lib/arScheduler";
import type { PartLine } from "@/lib/parts";

export type GuidePhase = "off" | "finding" | "guiding" | "degraded" | "lost";
type Input = { enabled: boolean; key: string; camera: RefObject<CameraHandle | null>; target: string | null; previous: string | null; instruction: string; part: string; parts: PartLine[]; blocked: boolean; sourceOnly?: boolean };
const MOVED = .13;

export function useArGuide({ enabled, key, camera, target, previous, instruction, part, parts, blocked, sourceOnly = false }: Input) {
  const [phase, setPhase] = useState<GuidePhase>("off");
  const [guide, setGuide] = useState<ArGuide | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [message, setMessage] = useState("");
  const [rotation, setRotation] = useState(0);
  const cache = useRef(new Map<string, Anchor>());
  const sourceCache = useRef(new Map<string, ArGuide>());
  const anchor = useRef<Anchor | null>(null);
  const baseline = useRef<Uint8ClampedArray | null>(null);
  const failedView = useRef<Uint8ClampedArray | null>(null);
  const previousView = useRef<Uint8ClampedArray | null>(null);
  const candidate = useRef<ArGuide | null>(null);
  const requestId = useRef(0);
  const busy = useRef(false);
  const noFrameCount = useRef(0);
  const lastRequest = useRef(0);
  const due = useRef(false);
  const activeKey = useRef(key);
  const current = useRef({ enabled, key, target, previous, instruction, part, parts, blocked, sourceOnly });
  useEffect(() => { current.current = { enabled, key, target, previous, instruction, part, parts, blocked, sourceOnly }; }, [enabled, key, target, previous, instruction, part, parts, blocked, sourceOnly]);
  useEffect(() => () => { requestId.current++; }, []);

  useEffect(() => {
    if (activeKey.current !== key && cache.current.get(activeKey.current)?.pinned) cache.current.delete(activeKey.current);
    activeKey.current = key;
    requestId.current++;
    baseline.current = null;
    failedView.current = null;
    previousView.current = null;
    candidate.current = null;
    // Navigation swaps the active anchor; these state updates deliberately follow the new key.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAdjusting(false);
    setRotation(0);
    anchor.current = sourceOnly ? null : cache.current.get(key) ?? null;
    const stored = sourceOnly ? sourceCache.current.get(key) ?? null : anchor.current?.guide ?? null;
    setGuide(stored);
    setPhase(!enabled ? "off" : !stored ? "finding" : !sourceOnly || stored.partBox ? "guiding" : stored.visible ? "degraded" : "lost");
    due.current = enabled && !stored;
  }, [key, enabled, sourceOnly]);

  useEffect(() => {
    if (!enabled || blocked) return;
    const timer = window.setInterval(() => {
      const state = current.current;
      if (!mayGround({ enabled: state.enabled, blocked: state.blocked, hidden: document.hidden, ready: !!state.target && !!state.part, due: due.current, busy: busy.current, now: Date.now(), lastRequest: lastRequest.current })) return;
      const frame = camera.current?.capture("detail");
      if (!frame) {
        if (++noFrameCount.current === 8) { setPhase("degraded"); setMessage("Camera frame unavailable. Check camera permission or refresh."); }
        return;
      }
      noFrameCount.current = 0;
      const requestView = camera.current?.sample() ?? null;
      due.current = false;
      busy.current = true;
      lastRequest.current = Date.now();
      const id = ++requestId.current;
      const requestKey = state.key;
      setPhase(anchor.current ? "degraded" : "finding");
      void fetch("/api/ar-guide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: state.sourceOnly ? "source" : "ground", frame, expected: state.target, previous: state.previous ?? undefined, instruction: state.instruction, part: state.part, parts: state.parts }) })
        .then(async (res) => { const data = await res.json(); if (!res.ok) throw new Error(data.error || "Could not locate assembly."); return parseGuide(data); })
        .then(async (coarse) => {
          if (state.sourceOnly) return coarse;
          if (!coarse?.visible || !coarse.assemblyBox || coarse.demo || coarse.confidence < .65) return coarse;
          if (!responseIsCurrent({ key: requestKey, id }, { key: activeKey.current, id: requestId.current, enabled: current.current.enabled, blocked: current.current.blocked })) return coarse;
          try {
            const crop = await cropAssembly(frame, coarse.assemblyBox);
            const res = await fetch("/api/ar-guide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "fine", frame: crop.image, expected: state.target, previous: state.previous ?? undefined, instruction: state.instruction, part: state.part, parts: state.parts }) });
            if (!res.ok) return coarse;
            const fine = parseFineGuide(await res.json());
            if (!fine?.visible || !fine.placement) return coarse;
            const placement = cropPointToFrame(fine.placement, crop.bounds);
            const b = coarse.assemblyBox;
            if (placement.x < b.left - .1 || placement.x > b.right + .1 || placement.y < b.top - .1 || placement.y > b.bottom + .1) return coarse;
            return { ...coarse, placement, orientationDegrees: fine.orientationDegrees ?? coarse.orientationDegrees };
          } catch { return coarse; }
        })
        .then((result) => {
          if (!responseIsCurrent({ key: requestKey, id }, { key: activeKey.current, id: requestId.current, enabled: current.current.enabled, blocked: current.current.blocked })) return;
          if (!result) throw new Error("Guide response was invalid.");
          if (state.sourceOnly) {
            const sourceGuide = { ...result, placement: undefined };
            sourceCache.current.set(requestKey, sourceGuide);
            setGuide(sourceGuide);
            setPhase(sourceGuide.partBox ? "guiding" : sourceGuide.visible ? "degraded" : "lost");
            setMessage(sourceGuide.partBox ? "" : sourceGuide.explanation || "Loose piece not visible. Move it into view and rescan.");
            return;
          }
          if (!result.visible) {
            anchor.current = null;
            cache.current.delete(requestKey);
            failedView.current = requestView;
            previousView.current = null;
            setGuide(result);
            setPhase("lost");
            setMessage(`Can't see the workpiece. ${result.explanation || "Aim the camera at the build, then hold it steady."}`);
            return;
          }
          const accepted = acceptDetection(anchor.current, result, Date.now(), .35, candidate.current);
          if (accepted) {
            candidate.current = null;
            failedView.current = null;
            anchor.current = accepted;
            cache.current.set(requestKey, accepted);
            baseline.current = camera.current?.sample() ?? null;
            setGuide(accepted.guide);
            setPhase("guiding");
            setMessage("");
          } else {
            candidate.current = result;
            due.current = false;
            setGuide({ ...result, assemblyBox: undefined, partBox: undefined, placement: undefined });
            setPhase("degraded");
            setMessage("Alignment uncertain — tap to position or rescan.");
          }
        })
        .catch((error) => {
          if (!responseIsCurrent({ key: requestKey, id }, { key: activeKey.current, id: requestId.current, enabled: current.current.enabled, blocked: current.current.blocked })) return;
          due.current = false;
          setPhase("degraded");
          setMessage(`Couldn't locate, tap to position. ${error instanceof Error ? error.message : "Try a clearer view."}`);
        })
        .finally(() => { busy.current = false; });
    }, 250);
    return () => window.clearInterval(timer);
  }, [enabled, blocked, camera]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      if (document.hidden || busy.current || current.current.sourceOnly) return;
      const sample = camera.current?.sample() ?? null;
      if (!anchor.current) {
        if (viewReadyForRetry(failedView.current, previousView.current, sample, sceneDelta)) {
          failedView.current = null;
          due.current = false;
          setPhase("finding");
          setMessage("New view detected — looking for the build.");
        }
        previousView.current = sample;
        return;
      }
      if (anchor.current.guide.demo) return;
      if (isLost(anchor.current, Date.now())) {
        anchor.current = null;
        cache.current.delete(activeKey.current);
        baseline.current = null;
        setGuide(null);
        setPhase("lost"); setMessage("Guide lost alignment — rescan or tap to position."); due.current = false; return;
      }
      if (sample && baseline.current && sceneDelta(sample, baseline.current) > MOVED) {
        if (anchor.current.pinned) {
          anchor.current = null;
          cache.current.delete(activeKey.current);
          baseline.current = null;
          setGuide(null);
        }
        setPhase("degraded"); setMessage("Camera moved — rescan to restore alignment."); due.current = false;
      }
    }, 300);
    return () => window.clearInterval(timer);
  }, [enabled, camera]);

  const rescan = useCallback(() => {
    requestId.current++;
    cache.current.delete(activeKey.current);
    sourceCache.current.delete(activeKey.current);
    anchor.current = null;
    baseline.current = null;
    failedView.current = null;
    previousView.current = null;
    candidate.current = null;
    due.current = true;
    setGuide(null);
    setPhase("finding");
    setMessage("");
  }, []);
  const invalidate = useCallback(() => { requestId.current++; due.current = false; }, []);
  const adjust = useCallback((point: ArPoint) => {
    const currentGuide = guide ? { ...guide, visible: true } : { visible: true, status: "ambiguous" as const, confidence: 0, explanation: "User positioned guide", orientationDegrees: null };
    const prior = anchor.current ?? { guide: currentGuide, seenAt: Date.now(), quality: 0, pinned: false };
    const pinned = pinPlacement(prior, point);
    anchor.current = pinned;
    cache.current.set(activeKey.current, pinned);
    setGuide(pinned.guide);
    setPhase("guiding");
    setMessage("Placement adjusted by you");
    setAdjusting(false);
  }, [guide]);
  const resetAdjustment = useCallback(() => { rescan(); setAdjusting(false); }, [rescan]);
  return { phase, guide, message, adjusting, setAdjusting, rotation, setRotation, rescan, invalidate, adjust, resetAdjustment };
}
