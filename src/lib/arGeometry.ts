export type Point = { x: number; y: number };
export type Box = { left: number; top: number; right: number; bottom: number };
export type CoverMap = { videoW: number; videoH: number; boxW: number; boxH: number; scale: number; offsetX: number; offsetY: number };

export function coverMap(videoW: number, videoH: number, boxW: number, boxH: number): CoverMap {
  const scale = videoW > 0 && videoH > 0 ? Math.max(boxW / videoW, boxH / videoH) : 0;
  return { videoW, videoH, boxW, boxH, scale, offsetX: (boxW - videoW * scale) / 2, offsetY: (boxH - videoH * scale) / 2 };
}

export function frameToScreen(value: Point | Box, map: CoverMap): Point | Box {
  const x = (n: number) => map.offsetX + n * map.videoW * map.scale;
  const y = (n: number) => map.offsetY + n * map.videoH * map.scale;
  if ("left" in value) return { left: x(value.left), top: y(value.top), right: x(value.right), bottom: y(value.bottom) };
  return { x: x(value.x), y: y(value.y) };
}

export function screenToFrame(point: Point, map: CoverMap): Point {
  if (!map.scale) return { x: 0, y: 0 };
  return { x: (point.x - map.offsetX) / (map.videoW * map.scale), y: (point.y - map.offsetY) / (map.videoH * map.scale) };
}

export function visibleInCover(point: Point, map: CoverMap): boolean {
  const p = frameToScreen(point, map) as Point;
  return p.x >= 0 && p.x <= map.boxW && p.y >= 0 && p.y <= map.boxH;
}

export function clampToBox(point: Point, box: Box): Point {
  return { x: Math.min(box.right, Math.max(box.left, point.x)), y: Math.min(box.bottom, Math.max(box.top, point.y)) };
}
