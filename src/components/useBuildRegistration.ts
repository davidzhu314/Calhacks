"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { CameraHandle } from "./CameraFeed";
import { bestPatchOnSegment, trackPatch, type Patch } from "@/lib/patchTracker";
import { registerTwoPoints, shiftRegistration, type Registration } from "@/lib/registration";
import type { Point } from "@/lib/arGeometry";

export function useBuildRegistration(camera: RefObject<CameraHandle | null>, enabled: boolean, session: string, points: [Point, Point]) {
  const [registration, setRegistration] = useState<Registration | null>(null);
  const [tapIndex, setTapIndex] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const first = useRef<Point | null>(null);
  const patch = useRef<Patch | null>(null);
  const bad = useRef(0);
  const current = useRef<Registration | null>(null);
  const trackPosition = useRef<Point | null>(null);

  useEffect(() => {
    // A new manual is a new build; step changes intentionally retain alignment.
    current.current = null; patch.current = null; first.current = null; bad.current = 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRegistration(null); setTapIndex(null); setMessage("");
  }, [session]);

  const align = useCallback(() => { first.current = null; patch.current = null; current.current = null; setRegistration(null); setTapIndex(0); setMessage("Tap 1: left end stud on the first green plate."); }, []);
  const tap = useCallback((point: Point) => {
    const size = camera.current?.size();
    if (!size) { setMessage("Camera is not ready yet."); return; }
    const pixel = { x: point.x * size.w, y: point.y * size.h };
    if (!first.current) { first.current = pixel; setTapIndex(1); setMessage("Tap 2: right end stud on the same straight edge."); return; }
    const result = registerTwoPoints(points[0], points[1], first.current, pixel);
    if (!result) { first.current = null; setTapIndex(0); setMessage("Those taps were too close or too far apart. Tap the left end stud again."); return; }
    const frame = camera.current?.trackFrame();
    if (frame) {
      patch.current = bestPatchOnSegment(frame, first.current.x / size.w * frame.width, first.current.y / size.h * frame.height, pixel.x / size.w * frame.width, pixel.y / size.h * frame.height);
      trackPosition.current = patch.current ? { x: patch.current.x, y: patch.current.y } : null;
    }
    bad.current = 0; current.current = result; setRegistration(result); setTapIndex(null);
    setMessage(patch.current ? "Aligned to the first plate. Check the ghost against the manual." : "Aligned. Tracking needs more visual detail; re-align if the build moves.");
  }, [camera, points]);

  useEffect(() => {
    if (!enabled || !registration || !patch.current) return;
    const timer = window.setInterval(() => {
      if (document.hidden || !current.current || !patch.current || !trackPosition.current) return;
      const frame = camera.current?.trackFrame();
      const size = camera.current?.size();
      if (!frame || !size) return;
      const found = trackPatch(patch.current, frame, trackPosition.current.x, trackPosition.current.y, 7);
      if (!found.reliable) {
        if (++bad.current >= 4) { patch.current = null; current.current = null; setRegistration(null); setMessage("Guide lost alignment — rescan or tap to position. Re-align to the first plate."); }
        return;
      }
      bad.current = 0;
      const dx = (found.x - trackPosition.current.x) / frame.width * size.w;
      const dy = (found.y - trackPosition.current.y) / frame.height * size.h;
      trackPosition.current = { x: found.x, y: found.y };
      if (Math.abs(dx) + Math.abs(dy) > .25) { current.current = shiftRegistration(current.current, dx, dy); setRegistration(current.current); }
    }, 280);
    return () => window.clearInterval(timer);
  }, [enabled, registration, camera]);

  return { registration, tapIndex, message, align, tap };
}
