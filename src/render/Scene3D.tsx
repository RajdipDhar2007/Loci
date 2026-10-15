import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useStore } from '../store/useStore';
import { marchingCubes } from '../math/marchingCubes';
import { marchingSquares } from '../math/marchingSquares';
import type { ExpressionEntry, LineStyle, Plane, RelOp, ThemeMode } from '../types';

const SURFACE_RES: Record<string, number> = { low: 28, medium: 46, high: 68 };
const EXPLICIT_RES: Record<string, number> = { low: 48, medium: 84, high: 128 };
const VOXEL_RES: Record<string, number> = { low: 14, medium: 22, high: 32 };
const CURVE2D_RES: Record<string, number> = { low: 220, medium: 420, high: 700 };
const FIELD2D_RES: Record<string, number> = { low: 70, medium: 110, high: 160 };
const REBUILD_MIN_INTERVAL_MS = 45; // throttle, not debounce: caps rebuild rate during slider animation

const AXIS_COLOR = { x: 0xfb7185, y: 0x4ade80, z: 0x38bdf8 };
const TUBE_RADIUS = 0.05; // fixed tube radius for parametric curves (thickness control removed)

function satisfiesOp(v: number, op?: RelOp): boolean {
  switch (op) {
    case '<': return v < 0;
    case '<=': return v <= 0;
    case '>': return v > 0;
    case '>=': return v >= 0;
    default: return Math.abs(v) < 1e-6;
  }
}

/** Map in-plane coordinates (a = first axis, b = second axis) to a 3D point. */
function embed(plane: Plane, a: number, b: number): [number, number, number] {
  if (plane === 'xy') return [a, b, 0];
  if (plane === 'xz') return [a, 0, b];
  return [0, a, b]; // yz
}

/** Pick a "nice" round tick step (1, 2, 5, 10, 20, 50 ...) targeting ~8-10 ticks across the span. */
function niceStep(limit: number): number {
  const rough = (limit * 2) / 9;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(rough, 1e-6))));
  const norm = rough / mag;
  let step: number;
  if (norm < 1.5) step = 1;
  else if (norm < 3.5) step = 2;
  else if (norm < 7.5) step = 5;
  else step = 10;
  return Math.max(step * mag, 0.001);
}

function formatTick(v: number): string {
  const r = Math.round(v * 1000) / 1000;
  return Math.abs(r) < 1e-9 ? '0' : String(r);
}

/** Build crisp canvas text with an outline + glow instead of a background chip,
 * so it reads cleanly against both surfaces and the background without a box. */
