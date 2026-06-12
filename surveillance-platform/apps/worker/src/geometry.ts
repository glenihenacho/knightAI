// Zone membership tests on normalized coordinates. Direct port of the
// connector's analysis/src/geometry.rs — kept semantically identical so edge
// and server evaluation agree on every historical test case.

export interface Point {
  x: number;
  y: number;
}

/** Axis-aligned box, normalized to the frame ([0,1] on both axes). */
export interface BBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Where the person touches the ground: bottom-center of the box. Using the
 * feet rather than the box center keeps "in the zone" aligned with
 * floor-drawn polygons even when the person's torso overhangs the edge.
 */
export function anchor(b: BBox): Point {
  return { x: (b.x1 + b.x2) / 2, y: b.y2 };
}

export function area(b: BBox): number {
  return Math.max(b.x2 - b.x1, 0) * Math.max(b.y2 - b.y1, 0);
}

export function iou(a: BBox, b: BBox): number {
  const ix1 = Math.max(a.x1, b.x1);
  const iy1 = Math.max(a.y1, b.y1);
  const ix2 = Math.min(a.x2, b.x2);
  const iy2 = Math.min(a.y2, b.y2);
  const inter = Math.max(ix2 - ix1, 0) * Math.max(iy2 - iy1, 0);
  const union = area(a) + area(b) - inter;
  return union <= 0 ? 0 : inter / union;
}

export function center(b: BBox): Point {
  return { x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 };
}

/**
 * Ray-casting point-in-polygon. Polygons come from the dashboard's zone
 * editor: simple (non-self-intersecting), at least 3 vertices, either
 * winding order.
 */
export function pointInPolygon(p: Point, polygon: readonly Point[]): boolean {
  const n = polygon.length;
  if (n < 3) return false;
  let inside = false;
  let j = n - 1;
  for (let i = 0; i < n; i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
    j = i;
  }
  return inside;
}
