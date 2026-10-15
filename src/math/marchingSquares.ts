export interface Segment {
  x1: number; y1: number; x2: number; y2: number;
}

/**
 * Extract F(x,y) = 0 contour segments from a scalar field sampled on a grid.
 * grid[j][i] = value at (xs[i], ys[j])
 */
export function marchingSquares(xs: number[], ys: number[], grid: Float64Array, cols: number): Segment[] {
  const segments: Segment[] = [];
  const rows = ys.length;

  const interp = (v1: number, v2: number, p1: number, p2: number): number => {
    if (!Number.isFinite(v1) || !Number.isFinite(v2)) return (p1 + p2) / 2;
    const d = v1 - v2;
    if (Math.abs(d) < 1e-12) return (p1 + p2) / 2;
    const t = v1 / d;
    return p1 + t * (p2 - p1);
  };

  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const v00 = grid[j * cols + i];
      const v10 = grid[j * cols + i + 1];
      const v01 = grid[(j + 1) * cols + i];
      const v11 = grid[(j + 1) * cols + i + 1];
      if (!Number.isFinite(v00) || !Number.isFinite(v10) || !Number.isFinite(v01) || !Number.isFinite(v11)) continue;

      let idx = 0;
      if (v00 > 0) idx |= 1;
      if (v10 > 0) idx |= 2;
      if (v11 > 0) idx |= 4;
      if (v01 > 0) idx |= 8;
      if (idx === 0 || idx === 15) continue;

      const x0 = xs[i], x1 = xs[i + 1];
      const y0 = ys[j], y1 = ys[j + 1];

      const top: [number, number] = [interp(v00, v10, x0, x1), y0];
      const right: [number, number] = [x1, interp(v10, v11, y0, y1)];
      const bottom: [number, number] = [interp(v01, v11, x0, x1), y1];
      const left: [number, number] = [x0, interp(v00, v01, y0, y1)];

      const push = (a: [number, number], b: [number, number]) => {
        segments.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
      };

      switch (idx) {
        case 1: push(left, top); break;
        case 2: push(top, right); break;
        case 3: push(left, right); break;
        case 4: push(right, bottom); break;
        case 5: push(left, top); push(right, bottom); break;
        case 6: push(top, bottom); break;
        case 7: push(left, bottom); break;
        case 8: push(bottom, left); break;
        case 9: push(bottom, top); break;
        case 10: push(top, right); push(bottom, left); break;
        case 11: push(bottom, right); break;
        case 12: push(right, left); break;
        case 13: push(right, top); break;
        case 14: push(top, left); break;
      }
    }
  }
  return segments;
}
