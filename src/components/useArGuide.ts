"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { CameraHandle } from "./CameraFeed";
import type { ArGuide, ArPoint } from "@/lib/arGuide";
import { parseGuide } from "@/lib/arGuide";
import { acceptDetection, isLost, pinPlacement, sceneDelta, type Anchor } from "@/lib/arTracker";
import { mayGround, responseIsCurrent } from "@/lib/arScheduler";

export type GuidePhase = "off" | "finding" | "guiding" | "degraded" | "lost";
type Input = { enabled: boolean; key: string; camera: RefObject<CameraHandle | null>; target: string | null; previous: string | null; instruction: string; part: string; blocked: boolean };
const MOVED = .13;

export function useArGuide({ enabled, key, camera, target, previous, instruction, part, blocked }: Input) {
  const [phase, setPhase] = useState<GuidePhase>("off");
  const [guide, setGuide] = useState<ArGuide | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [message, setMessage] = useState("");
  const [rotation, setRotation] = useState(0);
  const cache = useRef(new Map<string, Anchor>());
  const anchor = useRef<Anchor | null>(null);
  const baseline = useRef<Uint8ClampedArray | null>(null);
  const candidate = useRef<ArGuide | null>(null);
  const requestId = useRef(0);
  const busy = useRef(false);
  const lastRequest = useRef(0);
  const due = useRef(false);
  const activeKey = useRef(key);
  const current = useRef({ enabled, key, target, previous, instruction, part, blocked });
  useEffect(() => { current.current = { enabled, key, target, previous, instruction, part, blocked }; }, [enabled, key, target, previous, instruction, part, blocked]);
  useEffect(() => () => { requestId.current++; }, []);

  useEffect(() => {
    if (activeKey.current !== key && cache.current.get(activeKey.current)?.pinned) cache.current.delete(activeKey.current);
    activeKey.current = key;
    requestId.current++;
    baseline.current = null;
    candidate.current = null;
    // Navigation swaps the active anchor; these state updates deliberately follow the new key.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAdjusting(false);
    setRotation(0);
    anchor.current = cache.current.get(key) ?? null;
    setGuide(anchor.current?.guide ?? null);
    setPhase(enabled ? anchor.current ? "guiding" : "finding" : "off");
    due.current = enabled && !anchor.current;
  }, [key, enabled]);

  useEffect(() => {
    if (!enabled || blocked) return;
    const timer = window.setInterval(() => {
      const state = current.current;
      if (!mayGround({ enabled: state.enabled, blocked: state.blocked, hidden: document.hidden, ready: !!state.target && !!state.part, due: due.current, busy: busy.current, now: Date.now(), lastRequest: lastRequest.current })) return;
      const frame = camera.current?.capture();
      if (!frame) return;
      due.current = false;
      busy.current = true;
      lastRequest.current = Date.now();
      const id = ++requestId.current;
      const requestKey = state.key;
      setPhase(anchor.current ? "degraded" : "finding");
      void fetch("/api/ar-guide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ frame, expected: state.target, previous: state.previous ?? undefined, instruction: state.instruction, part: state.part }) })
        .then(async (res) => { const data = await res.json(); if (!res.ok) throw new Error(data.error || "Could not locate assembly."); return parseGuide(data); })
        .then((result) => {
          if (!responseIsCurrent({ key: requestKey, id }, { key: activeKey.current, id: requestId.current, enabled: current.current.enabled, blocked: current.current.blocked })) return;
          if (!result) throw new Error("Guide response was invalid.");
          if (!result.visible) {
            anchor.current = null;
            cache.current.delete(requestKey);
            setGuide(result);
            setPhase("lost");
            setMessage("Guide lost alignment — rescan or tap to position.");
            return;
          }
          const accepted = acceptDetection(anchor.current, result, Date.now(), .35, candidate.current);
          if (accepted) {
            candidate.current = null;
            anchor.current = accepted;
            cache.current.set(requestKey, accepted);
            baseline.current = camera.current?.sample() ?? null;
            setGuide(accepted.guide);
            setPhase("guiding");
            setMessage("");
          } else {
            candidate.current = result;
            due.current = true;
            setGuide({ ...result, assemblyBox: undefined, partBox: undefined, placement: undefined });
            setPhase("degraded");
            setMessage("Alignment uncertain — tap to position or rescan.");
          }
        })
        .catch((error) => {
          if (!responseIsCurrent({ key: requestKey, id }, { key: activeKey.current, id: requestId.current, enabled: current.current.enabled, blocked: current.current.blocked })) return;
          setPhase("degraded");
          setMessage(error instanceof Error ? error.message : "Could not locate assembly. Tap to position.");
        })
        .finally(() => { busy.current = false; });
    }, 250);
    return () => window.clearInterval(timer);
  }, [enabled, blocked, camera]);

  useEffect(() => {
    if (enabled && !blocked && !anchor.current && !guide) due.current = true;
  }, [enabled, blocked, guide]);

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      if (document.hidden || busy.current || !anchor.current || anchor.current.guide.demo) return;
      if (isLost(anchor.current, Date.now())) {
        anchor.current = null;
        cache.current.delete(activeKey.current);
        baseline.current = null;
        setGuide(null);
        setPhase("lost"); setMessage("Guide lost alignment — rescan or tap to position."); due.current = true; return;
      }
      const sample = camera.current?.sample();
      if (sample && baseline.current && sceneDelta(sample, baseline.current) > MOVED) {
        if (anchor.current.pinned) {
          anchor.current = null;
          cache.current.delete(activeKey.current);
          baseline.current = null;
          setGuide(null);
        }
        setPhase("degraded"); setMessage("Camera moved — confirming alignment."); due.current = true;
      }
    }, 300);
    return () => window.clearInterval(timer);
  }, [enabled, camera]);

  const rescan = useCallback(() => {
    requestId.current++;
    cache.current.delete(activeKey.current);
    anchor.current = null;
    baseline.current = null;
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