function makeLabelSprite(text: string, accentHex: string, theme: ThemeMode, emphasis = false): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const scale = 5; // supersample for crispness
  const pad = emphasis ? 26 : 18;
  const fontSize = (emphasis ? 36 : 27) * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.font = `${emphasis ? '800' : '700'} ${fontSize}px 'Inter', sans-serif`;
  const textW = ctx.measureText(text).width;
  canvas.width = textW + pad * 2 * scale;
  canvas.height = fontSize * 1.6;
  ctx.font = `${emphasis ? '800' : '700'} ${fontSize}px 'Inter', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = canvas.width / 2;
  const cy = canvas.height / 2 + fontSize * 0.03;

  // Outline in the opposite tone so the glyph pops on any background, plus a soft glow.
  const outline = theme === 'dark' ? 'rgba(6,9,15,0.95)' : 'rgba(255,255,255,0.95)';
  const fill = emphasis ? accentHex : (theme === 'dark' ? '#F3F5FA' : '#0E121C');

  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.strokeStyle = outline;
  ctx.lineWidth = fontSize * 0.16;
  ctx.strokeText(text, cx, cy);

  ctx.shadowColor = accentHex;
  ctx.shadowBlur = emphasis ? fontSize * 0.35 : fontSize * 0.18;
  ctx.fillStyle = fill;
  ctx.fillText(text, cx, cy);
  ctx.shadowBlur = 0;

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  const aspect = canvas.width / canvas.height;
  const h = emphasis ? 0.6 : 0.4;
  sprite.scale.set(h * aspect, h, 1);
  return sprite;
}

function hexToCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

// Fixed, absolute world-space axis dimensions — deliberately independent of the axis
// range/limit (`bound`) so thickness never changes just because the range slider moved.
// A separate per-frame camera-distance compensation (see REFERENCE_CAMERA_DISTANCE below)
// keeps the *apparent* screen thickness constant across zoom too.
const AXIS_RADIUS = 0.045;
const AXIS_CONE_HEIGHT = 0.34;
const AXIS_CONE_RADIUS = 0.145;
const REFERENCE_CAMERA_DISTANCE = 14; // matches the default initial camera distance

/** A thick, clearly-directional axis: a solid cylinder shaft + cone arrowhead, drawn twice —
 * once normally depth-tested, once as a faint "ghost" so it's never fully hidden by dense
 * graph surfaces. Shaft/cone meshes are tagged in userData so a per-frame pass can keep
 * their on-screen thickness constant regardless of camera zoom. */
function makeAxis(dir: THREE.Vector3, color: number, bound: number): THREE.Group {
  const group = new THREE.Group();
  const shaftLen = bound * 2 - AXIS_CONE_HEIGHT * 0.5;

  const shaftGeo = new THREE.CylinderGeometry(AXIS_RADIUS, AXIS_RADIUS, shaftLen, 14);
  const coneGeo = new THREE.ConeGeometry(AXIS_CONE_RADIUS, AXIS_CONE_HEIGHT, 18);
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const shaftCenter = dir.clone().multiplyScalar(-bound + shaftLen / 2);
  const coneCenter = dir.clone().multiplyScalar(bound + AXIS_CONE_HEIGHT * 0.15);

  const mainMat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const shaft = new THREE.Mesh(shaftGeo, mainMat);
  shaft.quaternion.copy(quat);
  shaft.position.copy(shaftCenter);
  shaft.userData.axisPart = 'shaft';
  const cone = new THREE.Mesh(coneGeo, mainMat);
  cone.quaternion.copy(quat);
  cone.position.copy(coneCenter);
  cone.userData.axisPart = 'cone';
  group.add(shaft, cone);

  // Ghost pass: renders through occluding surfaces at low opacity so the axis is never
  // fully invisible, while the primary pass above still respects real depth/occlusion.
  const ghostMat = new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: 0.16, depthTest: false });
  const ghostShaft = new THREE.Mesh(shaftGeo, ghostMat);
  ghostShaft.quaternion.copy(quat);
  ghostShaft.position.copy(shaftCenter);
  ghostShaft.renderOrder = 900;
  ghostShaft.userData.axisPart = 'shaft';
  const ghostCone = new THREE.Mesh(coneGeo, ghostMat);
  ghostCone.quaternion.copy(quat);
  ghostCone.position.copy(coneCenter);
  ghostCone.renderOrder = 900;
  ghostCone.userData.axisPart = 'cone';
  group.add(ghostShaft, ghostCone);

  return group;
}

/** Axes with arrowheads, grid, and ruler-style tick marks + floating numeric labels. */
function buildHelpers(
  bound: number,
  theme: ThemeMode,
  view: { showGrid: boolean; showAxes: boolean; showLabels: boolean }
): THREE.Group {
  const group = new THREE.Group();
  const step = niceStep(bound);
  const gridColor = theme === 'dark' ? 0x2a3245 : 0xc3c9d4;
  const gridOpacity = theme === 'dark' ? 0.32 : 0.6;

  if (view.showGrid) {
    const divisions = Math.max(2, Math.round((bound * 2) / step));
    const grid = new THREE.GridHelper(bound * 2, divisions, gridColor, gridColor);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = gridOpacity;
    group.add(grid);
  }

  if (view.showAxes) {
    group.add(makeAxis(new THREE.Vector3(1, 0, 0), AXIS_COLOR.x, bound));
    group.add(makeAxis(new THREE.Vector3(0, 1, 0), AXIS_COLOR.y, bound));
    group.add(makeAxis(new THREE.Vector3(0, 0, 1), AXIS_COLOR.z, bound));

    // short perpendicular notches at each tick, ruler-style
    const notchPts: number[] = [];
    const notchLen = Math.max(0.06, bound * 0.012);
    for (let t = -Math.floor(bound / step) * step; t <= bound + 1e-9; t += step) {
      if (Math.abs(t) < step * 1e-6) continue;
      notchPts.push(t, -notchLen, 0, t, notchLen, 0); // x-axis notches (in y)
      notchPts.push(-notchLen, t, 0, notchLen, t, 0); // y-axis notches (in x)
      notchPts.push(-notchLen, 0, t, notchLen, 0, t); // z-axis notches (in x)
    }
    if (view.showLabels && notchPts.length) {
      const notchGeo = new THREE.BufferGeometry();
      notchGeo.setAttribute('position', new THREE.Float32BufferAttribute(notchPts, 3));
      const notchMat = new THREE.LineBasicMaterial({ color: theme === 'dark' ? 0xffffff : 0x1b2130, transparent: true, opacity: 0.35 });
      group.add(new THREE.LineSegments(notchGeo, notchMat));
    }
  }

  if (view.showLabels) {
    const axisEnd = (axis: 'x' | 'y' | 'z', name: string, color: number) => {
      const pos = new THREE.Vector3();
      const off = bound * 0.1 + 0.3;
      if (axis === 'x') pos.set(bound + off, 0, 0);
      if (axis === 'y') pos.set(0, bound + off, 0);
      if (axis === 'z') pos.set(0, 0, bound + off);
      const sprite = makeLabelSprite(name, hexToCss(color), theme, true);
      sprite.position.copy(pos);
      group.add(sprite);
    };
    axisEnd('x', 'X', AXIS_COLOR.x);
    axisEnd('y', 'Y', AXIS_COLOR.y);
    axisEnd('z', 'Z', AXIS_COLOR.z);

    const tickOff = bound * 0.05 + 0.28;
    const first = -Math.floor(bound / step) * step;
    for (let t = first; t <= bound + 1e-9; t += step) {
      if (Math.abs(t) < step * 1e-6) continue; // skip origin, all three axes cross there
      const label = formatTick(t);
      const sx = makeLabelSprite(label, hexToCss(AXIS_COLOR.x), theme);
      sx.position.set(t, -tickOff, 0);
      group.add(sx);
      const sy = makeLabelSprite(label, hexToCss(AXIS_COLOR.y), theme);
      sy.position.set(tickOff, t, 0);
      group.add(sy);
      const sz = makeLabelSprite(label, hexToCss(AXIS_COLOR.z), theme);
      sz.position.set(0, -tickOff, t);
      group.add(sz);
    }
    const origin = makeLabelSprite('0', theme === 'dark' ? '#E7EAF2' : '#1B2130', theme);
    origin.position.set(-tickOff, -tickOff, 0);
    group.add(origin);
  }

  return group;
}

export function Scene3D() {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    group: THREE.Group;
    helpers: THREE.Group;
    axisParts: THREE.Mesh[];
  } | null>(null);
  const lastBuildRef = useRef(0);
  const pendingTimerRef = useRef<number | null>(null);
  // Continuous "spin until grabbed again" momentum state.
  const draggingRef = useRef(false);
  const spinVelocityRef = useRef(0);
  const autoSpinRef = useRef(false);
  const azimuthHistoryRef = useRef<{ t: number; az: number }[]>([]);

  const expressions = useStore((s) => s.expressions);
  const variables = useStore((s) => s.variables);
  const theme = useStore((s) => s.theme);
  const view = useStore((s) => s.view);
  const camera3d = useStore((s) => s.camera);
  const setCamera = useStore((s) => s.setCamera);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 4000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.touchAction = 'none'; // critical: prevents the browser from
    // hijacking touch/trackpad drags mid-gesture, which is what makes rotation "randomly stop".
    mount.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x1a1f2e, 0.55);
    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    const dir1 = new THREE.DirectionalLight(0xffffff, 1.15);
    dir1.position.set(7, 11, 8);
    const dir2 = new THREE.DirectionalLight(0xbfd4ff, 0.4);
    dir2.position.set(-8, -3, -6);
    const rim = new THREE.DirectionalLight(0xffffff, 0.3);
    rim.position.set(-4, 6, -9);
    scene.add(hemi, ambient, dir1, dir2, rim);

    const group = new THREE.Group();
    const helpers = new THREE.Group();
    scene.add(group, helpers);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.rotateSpeed = 0.85;
    controls.zoomSpeed = 0.9;
    controls.panSpeed = 0.9;
    controls.minDistance = 0.5;
    // Deliberately NOT tied to the axis range/limit — the range slider must never move
    // or clamp the camera. A generous constant means it's effectively never a factor.
    controls.maxDistance = 100000;
    controls.screenSpacePanning = true;

    const c3 = useStore.getState().camera;
    const x = c3.distance * Math.cos(c3.elevation) * Math.sin(c3.azimuth);
    const y = c3.distance * Math.sin(c3.elevation);
    const z = c3.distance * Math.cos(c3.elevation) * Math.cos(c3.azimuth);
    camera.position.set(x, y, z);
    camera.lookAt(...c3.target);
    controls.target.set(...c3.target);

    let raf = 0;
    const clock = new THREE.Clock();
    const MIN_SPIN = 0.006; // rad/s — only filters out a genuine stationary click/tap
    const MAX_SPIN = 4.5; // rad/s — cap so a very fast flick doesn't spin absurdly fast
    const VELOCITY_WINDOW_MS = 220; // capture the gesture's recent sustained speed, not
    // just the last frame — people naturally decelerate right before releasing the
    // mouse, so sampling only the final instant made auto-spin rarely engage.

    const onControlsChange = () => {
      const spherical = new THREE.Spherical().setFromVector3(
        camera.position.clone().sub(controls.target)
      );
      setCamera({
        distance: spherical.radius,
        azimuth: spherical.theta,
        elevation: Math.PI / 2 - spherical.phi,
        target: [controls.target.x, controls.target.y, controls.target.z],
      });
    };
    const onStart = () => {
      draggingRef.current = true;
      autoSpinRef.current = false; // grabbing the scene always stops any ongoing spin
      spinVelocityRef.current = 0;
      azimuthHistoryRef.current = [{ t: performance.now(), az: controls.getAzimuthalAngle() }];
    };
    const onEnd = () => {
      draggingRef.current = false;
      onControlsChange();
      const hist = azimuthHistoryRef.current;
      let v = 0;
      if (hist.length >= 2) {
        const oldest = hist[0];
        const newest = hist[hist.length - 1];
        const dtWindow = (newest.t - oldest.t) / 1000;
        if (dtWindow > 0.01) {
          let delta = newest.az - oldest.az;
          while (delta > Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;
          v = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, delta / dtWindow));
        }
      }
      spinVelocityRef.current = v;
      autoSpinRef.current = Math.abs(v) > MIN_SPIN;
    };
    controls.addEventListener('start', onStart);
    controls.addEventListener('end', onEnd);

    const animate = () => {
      const dt = Math.min(0.1, clock.getDelta());
      const now = performance.now();

      if (draggingRef.current) {
        const az = controls.getAzimuthalAngle();
        const hist = azimuthHistoryRef.current;
        hist.push({ t: now, az });
        while (hist.length > 1 && now - hist[0].t > VELOCITY_WINDOW_MS) hist.shift();
      }

      if (autoSpinRef.current && !draggingRef.current) {
        // Continues rotating indefinitely — no decay — until the user grabs the scene
        // again (which fires 'start' and clears autoSpinRef above).
        const target = controls.target;
        const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(target));
        sph.theta += spinVelocityRef.current * dt;
        camera.position.setFromSpherical(sph).add(target);
        camera.lookAt(target);
      } else {
        controls.update();
      }

      // Keep axis thickness a constant apparent (screen-space) size regardless of zoom.
      const st = stateRef.current;
      if (st && st.axisParts.length) {
        const f = Math.max(0.12, Math.min(30, camera.position.length() / REFERENCE_CAMERA_DISTANCE));
        for (const part of st.axisParts) {
          if (part.userData.axisPart === 'cone') part.scale.set(f, f, f);
          else part.scale.set(f, 1, f);
        }
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    const resize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    stateRef.current = { renderer, scene, camera, controls, group, helpers, axisParts: [] };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.removeEventListener('start', onStart);
      controls.removeEventListener('end', onEnd);
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      stateRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helpers: axes + grid + ticks/labels, rebuilt on theme/view/limit change.
  useEffect(() => {
    const st = stateRef.current;
    if (!st) return;
    disposeGroup(st.helpers);
    const built = buildHelpers(view.axisLimit, theme, view);
    st.helpers.add(built);
    const parts: THREE.Mesh[] = [];
    built.traverse((o) => {
      if ((o as THREE.Mesh).userData?.axisPart) parts.push(o as THREE.Mesh);
    });
    st.axisParts = parts;
  }, [theme, view]);

  // Keep the far clip plane sane as the master axis limit changes — large ranges need a
  // far-enough far-plane and a proportionally larger near-plane to avoid depth-buffer
  // precision collapse (z-fighting) at extreme scale. This never touches camera position
  // or zoom, so changing the range slider cannot itself zoom the view in or out.
  useEffect(() => {
    const st = stateRef.current;
    if (!st) return;
    st.camera.far = Math.max(1000, view.axisLimit * 40);
    st.camera.near = Math.max(0.02, view.axisLimit * 0.0006);
    st.camera.updateProjectionMatrix();
  }, [view.axisLimit]);

  // Camera state sync (for external resets / preset views) — also cancels any ongoing
  // momentum-spin, since an explicit camera jump is a deliberate "grab" of the view.
  useEffect(() => {
    const st = stateRef.current;
    if (!st) return;
    autoSpinRef.current = false;
    const x = camera3d.distance * Math.cos(camera3d.elevation) * Math.sin(camera3d.azimuth);
    const y = camera3d.distance * Math.sin(camera3d.elevation);
    const z = camera3d.distance * Math.cos(camera3d.elevation) * Math.cos(camera3d.azimuth);
    const target = new THREE.Vector3(...camera3d.target);
    const desired = target.clone().add(new THREE.Vector3(x, y, z));
    if (desired.distanceTo(st.camera.position) > 0.01) {
      st.camera.position.copy(desired);
      st.controls.target.copy(target);
    }
  }, [camera3d]);

  // Geometry rebuild — throttled (not debounced) so slider animation stays smooth
  // instead of freezing the scene or piling up work.
  useEffect(() => {
    const anyAnimating = Object.values(variables).some((v) => v.animating);
    const bound = view.axisLimit;

    const run = () => {
      lastBuildRef.current = performance.now();
      pendingTimerRef.current = null;
      rebuildScene(stateRef.current, expressions, variables, anyAnimating, bound);
    };

    const now = performance.now();
    const elapsed = now - lastBuildRef.current;
    if (pendingTimerRef.current !== null) window.clearTimeout(pendingTimerRef.current);
    if (elapsed >= REBUILD_MIN_INTERVAL_MS) {
      run();
    } else {
      pendingTimerRef.current = window.setTimeout(run, REBUILD_MIN_INTERVAL_MS - elapsed);
    }
    return () => {
      if (pendingTimerRef.current !== null) window.clearTimeout(pendingTimerRef.current);
    };
  }, [expressions, variables, view.axisLimit]);

  return <div ref={mountRef} className="three-mount" />;
}

function disposeGroup(group: THREE.Group) {
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = (mesh as THREE.Mesh).material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else if (mat) (mat as THREE.Material).dispose();
    const sprite = obj as THREE.Sprite;
    if ((sprite as THREE.Sprite).isSprite) {
      const smat = sprite.material as THREE.SpriteMaterial;
      smat.map?.dispose();
      smat.dispose();
    }
  });
  group.clear();
}

/** Physically-based, opaque-by-default "buttery smooth" surface material. */
function makeSurfaceMaterial(color: THREE.Color, opacity: number): THREE.MeshPhysicalMaterial {
  const opaque = opacity >= 0.98;
  return new THREE.MeshPhysicalMaterial({
    color,
    transparent: !opaque,
    opacity,
    side: THREE.DoubleSide,
    roughness: 0.28,
    metalness: 0.06,
    clearcoat: 0.45,
    clearcoatRoughness: 0.25,
    depthWrite: true,
    envMapIntensity: 0.6,
  });
}

function rebuildScene(
  st: { group: THREE.Group } | null,
  expressions: ExpressionEntry[],
  variables: Record<string, { value: number }>,
  degrade: boolean,
  bound: number
) {
  if (!st) return;
  disposeGroup(st.group);

  const scopeBase: Record<string, number> = {};
  for (const [k, v] of Object.entries(variables)) scopeBase[k] = v.value;

  const scale = degrade ? 0.65 : 1;
  const scaleRes = (n: number) => Math.max(6, Math.round(n * scale));

  for (const entry of expressions) {
    if (!entry.visible || !entry.parsed) continue;
    const p = entry.parsed;
    const color = new THREE.Color(entry.style.color);
    const extrude = entry.style.extrude && p.plane && (p.kind === 'explicit2d' || p.kind === 'implicit2d' || p.kind === 'inequality2d');

    if (extrude && p.plane) {
      // Sweep a 2D curve/region along its missing axis into a full 3D surface or solid.
      const diffFn3d = buildExtrudedDiff(p);
      if (!diffFn3d) continue;
      const fn = (x: number, y: number, z: number) => diffFn3d({ ...scopeBase, x, y, z });

      if (p.kind === 'inequality2d') {
        const voxelRes = scaleRes(VOXEL_RES[entry.style.quality] ?? 18);
        const volMesh = buildInequalityVolume(fn, voxelRes, color, entry.style.opacity, bound, p.op);
        if (volMesh) st.group.add(volMesh);
        if (entry.style.showBoundary) {
          const res = scaleRes(SURFACE_RES[entry.style.quality] ?? 38);
          const tris = marchingCubes(fn, { min: { x: -bound, y: -bound, z: -bound }, max: { x: bound, y: bound, z: bound } }, res, 0);
          if (tris.length) {
            const geo = trianglesToGeometry(tris);
            addStyledSurface(st.group, geo, color, Math.min(1, entry.style.opacity + 0.1), entry.style.style);
          }
        }
      } else {
        const res = scaleRes(SURFACE_RES[entry.style.quality] ?? 38);
        const tris = marchingCubes(fn, { min: { x: -bound, y: -bound, z: -bound }, max: { x: bound, y: bound, z: bound } }, res, 0);
        if (tris.length) {
          const geo = trianglesToGeometry(tris);
          addStyledSurface(st.group, geo, color, entry.style.opacity, entry.style.style);
        }
      }
      continue;
    }

    if (p.kind === 'explicit3d' && p.evalExplicit) {
      const res = scaleRes(EXPLICIT_RES[entry.style.quality] ?? 72);
      const mesh = buildExplicitSurfaceGeometry(p, scopeBase, res, bound);
      if (mesh) addStyledSurface(st.group, mesh, color, entry.style.opacity, entry.style.style);
    } else if (p.kind === 'implicit3d' && p.evalDiff) {
      const res = scaleRes(SURFACE_RES[entry.style.quality] ?? 38);
      const fn = (x: number, y: number, z: number) => p.evalDiff!({ ...scopeBase, x, y, z });
      const tris = marchingCubes(fn, { min: { x: -bound, y: -bound, z: -bound }, max: { x: bound, y: bound, z: bound } }, res, 0);
      if (tris.length) {
        const geo = trianglesToGeometry(tris);
        addStyledSurface(st.group, geo, color, entry.style.opacity, entry.style.style);
      }
    } else if (p.kind === 'inequality3d' && p.evalDiff) {
      // Actual volume fill so <, <=, >, >= are visually distinct — not just a boundary shell.
      const voxelRes = scaleRes(VOXEL_RES[entry.style.quality] ?? 18);
      const fn = (x: number, y: number, z: number) => p.evalDiff!({ ...scopeBase, x, y, z });
      const volMesh = buildInequalityVolume(fn, voxelRes, color, entry.style.opacity, bound, p.op);
      if (volMesh) st.group.add(volMesh);
      if (entry.style.showBoundary) {
        const res = scaleRes(SURFACE_RES[entry.style.quality] ?? 38);
        const tris = marchingCubes(fn, { min: { x: -bound, y: -bound, z: -bound }, max: { x: bound, y: bound, z: bound } }, res, 0);
        if (tris.length) {
          const geo = trianglesToGeometry(tris);
          addStyledSurface(st.group, geo, color, Math.min(1, entry.style.opacity + 0.1), entry.style.style);
        }
      }
    } else if (p.kind === 'parametric3d' && p.evalParamX && p.evalParamY && p.evalParamZ) {
      const N = degrade ? 260 : 600;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= N; i++) {
        const t = -10 + (20 * i) / N;
        const sc = { ...scopeBase, t };
        const x = p.evalParamX(sc), y = p.evalParamY(sc), z = p.evalParamZ(sc);
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) pts.push(new THREE.Vector3(x, y, z));
      }
      if (pts.length > 1) {
        const curve = new THREE.CatmullRomCurve3(pts, false);
        const tube = new THREE.TubeGeometry(curve, Math.min(400, pts.length), TUBE_RADIUS, 8, false);
        const mat = makeSurfaceMaterial(color, entry.style.opacity);
        st.group.add(new THREE.Mesh(tube, mat));
      }
    } else if (p.kind === 'explicit2d' && p.evalExplicit && p.plane) {
      const res = degrade ? 160 : CURVE2D_RES[entry.style.quality] ?? 420;
      const lines = buildExplicit2DCurve(p, p.plane, scopeBase, res, color, entry.style.opacity, entry.style.style, bound);
      lines.forEach((l) => st.group.add(l));
    } else if ((p.kind === 'implicit2d' || p.kind === 'inequality2d') && p.evalDiff && p.plane) {
      const res = degrade ? 60 : FIELD2D_RES[entry.style.quality] ?? 110;
      const { boundary, fill } = build2DField(p, p.plane, scopeBase, res, color, entry.style, bound);
      if (fill) st.group.add(fill);
      if (boundary) st.group.add(boundary);
    } else if (p.kind === 'parametric2d' && p.evalParamX && p.evalParamY) {
      const N = degrade ? 260 : 600;
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= N; i++) {
        const t = -10 + (20 * i) / N;
        const sc = { ...scopeBase, t };
        const x = p.evalParamX(sc), y = p.evalParamY(sc);
        if (Number.isFinite(x) && Number.isFinite(y)) pts.push(new THREE.Vector3(x, y, 0));
      }
      if (pts.length > 1) {
        const curve = new THREE.CatmullRomCurve3(pts, false);
        const tube = new THREE.TubeGeometry(curve, Math.min(400, pts.length), TUBE_RADIUS, 8, false);
        const mat = makeSurfaceMaterial(color, entry.style.opacity);
        st.group.add(new THREE.Mesh(tube, mat));
      }
    }
  }
}

/** Convert a 2D graph (curve/region) into a full 3D scalar field by leaving its missing
 * axis unconstrained — the level set naturally sweeps into a surface or solid. */
function buildExtrudedDiff(p: ExpressionEntry['parsed']): ((scope: Record<string, number>) => number) | null {
  if (!p) return null;
  if (p.kind === 'explicit2d' && p.evalExplicit && p.explicitVar) {
    const varName = p.explicitVar;
    const exprFn = p.evalExplicit;
    return (scope: Record<string, number>) => scope[varName] - exprFn(scope);
  }
  if ((p.kind === 'implicit2d' || p.kind === 'inequality2d') && p.evalDiff) {
    return p.evalDiff;
  }
  return null;
}

function buildExplicitSurfaceGeometry(
  p: ExpressionEntry['parsed'],
  scopeBase: Record<string, number>,
  res: number,
  bound: number
): THREE.BufferGeometry | null {
  if (!p || !p.evalExplicit) return null;
  const [v1, v2] = p.spatialVars.filter((v) => v !== p.explicitVar);
  const positions = new Float32Array((res + 1) * (res + 1) * 3);
  const indices: number[] = [];
  const idx = (i: number, j: number) => i * (res + 1) + j;

  for (let i = 0; i <= res; i++) {
    const a = -bound + (2 * bound * i) / res;
    for (let j = 0; j <= res; j++) {
      const b = -bound + (2 * bound * j) / res;
      const sc = { ...scopeBase, [v1]: a, [v2]: b };
      const dep = p.evalExplicit(sc);
      const val = Number.isFinite(dep) ? Math.max(-1e4, Math.min(1e4, dep)) : 0;
      const point = { x: 0, y: 0, z: 0 } as Record<'x' | 'y' | 'z', number>;
      point[p.explicitVar!] = val;
      point[v1 as 'x' | 'y' | 'z'] = a;
      point[v2 as 'x' | 'y' | 'z'] = b;
      const k = idx(i, j) * 3;
      positions[k] = point.x; positions[k + 1] = point.y; positions[k + 2] = point.z;
    }
  }
  for (let i = 0; i < res; i++) {
    for (let j = 0; j < res; j++) {
      const a = idx(i, j), b = idx(i + 1, j), c = idx(i, j + 1), d = idx(i + 1, j + 1);
      indices.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildInequalityVolume(
  fn: (x: number, y: number, z: number) => number,
  res: number,
  color: THREE.Color,
  opacity: number,
  bound: number,
  op?: RelOp
): THREE.InstancedMesh | null {
  const step = (2 * bound) / res;
  const centers: [number, number, number][] = [];
  for (let i = 0; i < res; i++) {
    const cx = -bound + step * (i + 0.5);
    for (let j = 0; j < res; j++) {
      const cy = -bound + step * (j + 0.5);
      for (let k = 0; k < res; k++) {
        const cz = -bound + step * (k + 0.5);
        const v = fn(cx, cy, cz);
        if (Number.isFinite(v) && satisfiesOp(v, op)) centers.push([cx, cy, cz]);
      }
    }
  }
  if (centers.length === 0) return null;

  const geo = new THREE.BoxGeometry(step * 0.99, step * 0.99, step * 0.99);
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    transparent: true,
    opacity: Math.min(0.88, 0.35 + opacity * 0.45),
    roughness: 0.6,
    metalness: 0,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, centers.length);
  const dummy = new THREE.Object3D();
  centers.forEach(([x, y, z], i) => {
    dummy.position.set(x, y, z);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/** Real solid/dashed/dotted line rendering (WebGL's `linewidth` is ignored by most
 * browsers, so the actual visual distinction has to come from the dash pattern). */
function makeLineMaterial(color: THREE.Color, opacity: number, lineStyle: LineStyle): THREE.LineBasicMaterial | THREE.LineDashedMaterial {
  const transparent = opacity < 0.98;
  if (lineStyle === 'dashed') return new THREE.LineDashedMaterial({ color, transparent, opacity, dashSize: 0.3, gapSize: 0.18 });
  if (lineStyle === 'dotted') return new THREE.LineDashedMaterial({ color, transparent, opacity, dashSize: 0.045, gapSize: 0.14 });
  return new THREE.LineBasicMaterial({ color, transparent, opacity });
}

/** Adds a 3D surface to the scene, honoring the line-style selector: 'solid' gives the
 * normal opaque filled surface; 'dashed'/'dotted' fade the fill back and overlay a
 * dashed/dotted wireframe grid so the line-style choice is visibly meaningful on 3D
 * graphs too, not just flat 2D curves. */
function addStyledSurface(group: THREE.Group, geo: THREE.BufferGeometry, color: THREE.Color, opacity: number, lineStyle: LineStyle) {
  if (lineStyle === 'solid') {
    group.add(new THREE.Mesh(geo, makeSurfaceMaterial(color, opacity)));
    return;
  }
  group.add(new THREE.Mesh(geo, makeSurfaceMaterial(color, Math.min(opacity, 0.28))));
  const wireGeo = new THREE.WireframeGeometry(geo);
  const lineMat = makeLineMaterial(color, Math.min(1, opacity + 0.15), lineStyle);
  const wire = new THREE.LineSegments(wireGeo, lineMat);
  if (lineMat instanceof THREE.LineDashedMaterial) wire.computeLineDistances();
  group.add(wire);
}

function buildExplicit2DCurve(
  p: ExpressionEntry['parsed'],
  plane: Plane,
  scopeBase: Record<string, number>,
  samples: number,
  color: THREE.Color,
  opacity: number,
  lineStyle: LineStyle,
  bound: number
): THREE.Line[] {
  if (!p || !p.evalExplicit || !p.explicitVar) return [];
  const independent = p.spatialVars.find((v) => v !== p.explicitVar);
  const lines: THREE.Line[] = [];
  let current: THREE.Vector3[] = [];

  const flush = () => {
    if (current.length > 1) {
      const geo = new THREE.BufferGeometry().setFromPoints(current);
      const mat = makeLineMaterial(color, opacity, lineStyle);
      const line = new THREE.Line(geo, mat);
      if (mat instanceof THREE.LineDashedMaterial) line.computeLineDistances();
      lines.push(line);
    }
    current = [];
  };

  for (let i = 0; i <= samples; i++) {
    const t = -bound + (2 * bound * i) / samples;
    const sc = { ...scopeBase };
    if (independent) sc[independent] = t;
    const dep = p.evalExplicit(sc);
    if (!Number.isFinite(dep) || Math.abs(dep) > bound * 3) {
      flush();
      continue;
    }
    const [a, b] = explicitToPlaneCoords(plane, p.explicitVar, t, dep);
    current.push(new THREE.Vector3(...embed(plane, a, b)));
  }
  flush();
  return lines;
}

function explicitToPlaneCoords(plane: Plane, explicitVar: 'x' | 'y' | 'z', indep: number, dep: number): [number, number] {
  const axisA = plane === 'yz' ? 'y' : 'x';
  if (explicitVar === axisA) return [dep, indep];
  return [indep, dep];
}

function build2DField(
  p: ExpressionEntry['parsed'],
  plane: Plane,
  scopeBase: Record<string, number>,
  gridN: number,
  color: THREE.Color,
  style: ExpressionEntry['style'],
  bound: number
): { boundary: THREE.LineSegments | null; fill: THREE.Mesh | null } {
  if (!p || !p.evalDiff) return { boundary: null, fill: null };
  const xs: number[] = new Array(gridN);
  const ys: number[] = new Array(gridN);
  for (let i = 0; i < gridN; i++) xs[i] = -bound + (2 * bound * i) / (gridN - 1);
  for (let j = 0; j < gridN; j++) ys[j] = -bound + (2 * bound * j) / (gridN - 1);

  const field = new Float64Array(gridN * gridN);
  for (let j = 0; j < gridN; j++) {
    for (let i = 0; i < gridN; i++) {
      const sc = { ...scopeBase };
      if (plane === 'xy') { sc.x = xs[i]; sc.y = ys[j]; }
      else if (plane === 'xz') { sc.x = xs[i]; sc.z = ys[j]; }
      else { sc.y = xs[i]; sc.z = ys[j]; }
      field[j * gridN + i] = p.evalDiff!(sc);
    }
  }

  let fill: THREE.Mesh | null = null;
  if (p.kind === 'inequality2d') {
    const positions: number[] = [];
    const cellW = (2 * bound) / (gridN - 1);
    for (let j = 0; j < gridN - 1; j++) {
      for (let i = 0; i < gridN - 1; i++) {
        const v = field[j * gridN + i];
        if (!Number.isFinite(v) || !satisfiesOp(v, p.op)) continue;
        const a0 = xs[i], a1 = xs[i] + cellW, b0 = ys[j], b1 = ys[j] + cellW;
        const p1 = embed(plane, a0, b0), p2 = embed(plane, a1, b0), p3 = embed(plane, a1, b1), p4 = embed(plane, a0, b1);
        positions.push(...p1, ...p2, ...p3, ...p1, ...p3, ...p4);
      }
    }
    if (positions.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({
        color, transparent: true, opacity: Math.max(0.18, style.opacity * 0.4), side: THREE.DoubleSide, depthWrite: false, roughness: 0.9,
      });
      fill = new THREE.Mesh(geo, mat);
    }
  }

  let boundary: THREE.LineSegments | null = null;
  if (p.kind === 'implicit2d' || style.showBoundary) {
    const segs = marchingSquares(xs, ys, field, gridN);
    if (segs.length) {
      const positions = new Float32Array(segs.length * 6);
      segs.forEach((s, idx) => {
        const p1 = embed(plane, s.x1, s.y1);
        const p2 = embed(plane, s.x2, s.y2);
        positions.set([...p1, ...p2], idx * 6);
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = makeLineMaterial(color, style.opacity, style.style);
      boundary = new THREE.LineSegments(geo, mat);
      if (mat instanceof THREE.LineDashedMaterial) boundary.computeLineDistances();
    }
  }

  return { boundary, fill };
}

function trianglesToGeometry(tris: { a: { x: number; y: number; z: number }; b: { x: number; y: number; z: number }; c: { x: number; y: number; z: number } }[]): THREE.BufferGeometry {
  const positions = new Float32Array(tris.length * 9);
  for (let i = 0; i < tris.length; i++) {
    const t = tris[i];
    const o = i * 9;
    positions[o] = t.a.x; positions[o + 1] = t.a.y; positions[o + 2] = t.a.z;
    positions[o + 3] = t.b.x; positions[o + 4] = t.b.y; positions[o + 5] = t.b.z;
    positions[o + 6] = t.c.x; positions[o + 7] = t.c.y; positions[o + 8] = t.c.z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}
