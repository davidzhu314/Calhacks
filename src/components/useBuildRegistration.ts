"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { CameraHandle } from "./CameraFeed";
import { extractPatch, trackPatch, type Patch } from "@/lib/patchTracker";
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

  const align = useCallback(() => { first.current = null; patch.current = null; current.current = null; setRegistration(null); setTapIndex(0); setMessage("Tap stud A on the first plate."); }, []);
  const tap = useCallback((point: Point) => {
    const size = camera.current?.size();
    if (!size) { setMessage("Camera is not ready yet."); return; }
    const pixel = { x: point.x * size.w, y: point.y * size.h };
    if (!first.current) { first.current = pixel; setTapIndex(1); setMessage("Now tap stud B, at the other end of the straight edge."); return; }
    const result = registerTwoPoints(points[0], points[1], first.current, pixel);
    if (!result) { first.current = null; setTapIndex(0); setMessage("Those taps were too close or too far apart. Tap stud A again."); return; }
    const frame = camera.current?.trackFrame();
    if (frame) {
      const x = (first.current.x + pixel.x) / 2 / size.w * frame.width;
      const y = (first.current.y + pixel.y) / 2 / size.h * frame.height;
      patch.current = extractPatch(frame, x, y, 17);
      trackPosition.current = patch.current ? { x: patch.current.x, y: patch.current.y } : null;
    }
    bad.current = 0; current.current = result; setRegistration(result); setTapIndex(null);
    setMessage("Aligned to the first plate. Check the ghost against the manual.");
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
        if (++bad.current >= 4) { patch.current = null; current.current = null; setRegistration(null); setMessage("Guide lost alignment — re-align to the first plate."); }
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
