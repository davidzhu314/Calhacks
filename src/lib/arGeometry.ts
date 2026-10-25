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

export function clampToBox(point: Point, box: Box): Point;
export function clampToBox(point: Point, size: Point, box: Box, insets?: { top?: number; right?: number; bottom?: number; left?: number }): Point;
export function clampToBox(point: Point, sizeOrBox: Point | Box, box?: Box, insets: { top?: number; right?: number; bottom?: number; left?: number } = {}): Point {
  if (!box) {
    const area = sizeOrBox as Box;
    return { x: Math.min(area.right, Math.max(area.left, point.x)), y: Math.min(area.bottom, Math.max(area.top, point.y)) };
  }
  const size = sizeOrBox as Point;
  const left = box.left + (insets.left ?? 0), top = box.top + (insets.top ?? 0);
  const right = Math.max(left, box.right - (insets.right ?? 0) - size.x);
  const bottom = Math.max(top, box.bottom - (insets.bottom ?? 0) - size.y);
  return { x: Math.min(right, Math.max(left, point.x)), y: Math.min(bottom, Math.max(top, point.y)) };
}
