import { describe, it, expect } from "vitest";
import { __test } from "./remove-background";

const { sampleBorder, kmeans2, floodFillBackground } = __test;

function fillFlat(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  bg: [number, number, number],
): void {
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = bg[0];
    data[i * 4 + 1] = bg[1];
    data[i * 4 + 2] = bg[2];
    data[i * 4 + 3] = 255;
  }
}

function paintRect(
  data: Uint8ClampedArray,
  w: number,
  x0: number,
  y0: number,
  rw: number,
  rh: number,
  rgb: [number, number, number],
): void {
  for (let y = y0; y < y0 + rh; y++) {
    for (let x = x0; x < x0 + rw; x++) {
      const i = (y * w + x) * 4;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = 255;
    }
  }
}

function paintCheckerboard(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  cell: number,
  a: [number, number, number],
  b: [number, number, number],
): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const onA = ((x / cell) | 0) % 2 === ((y / cell) | 0) % 2;
      const c = onA ? a : b;
      const i = (y * w + x) * 4;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }
}

describe("sampleBorder", () => {
  it("only collects opaque border pixels", () => {
    const w = 8, h = 8;
    const data = new Uint8ClampedArray(w * h * 4);
    fillFlat(data, w, h, [200, 100, 50]);
    for (let y = 3; y < 5; y++) {
      for (let x = 3; x < 5; x++) {
        data[(y * w + x) * 4 + 3] = 0;
      }
    }
    const samples = sampleBorder(data, w, h);
    expect(samples.length).toBeGreaterThan(0);
    for (const s of samples) {
      expect(s.r).toBe(200);
      expect(s.g).toBe(100);
      expect(s.b).toBe(50);
    }
  });
});

describe("kmeans2", () => {
  it("returns one centroid for a flat sample set", () => {
    const samples = Array.from({ length: 100 }, () => ({ r: 250, g: 248, b: 240 }));
    const out = kmeans2(samples);
    expect(out).toHaveLength(1);
    expect(out[0].r).toBeCloseTo(250, 0);
  });

  it("returns two centroids for a clear bimodal set", () => {
    const samples = [
      ...Array.from({ length: 40 }, () => ({ r: 255, g: 255, b: 255 })),
      ...Array.from({ length: 40 }, () => ({ r: 200, g: 200, b: 200 })),
    ];
    const out = kmeans2(samples);
    expect(out).toHaveLength(2);
    const lo = Math.min(out[0].r, out[1].r);
    const hi = Math.max(out[0].r, out[1].r);
    expect(lo).toBeCloseTo(200, 0);
    expect(hi).toBeCloseTo(255, 0);
  });

  it("collapses two near-identical clusters to one", () => {
    const samples = [
      ...Array.from({ length: 40 }, () => ({ r: 250, g: 248, b: 240 })),
      ...Array.from({ length: 40 }, () => ({ r: 252, g: 250, b: 242 })),
    ];
    const out = kmeans2(samples);
    expect(out).toHaveLength(1);
  });
});

describe("floodFillBackground — flat-bg image", () => {
  it("knocks out the cream background and keeps the subject", () => {
    const w = 32, h = 32;
    const data = new Uint8ClampedArray(w * h * 4);
    fillFlat(data, w, h, [248, 244, 232]);
    paintRect(data, w, 12, 12, 8, 8, [50, 80, 200]);

    const samples = sampleBorder(data, w, h);
    const centroids = kmeans2(samples);
    floodFillBackground(data, w, h, centroids, 28, 44);

    expect(data[3]).toBe(0);
    expect(data[(w - 1) * 4 + 3]).toBe(0);
    expect(data[((h - 1) * w) * 4 + 3]).toBe(0);

    const centerIdx = (16 * w + 16) * 4;
    expect(data[centerIdx + 3]).toBe(255);
    expect(data[centerIdx]).toBe(50);
  });
});

describe("floodFillBackground — interior pixels matching bg color", () => {
  it("keeps interior bg-coloured pixels because the subject blocks the flood", () => {
    const w = 32, h = 32;
    const data = new Uint8ClampedArray(w * h * 4);
    fillFlat(data, w, h, [248, 244, 232]);
    // Subject ring with a "hole" of bg-coloured pixels in the middle that
    // belong to the subject (e.g. a yellow shirt against a cream bg).
    paintRect(data, w, 8, 8, 16, 16, [50, 80, 200]); // outer subject (blue ring)
    paintRect(data, w, 13, 13, 6, 6, [248, 244, 232]); // interior "shirt" same as bg

    const samples = sampleBorder(data, w, h);
    const centroids = kmeans2(samples);
    floodFillBackground(data, w, h, centroids, 28, 44);

    // Border still cleared.
    expect(data[3]).toBe(0);
    // The interior bg-coloured "shirt" must remain opaque.
    const shirtIdx = (16 * w + 16) * 4;
    expect(data[shirtIdx + 3]).toBe(255);
    expect(data[shirtIdx]).toBe(248);
    expect(data[shirtIdx + 1]).toBe(244);
    expect(data[shirtIdx + 2]).toBe(232);
  });
});

describe("floodFillBackground — checker-bg image", () => {
  it("knocks out both checker tones and keeps the subject", () => {
    const w = 32, h = 32;
    const data = new Uint8ClampedArray(w * h * 4);
    paintCheckerboard(data, w, h, 4, [255, 255, 255], [204, 204, 204]);
    paintRect(data, w, 12, 12, 8, 8, [50, 80, 200]);

    const samples = sampleBorder(data, w, h);
    const centroids = kmeans2(samples);
    expect(centroids.length).toBe(2);

    floodFillBackground(data, w, h, centroids, 28, 44);

    for (let x = 0; x < w; x++) {
      expect(data[x * 4 + 3]).toBe(0);
    }

    const centerIdx = (16 * w + 16) * 4;
    expect(data[centerIdx + 3]).toBe(255);
  });
});

describe("floodFillBackground — feather band", () => {
  it("ramps alpha for pixels in the soft band reached by the flood", () => {
    const w = 4, h = 4;
    const data = new Uint8ClampedArray(w * h * 4);
    // Bg = (250,250,250). Border is pure bg (in flood). One pixel inside is in
    // the SOFT band — it's reachable from the border via bg-bg-soft transition.
    fillFlat(data, w, h, [250, 250, 250]);
    const idx = (1 * w + 1) * 4;
    data[idx] = 250 - 21;
    data[idx + 1] = 250 - 21;
    data[idx + 2] = 250 - 21;
    data[idx + 3] = 255;

    floodFillBackground(data, w, h, [{ r: 250, g: 250, b: 250 }], 28, 44);

    const a = data[idx + 3];
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(255);
  });
});

describe("kmeans2 — edge cases", () => {
  it("handles a single sample", () => {
    const out = kmeans2([{ r: 10, g: 20, b: 30 }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ r: 10, g: 20, b: 30 });
  });

  it("handles an empty input gracefully", () => {
    const out = kmeans2([]);
    expect(out).toHaveLength(1);
  });
});
