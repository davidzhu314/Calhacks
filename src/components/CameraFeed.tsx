"use client";

// Full-screen camera background. Prefers the rear camera on phones.
// Exposes a capture() that returns a resized JPEG data URL for the model, and a sample() that returns a
// tiny grayscale frame for cheap motion sensing on the phone (no network).

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export type CameraHandle = { capture: () => string | null; sample: () => Uint8ClampedArray | null };

const MAX_SIDE = 896; // enough detail for bricks, small enough to upload fast on venue Wi-Fi
const SAMPLE_W = 32;
const SAMPLE_H = 24;

const CameraFeed = forwardRef<CameraHandle>(function CameraFeed(_, ref) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const sampler = useRef<CanvasRenderingContext2D | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera access needs HTTPS or localhost. Open the secure BuildSight link on your phone.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        if (video.current) video.current.srcObject = stream;
      } catch (e) {
        setError(e instanceof Error && e.name === "NotAllowedError" ? "Allow camera access in your browser to check your build." : e instanceof Error ? `Camera unavailable: ${e.message}` : "Camera unavailable.");
      }
    }
    start();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useImperativeHandle(ref, () => ({
    capture() {
      const v = video.current;
      if (!v || !v.videoWidth) return null;
      const scale = Math.min(1, MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.7);
    },
    sample() {
      const v = video.current;
      if (!v || !v.videoWidth) return null;
      if (!sampler.current) {
        const c = document.createElement("canvas");
        c.width = SAMPLE_W;
        c.height = SAMPLE_H;
        sampler.current = c.getContext("2d", { willReadFrequently: true });
      }
      const ctx = sampler.current;
      if (!ctx) return null;
      ctx.drawImage(v, 0, 0, SAMPLE_W, SAMPLE_H);
      const rgba = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
      const gray = new Uint8ClampedArray(SAMPLE_W * SAMPLE_H);
      for (let i = 0; i < gray.length; i++) gray[i] = (rgba[i * 4] * 3 + rgba[i * 4 + 1] * 6 + rgba[i * 4 + 2]) / 10;
      return gray;
    },
  }));

  return (
    <div className="absolute inset-0 bg-black">
      <video ref={video} autoPlay playsInline muted onPlaying={() => setReady(true)} className="h-full w-full object-cover" />
      {!ready && (
        <div role="status" className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_50%_45%,#102436,#030912_70%)] p-6 text-center">
          <div className="max-w-xs">
            <span aria-hidden className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-sky-300/25 bg-sky-300/10 text-sky-200">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h4l2-2h4l2 2h4v12H4z" /><circle cx="12" cy="13" r="3" /></svg>
            </span>
            <p className="mt-4 text-lg font-semibold">{error ? "Camera unavailable" : "Starting camera"}</p>
            <p className="mt-2 text-sm leading-relaxed text-white/60">{error ?? "Keep your work area in view. The live feed will appear here when the camera is ready."}</p>
            {!error && <div className="scan-bar mx-auto mt-5 h-0.5 w-36" />}
          </div>
        </div>
      )}
    </div>
  );
});

export default CameraFeed;
