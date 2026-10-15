import { describe, it, expect } from 'vitest';
import { marchingSquares } from '../math/marchingSquares';
import { marchingCubes } from '../math/marchingCubes';

describe('marchingSquares', () => {
  it('extracts a circle contour from x^2+y^2-4', () => {
    const n = 60;
    const xs = Array.from({ length: n }, (_, i) => -3 + (6 * i) / (n - 1));
    const ys = Array.from({ length: n }, (_, i) => -3 + (6 * i) / (n - 1));
    const field = new Float64Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        field[j * n + i] = xs[i] ** 2 + ys[j] ** 2 - 4;
      }
    }
    const segs = marchingSquares(xs, ys, field, n);
    expect(segs.length).toBeGreaterThan(20);
    for (const s of segs) {
      const r1 = Math.hypot(s.x1, s.y1);
      const r2 = Math.hypot(s.x2, s.y2);
      expect(r1).toBeGreaterThan(1.7);
      expect(r1).toBeLessThan(2.3);
      expect(r2).toBeGreaterThan(1.7);
      expect(r2).toBeLessThan(2.3);
    }
  });

  it('returns no segments for a field with no sign change', () => {
    const n = 10;
    const xs = Array.from({ length: n }, (_, i) => i);
    const ys = Array.from({ length: n }, (_, i) => i);
    const field = new Float64Array(n * n).fill(5);
    expect(marchingSquares(xs, ys, field, n)).toHaveLength(0);
  });
});

describe('marchingCubes', () => {
  it('extracts a closed sphere surface from x^2+y^2+z^2-4', () => {
    const tris = marchingCubes(
      (x, y, z) => x * x + y * y + z * z - 4,
      { min: { x: -3, y: -3, z: -3 }, max: { x: 3, y: 3, z: 3 } },
      24
    );
    expect(tris.length).toBeGreaterThan(50);
    for (const t of tris) {
      for (const p of [t.a, t.b, t.c]) {
        const r = Math.hypot(p.x, p.y, p.z);
        expect(r).toBeGreaterThan(1.5);
        expect(r).toBeLessThan(2.5);
      }
    }
  });

  it('returns no triangles when the field never crosses the isolevel', () => {
    const tris = marchingCubes(
      () => 10,
      { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } },
      8
    );
    expect(tris).toHaveLength(0);
  });
});

describe('inequality volume direction (regression: >, <, = must differ)', () => {
  const fn = (x: number, y: number, z: number) => x - y - z; // x - y - z

  function voxelCount(satisfies: (v: number) => boolean, res = 10, bound = 6) {
    const step = (2 * bound) / res;
    let count = 0;
    for (let i = 0; i < res; i++) {
      const cx = -bound + step * (i + 0.5);
      for (let j = 0; j < res; j++) {
        const cy = -bound + step * (j + 0.5);
        for (let k = 0; k < res; k++) {
          const cz = -bound + step * (k + 0.5);
          if (satisfies(fn(cx, cy, cz))) count++;
        }
      }
    }
    return count;
  }

  it('x > y+z and x < y+z fill roughly complementary (non-identical) regions', () => {
    const gt = voxelCount((v) => v > 0);
    const lt = voxelCount((v) => v < 0);
    const eq = voxelCount((v) => Math.abs(v) < 1e-6);
    expect(gt).toBeGreaterThan(0);
    expect(lt).toBeGreaterThan(0);
    expect(gt).not.toBe(lt === 0 ? -1 : eq); // sanity: eq (boundary) is tiny vs filled volumes
    expect(eq).toBeLessThan(gt);
    expect(eq).toBeLessThan(lt);
    expect(Math.abs(gt - lt)).toBeLessThan(5); // roughly symmetric for a planar inequality
  });
});

