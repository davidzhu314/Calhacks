import type { ArBox, ArPoint } from "./arGuide";

/** Crop the camera photo around a grounded assembly and add a percent grid. Browser only. */
export async function cropAssembly(frame: string, box: ArBox): Promise<{ image: string; bounds: ArBox }> {
  const image = new Image();
  image.src = frame;
  await image.decode();
  const padX = (box.right - box.left) * .22, padY = (box.bottom - box.top) * .22;
  const bounds = { left: Math.max(0, box.left - padX), top: Math.max(0, box.top - padY), right: Math.min(1, box.right + padX), bottom: Math.min(1, box.bottom + padY) };
  const sourceW = (bounds.right - bounds.left) * image.naturalWidth;
  const sourceH = (bounds.bottom - bounds.top) * image.naturalHeight;
  const scale = Math.min(1, 960 / Math.max(sourceW, sourceH));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceW * scale));
  canvas.height = Math.max(1, Math.round(sourceH * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Camera crop unavailable.");
  ctx.drawImage(image, bounds.left * image.naturalWidth, bounds.top * image.naturalHeight, sourceW, sourceH, 0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(255,255,255,.48)";
  ctx.fillStyle = "rgba(0,0,0,.78)";
  ctx.lineWidth = 1;
  ctx.font = "bold 13px sans-serif";
  for (let i = 1; i < 10; i++) {
    const x = i / 10 * canvas.width, y = i / 10 * canvas.height;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    ctx.fillText(String(i * 10), x + 2, 14); ctx.fillText(String(i * 10), 2, y - 3);
  }
  return { image: canvas.toDataURL("image/jpeg", .82), bounds };
}

export function cropPointToFrame(point: ArPoint, bounds: ArBox): ArPoint {
  return { x: bounds.left + point.x * (bounds.right - bounds.left), y: bounds.top + point.y * (bounds.bottom - bounds.top) };
}
