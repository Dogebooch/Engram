"use client";

// Background removal for the constrained input set the editor accepts:
// flat-color or transparency-checker backgrounds (typical AI-image-gen output).
// Strategy: cluster border pixels into up to 2 dominant colors, then BFS-flood
// inward from any border pixel that is bg-coloured. Only pixels reachable
// through bg-coloured neighbours get cleared — interior pixels that happen to
// match a bg colour (e.g. a yellow shirt against a cream background) are
// preserved because the subject blocks the flood. A `SOFT` band gives the
// flood frontier a 1-px alpha feather without eating the subject body.

const HARD_THRESHOLD = 28; // RGB Euclidean, 0..441
const SOFT_THRESHOLD = 44;
const MAX_KMEANS_ITERS = 8;
const KMEANS_TOLERANCE = 0.5;

export interface RemoveBackgroundOptions {
  /** Override hard threshold (RGB distance below which alpha → 0). */
  hardThreshold?: number;
  /** Override soft threshold (alpha ramps linearly from 0..255 between hard and soft). */
  softThreshold?: number;
}

export async function removeBackground(
  input: Blob,
  opts: RemoveBackgroundOptions = {},
): Promise<Blob> {
  const hard = opts.hardThreshold ?? HARD_THRESHOLD;
  const soft = Math.max(opts.softThreshold ?? SOFT_THRESHOLD, hard + 1);

  const bitmap = await createImageBitmap(input);
  try {
    const w = bitmap.width;
    const h = bitmap.height;
    if (w === 0 || h === 0) {
      return input;
    }

    const canvas = makeCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("removeBackground: 2d context unavailable");
    ctx.drawImage(bitmap, 0, 0);

    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    const samples = sampleBorder(data, w, h);
    const centroids = kmeans2(samples);

    floodFillBackground(data, w, h, centroids, hard, soft);

    ctx.putImageData(imageData, 0, 0);
    return await canvasToPngBlob(canvas);
  } finally {
    bitmap.close();
  }
}

type Canvas2D = OffscreenCanvas | HTMLCanvasElement;

function makeCanvas(w: number, h: number): Canvas2D {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(w, h);
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

async function canvasToPngBlob(canvas: Canvas2D): Promise<Blob> {
  if ("convertToBlob" in canvas) {
    return await canvas.convertToBlob({ type: "image/png" });
  }
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("removeBackground: canvas.toBlob returned null"));
      },
      "image/png",
    );
  });
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

/** 2-pixel-wide border strip of (r,g,b) samples, opaque pixels only. */
function sampleBorder(data: Uint8ClampedArray, w: number, h: number): RGB[] {
  const samples: RGB[] = [];
  const push = (i: number) => {
    const a = data[i + 3];
    if (a < 8) return; // already transparent — irrelevant
    samples.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
  };
  const stripDepth = Math.min(2, Math.max(1, Math.floor(Math.min(w, h) / 8)));
  for (let y = 0; y < stripDepth; y++) {
    for (let x = 0; x < w; x++) push((y * w + x) * 4);
  }
  for (let y = h - stripDepth; y < h; y++) {
    for (let x = 0; x < w; x++) push((y * w + x) * 4);
  }
  for (let y = stripDepth; y < h - stripDepth; y++) {
    for (let x = 0; x < stripDepth; x++) push((y * w + x) * 4);
    for (let x = w - stripDepth; x < w; x++) push((y * w + x) * 4);
  }
  return samples;
}

/**
 * k=2 means; if the second cluster is small or its centroid is very close to
 * the first, return only the first (flat-bg fast path).
 */
