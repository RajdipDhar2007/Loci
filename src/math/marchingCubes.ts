export interface Vec3 { x: number; y: number; z: number; }

export interface Triangle { a: Vec3; b: Vec3; c: Vec3; }

const CORNER_OFFSETS: Vec3[] = [
  { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 },
  { x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }, { x: 1, y: 1, z: 1 }, { x: 0, y: 1, z: 1 },
];

// Decompose the cube (corners 0..7) into 6 tetrahedra sharing the diagonal 0-6.
const TETS: [number, number, number, number][] = [
  [0, 5, 1, 6],
  [0, 1, 2, 6],
  [0, 2, 3, 6],
  [0, 3, 7, 6],
  [0, 7, 4, 6],
  [0, 4, 5, 6],
];

function lerp(a: Vec3, b: Vec3, va: number, vb: number, iso: number): Vec3 {
  const denom = vb - va;
  const t = Math.abs(denom) < 1e-12 ? 0.5 : (iso - va) / denom;
  const ct = Math.min(1, Math.max(0, t));
  return { x: a.x + (b.x - a.x) * ct, y: a.y + (b.y - a.y) * ct, z: a.z + (b.z - a.z) * ct };
}

function polygonizeTet(
  pos: Vec3[],
  val: number[],
  iso: number,
  out: Triangle[]
) {
  const inside: number[] = [];
  const outside: number[] = [];
  for (let i = 0; i < 4; i++) {
    if (!Number.isFinite(val[i])) return;
    if (val[i] < iso) inside.push(i);
    else outside.push(i);
  }
  if (inside.length === 0 || inside.length === 4) return;

  const edgePoint = (i: number, j: number) => lerp(pos[i], pos[j], val[i], val[j], iso);

  if (inside.length === 1 || inside.length === 3) {
    const single = inside.length === 1 ? inside : outside;
    const triple = inside.length === 1 ? outside : inside;
    const [s] = single;
    const p0 = edgePoint(s, triple[0]);
    const p1 = edgePoint(s, triple[1]);
    const p2 = edgePoint(s, triple[2]);
    out.push({ a: p0, b: p1, c: p2 });
  } else {
    // 2 inside, 2 outside -> quad
    const [A, B] = inside;
    const [C, D] = outside;
    const AC = edgePoint(A, C);
    const AD = edgePoint(A, D);
    const BD = edgePoint(B, D);
    const BC = edgePoint(B, C);
    out.push({ a: AC, b: AD, c: BD });
    out.push({ a: AC, b: BD, c: BC });
  }
}

/**
 * Extract triangles approximating F(x,y,z) = isoLevel within the given bounds.
 * fn is evaluated on a resolution^3 grid; keep resolution modest for interactivity.
 */
export function marchingCubes(
  fn: (x: number, y: number, z: number) => number,
  bounds: { min: Vec3; max: Vec3 },
  resolution: number,
  isoLevel = 0
): Triangle[] {
  const nx = resolution, ny = resolution, nz = resolution;
  const dx = (bounds.max.x - bounds.min.x) / nx;
  const dy = (bounds.max.y - bounds.min.y) / ny;
  const dz = (bounds.max.z - bounds.min.z) / nz;

  const values = new Float64Array((nx + 1) * (ny + 1) * (nz + 1));
  const idx = (i: number, j: number, k: number) => (i * (ny + 1) + j) * (nz + 1) + k;

  for (let i = 0; i <= nx; i++) {
    const x = bounds.min.x + i * dx;
    for (let j = 0; j <= ny; j++) {
      const y = bounds.min.y + j * dy;
      for (let k = 0; k <= nz; k++) {
        const z = bounds.min.z + k * dz;
        values[idx(i, j, k)] = fn(x, y, z);
      }
    }
  }

  const triangles: Triangle[] = [];
  const cellPos: Vec3[] = new Array(8);
  const cellVal: number[] = new Array(8);

  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      for (let k = 0; k < nz; k++) {
        let anyPositive = false, anyNegative = false;
        for (let c = 0; c < 8; c++) {
          const off = CORNER_OFFSETS[c];
          const ci = i + off.x, cj = j + off.y, ck = k + off.z;
          const v = values[idx(ci, cj, ck)];
          cellVal[c] = v;
          cellPos[c] = {
            x: bounds.min.x + ci * dx,
            y: bounds.min.y + cj * dy,
            z: bounds.min.z + ck * dz,
          };
          if (v >= isoLevel) anyPositive = true;
          else anyNegative = true;
        }
        if (!anyPositive || !anyNegative) continue;

        for (const [a, b, c, d] of TETS) {
          polygonizeTet(
            [cellPos[a], cellPos[b], cellPos[c], cellPos[d]],
            [cellVal[a], cellVal[b], cellVal[c], cellVal[d]],
            isoLevel,
            triangles
          );
        }
      }
    }
  }

  return triangles;
}