function kmeans2(samples: RGB[]): RGB[] {
  if (samples.length === 0) {
    return [{ r: 255, g: 255, b: 255 }];
  }
  if (samples.length === 1) {
    return [samples[0]];
  }

  // Seed: the two samples furthest apart along the longest channel range.
  let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;
  for (const s of samples) {
    if (s.r < minR) minR = s.r;
    if (s.r > maxR) maxR = s.r;
    if (s.g < minG) minG = s.g;
    if (s.g > maxG) maxG = s.g;
    if (s.b < minB) minB = s.b;
    if (s.b > maxB) maxB = s.b;
  }
  let c1: RGB = { r: minR, g: minG, b: minB };
  let c2: RGB = { r: maxR, g: maxG, b: maxB };

  let n1 = 0;
  let n2 = 0;
  for (let iter = 0; iter < MAX_KMEANS_ITERS; iter++) {
    let s1r = 0, s1g = 0, s1b = 0, c1Count = 0;
    let s2r = 0, s2g = 0, s2b = 0, c2Count = 0;
    for (const s of samples) {
      const d1 = sqDist(s, c1);
      const d2 = sqDist(s, c2);
      if (d1 <= d2) {
        s1r += s.r; s1g += s.g; s1b += s.b; c1Count++;
      } else {
        s2r += s.r; s2g += s.g; s2b += s.b; c2Count++;
      }
    }
    const next1 = c1Count > 0
      ? { r: s1r / c1Count, g: s1g / c1Count, b: s1b / c1Count }
      : c1;
    const next2 = c2Count > 0
      ? { r: s2r / c2Count, g: s2g / c2Count, b: s2b / c2Count }
      : c2;
    const moved = Math.sqrt(sqDist(next1, c1)) + Math.sqrt(sqDist(next2, c2));
    c1 = next1;
    c2 = next2;
    n1 = c1Count;
    n2 = c2Count;
    if (moved < KMEANS_TOLERANCE) break;
  }

  // Collapse to a single centroid when the second cluster is tiny or the two
  // centroids are nearly identical (flat bg with sensor noise).
  const minCount = Math.max(2, Math.floor(samples.length * 0.05));
  if (n2 < minCount || n1 < minCount) {
    return [n1 >= n2 ? c1 : c2];
  }
  if (Math.sqrt(sqDist(c1, c2)) < HARD_THRESHOLD * 0.6) {
    return [{ r: (c1.r + c2.r) / 2, g: (c1.g + c2.g) / 2, b: (c1.b + c2.b) / 2 }];
  }
  return [c1, c2];
}

function sqDist(a: RGB, b: RGB): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

/**
 * BFS flood from every border pixel that is bg-coloured (within `soft` of a
 * centroid). The flood propagates through 4-neighbours that are also
 * bg-coloured. Pixels reached by the flood get their alpha cleared (or
 * feathered if they are in the SOFT band). Interior subject pixels that
 * happen to share the bg's hue are blocked by the surrounding subject and
 * remain untouched.
 */
function floodFillBackground(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  centroids: RGB[],
  hard: number,
  soft: number,
): void {
  const total = w * h;
  const hardSq = hard * hard;
  const softSq = soft * soft;

  // Score per pixel: 0 = definitely bg, 255 = definitely subject, intermediate
  // values are proportional to (distance - hard) / (soft - hard).
  // We don't allocate a separate buffer; instead recompute on demand. The flood
  // visits each pixel at most once so cost is O(n).
  const visited = new Uint8Array(total);

  // Queue of pixel indices. A simple growing array is fine; total iterations
  // are bounded by `total`.
  const queue: number[] = [];

  const isBgish = (idx: number): { bg: boolean; alpha: number } => {
    // Pre-existing fully-transparent pixels: treat as bg, no alpha change.
    const a0 = data[idx * 4 + 3];
    if (a0 === 0) return { bg: true, alpha: 0 };
    const r = data[idx * 4];
    const g = data[idx * 4 + 1];
    const b = data[idx * 4 + 2];
    let minSq = Infinity;
    for (const c of centroids) {
      const dr = r - c.r;
      const dg = g - c.g;
      const db = b - c.b;
      const sq = dr * dr + dg * dg + db * db;
      if (sq < minSq) minSq = sq;
    }
    if (minSq >= softSq) return { bg: false, alpha: a0 };
    if (minSq <= hardSq) return { bg: true, alpha: 0 };
    // SOFT band: feathered. alpha scales by how far we are from hard → soft.
    const d = Math.sqrt(minSq);
    const t = (d - hard) / (soft - hard);
    return { bg: true, alpha: Math.round(a0 * t) };
  };

  const seed = (idx: number) => {
    if (visited[idx]) return;
    const r = isBgish(idx);
    if (!r.bg) return;
    visited[idx] = 1;
    data[idx * 4 + 3] = r.alpha;
    queue.push(idx);
  };

  // Seed from all border pixels.
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 1; y < h - 1; y++) {
    seed(y * w);
    seed(y * w + (w - 1));
  }

  // BFS through 4-neighbours. Use a head pointer instead of `shift()` (O(1)
  // vs O(n)) so the cost stays linear on multi-megapixel images.
  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const x = idx % w;
    const y = (idx - x) / w;
    if (x > 0) seed(idx - 1);
    if (x < w - 1) seed(idx + 1);
    if (y > 0) seed(idx - w);
    if (y < h - 1) seed(idx + w);
  }
}

/** Test-only exports of internal pure functions. */
export const __test = {
  sampleBorder,
  kmeans2,
  floodFillBackground,
};
