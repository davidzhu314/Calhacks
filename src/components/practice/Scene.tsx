"use client";

// The practice scene (react-three-fiber), drawn on a transparent canvas over the live camera.
// Units are millimetres. Placed parts are solid; the next part's spot is a pulsing holo ghost; the part in your
// hand follows your finger, snapping stud by stud (LEGO) or to slots (PC). Touch: one finger moves the part
// (or turns the view when nothing is held), two fingers turn and zoom. The phone's gyro keeps the model in place.

import { useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { buildPart } from "./build";
import { ghostMaterial, HOLO, solid, uniform } from "./build/materials";
import { snapHeld, type Pack, type Placement, type SnapResult, type Vec3 } from "./engine";

export type Held = { partId: string; rotY: number };

// Guides (ghost, drop line) live on layer 1: the camera draws them, but the light and contact shadows don't,
// so only real parts cast shadows.
const GUIDE_LAYER = 1;
const toGuideLayer = (o: THREE.Object3D) => o.traverse((c) => c.layers.set(GUIDE_LAYER));
export type DropEvent = { spot: SnapResult["spot"]; pos: Vec3 };

// Shared between the interaction handlers and the per-frame animation, without re-rendering React.
type Live = {
  free: THREE.Vector3; // where the finger has moved the held part (before snapping)
  snap: SnapResult | null;
  heldPos: THREE.Vector3; // where the held part is drawn now (eased)
  lastFrom: THREE.Vector3 | null; // where a just-placed part starts its drop animation
  rig: { azimuth: number; polar: number; distance: number; target: THREE.Vector3; goalTarget: THREE.Vector3; goalDistance: number };
};

type LiveRef = MutableRefObject<Live>;

function makeLive(pack: Pack): Live {
  return {
    free: new THREE.Vector3(),
    snap: null,
    heldPos: new THREE.Vector3(),
    lastFrom: null,
    rig: {
      azimuth: pack.camera.azimuth,
      polar: pack.camera.polar,
      distance: pack.camera.distance * 1.25,
      target: new THREE.Vector3(...pack.camera.target),
      goalTarget: new THREE.Vector3(...pack.camera.target),
      goalDistance: pack.camera.distance,
    },
  };
}

type Props = {
  pack: Pack;
  placed: number;
  held: Held | null;
  stuck: boolean;
  shakeKey: number;
  successKey: number;
  successFromHeld: boolean; // false when "next" placed the part for you: it drops from straight above
  gyro: MutableRefObject<THREE.Quaternion | null>;
  onDrop: (e: DropEvent) => void;
  onTapEmpty?: () => void;
};

const ease = {
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

/** Footprint size of a part, ignoring its cable (a plug's ring should hug the plug, not the whole cable run). */
function footprint(obj: THREE.Object3D): THREE.Vector3 {
  const box = new THREE.Box3();
  obj.updateMatrixWorld(true);
  obj.traverse((o) => {
    if (o.name === "cable" || !(o as THREE.Mesh).isMesh) return;
    let skip = false;
    for (let a = o.parent; a; a = a.parent) if (a.name === "cable") skip = true;
    if (!skip) box.expandByObject(o, false);
  });
  return box.getSize(new THREE.Vector3());
}

function spawnOf(pack: Pack, p: Placement): THREE.Vector3 {
  if (p.spawn) return new THREE.Vector3(...p.spawn);
  return new THREE.Vector3(p.pos[0] + pack.spawn[0], p.pos[1] + pack.spawn[1], p.pos[2] + pack.spawn[2]);
}

// ---------- camera: orbit + pinch, eased towards each placement's focus, gyro on top ----------

function CameraRig({ pack, liveRef, gyro, focus }: { pack: Pack; liveRef: LiveRef; gyro: Props["gyro"]; focus: Placement["focus"] }) {
  const { camera, size } = useThree();
  const smooth = useRef(new THREE.Quaternion());
  useEffect(() => camera.layers.enable(GUIDE_LAYER), [camera]);
  // Pack distances are framed for a roughly 4:3 view; narrow portrait screens step back so the width still fits.
  const fit = Math.max(1, 0.75 / (size.width / Math.max(1, size.height)));
  useEffect(() => {
    const rig = liveRef.current.rig;
    rig.goalTarget.set(...(focus?.target ?? pack.camera.target));
    rig.goalDistance = focus?.distance ?? pack.camera.distance;
  }, [focus, pack, liveRef]);
  useFrame((_, dt) => {
    const rig = liveRef.current.rig;
    const k = 1 - Math.exp(-dt * 3.2);
    rig.target.lerp(rig.goalTarget, k);
    rig.distance += (rig.goalDistance - rig.distance) * k;
    const { azimuth: a, polar: p, target } = rig;
    const d = rig.distance * fit;
    camera.position.set(target.x + d * Math.sin(p) * Math.sin(a), target.y + d * Math.cos(p), target.z + d * Math.sin(p) * Math.cos(a));
    camera.lookAt(target);
    const g = gyro.current;
    if (g) {
      smooth.current.slerp(g, 1 - Math.exp(-dt * 14));
      camera.quaternion.multiply(smooth.current);
    } else smooth.current.identity();
    camera.updateMatrixWorld();
  });
  return null;
}

// ---------- studio lighting: lightformer environment (no downloads), key light with soft shadows ----------

// Phones get smaller shadow maps: the soft look stays, the GPU cost halves.
const PHONE = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

function Lighting({ pack }: { pack: Pack }) {
  const r = pack.stage.radius;
  return (
    <>
      <ambientLight intensity={0.12} />
      <hemisphereLight args={["#dfefff", "#1a1410", 0.35]} />
      <directionalLight
        castShadow
        position={[r * 0.55, r * 1.6, r * 0.9]}
        intensity={1.5}
        shadow-mapSize={PHONE ? [1024, 1024] : [2048, 2048]}
        shadow-camera-left={-r}
        shadow-camera-right={r}
        shadow-camera-top={r}
        shadow-camera-bottom={-r}
        shadow-camera-near={r * 0.2}
        shadow-camera-far={r * 4}
        shadow-bias={-0.0004}
        shadow-normalBias={r * 0.0004}
        shadow-radius={3}
      />
      <directionalLight position={[-r, r * 0.6, -r * 0.4]} intensity={0.45} color="#cfe8ff" />
      <Environment resolution={256} frames={1} environmentIntensity={0.85}>
        <Lightformer form="rect" intensity={3} position={[0, 6, 1]} rotation-x={Math.PI / 2} scale={[12, 6, 1]} />
        <Lightformer form="rect" intensity={1.6} position={[0, 3, 8]} scale={[14, 5, 1]} />
        <Lightformer form="rect" intensity={1.4} position={[-6, 2, 2]} rotation-y={Math.PI / 2} scale={[10, 3, 1]} />
        <Lightformer form="rect" intensity={1.1} position={[6, 2, -2]} rotation-y={-Math.PI / 2} scale={[10, 3, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[0, 1, 7]} scale={[10, 2, 1]} />
        <Lightformer form="ring" color="#5cc8ff" intensity={0.5} position={[0, 3, -6]} scale={4} />
        <Lightformer form="rect" intensity={0.55} position={[0, -6, 0]} rotation-x={-Math.PI / 2} scale={[16, 16, 1]} />
        {/* soft panels round the horizon, so upright metal (heatspreaders, brackets) has something to reflect */}
        {[0, 1, 2, 3].map((i) => (
          <Lightformer key={i} form="rect" intensity={0.9} position={[Math.sin((i * Math.PI) / 2) * 9, 0.5, Math.cos((i * Math.PI) / 2) * 9]} rotation-y={(i * Math.PI) / 2 + Math.PI} scale={[9, 2.5, 1]} />
        ))}
      </Environment>
      <ContactShadows position={[0, 0.03, 0]} scale={r * 2.2} resolution={PHONE ? 256 : 512} blur={2.4} far={pack.stage.shadowFar} opacity={0.62} color="#000000" frames={Infinity} />
    </>
  );
}

// ---------- parts ----------

function useSolid(spec: Pack["parts"][string]["spec"]) {
  return useMemo(() => buildPart(spec, solid), [spec]);
}

function PlacedPart({ pack, p, fresh, liveRef }: { pack: Pack; p: Placement; fresh: boolean; liveRef: LiveRef }) {
  const obj = useSolid(pack.parts[p.part].spec);
  const ref = useRef<THREE.Group>(null);
  const anim = useRef<{ t: number; from: THREE.Vector3 } | null>(null);
  const started = useRef(!fresh);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    // start on the first frame (after the scene has noted where the part was dropped from)
    if (!started.current) {
      started.current = true;
      anim.current = { t: 0, from: (liveRef.current.lastFrom ?? new THREE.Vector3(p.pos[0], p.pos[1] + pack.lift * 1.5, p.pos[2])).clone() };
    }
    const a = anim.current;
    if (!a) {
      g.position.set(...p.pos);
      g.scale.setScalar(1);
      return;
    }
    const insert = p.motion === "insert";
    const dur = insert ? 0.62 : 0.42;
    a.t = Math.min(1, a.t + dt / dur);
    const t = a.t;
    const [tx, ty, tz] = p.pos;
    // slide over the spot, then press down; a tiny overshoot reads as the click
    const slide = ease.outCubic(Math.min(1, t / (insert ? 0.35 : 0.5)));
    const press = ease.inOutCubic(Math.max(0, (t - (insert ? 0.3 : 0.15)) / (insert ? 0.6 : 0.65)));
    const settle = t > 0.85 ? Math.sin(((t - 0.85) / 0.15) * Math.PI) : 0;
    const dip = insert ? 0.9 : 0.35; // mm
    g.position.set(a.from.x + (tx - a.from.x) * slide, a.from.y + (ty - a.from.y) * Math.min(1, press) - settle * dip, a.from.z + (tz - a.from.z) * slide);
    g.scale.setScalar(1 + settle * 0.015);
    if (t >= 1) anim.current = null;
  });
  return (
    <group ref={ref} position={p.pos} rotation-y={p.rotY}>
      <group rotation={p.tilt ?? [0, 0, 0]}>
        <primitive object={obj} />
      </group>
    </group>
  );
}

const ghostMat = ghostMaterial();

function Ghost({ pack, p, stuck, groupRef }: { pack: Pack; p: Placement; stuck: boolean; groupRef: MutableRefObject<THREE.Group | null> }) {
  const obj = useMemo(() => {
    const g = buildPart(pack.parts[p.part].spec, uniform(ghostMat));
    g.traverse((c) => {
      c.castShadow = false;
      c.receiveShadow = false;
    });
    return g;
  }, [pack, p]);
  const ring = useRef<THREE.Mesh>(null);
  const { radius, dim } = useMemo(() => {
    const s = footprint(obj);
    // big parts have a lot of glowing surface: tone them down so the scene behind still reads
    return { radius: Math.max(s.x, s.z) * 0.55, dim: THREE.MathUtils.clamp(26 / Math.max(s.x, s.y, s.z), 0.32, 1) };
  }, [obj]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const speed = stuck ? 5.5 : 2.4;
    ghostMat.uniforms.uIntensity.value = ((stuck ? 1.35 : 0.85) + Math.sin(t * speed) * (stuck ? 0.45 : 0.25)) * (stuck ? Math.max(dim, 0.6) : dim);
    if (ring.current) {
      const k = (t * (stuck ? 0.9 : 0.45)) % 1;
      ring.current.scale.setScalar(0.6 + k * (stuck ? 1.4 : 0.7));
      (ring.current.material as THREE.MeshBasicMaterial).opacity = (1 - k) * (stuck ? 0.75 : 0.35);
    }
  });
  useEffect(() => {
    if (groupRef.current) toGuideLayer(groupRef.current);
  });
  return (
    <group ref={groupRef} position={p.pos} rotation-y={p.rotY}>
      <group rotation={p.tilt ?? [0, 0, 0]}>
        <primitive object={obj} />
      </group>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.08} renderOrder={2}>
        <ringGeometry args={[radius * 0.96, radius, 64]} />
        <meshBasicMaterial color={HOLO} transparent opacity={0.4} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

function HeldPart({ pack, p, held, liveRef, shakeKey, groupRef }: { pack: Pack; p: Placement; held: Held; liveRef: LiveRef; shakeKey: number; groupRef: MutableRefObject<THREE.Group | null> }) {
  const obj = useSolid(pack.parts[held.partId].spec);
  const rot = useRef(held.rotY);
  const shake = useRef(-1);
  const line = useRef<THREE.Mesh>(null);
  const marker = useRef<THREE.Mesh>(null);
  const radius = useMemo(() => {
    const s = footprint(obj);
    return Math.max(pack.stage.radius * 0.03, Math.max(s.x, s.z) * 0.5);
  }, [obj, pack.stage.radius]);
  useEffect(() => {
    if (shakeKey > 0) shake.current = 0;
  }, [shakeKey]);
  useFrame((_, dt) => {
    const g = groupRef.current;
    if (!g) return;
    const snap = liveRef.current.snap;
    const base = snap?.pos ?? [liveRef.current.free.x, p.pos[1], liveRef.current.free.z];
    const onTarget = snap?.spot === "target";
    const lift = onTarget ? pack.lift * 0.35 : pack.lift;
    const goal = new THREE.Vector3(base[0], base[1] + lift, base[2]);
    liveRef.current.heldPos.lerp(goal, 1 - Math.exp(-dt * 16));
    let dx = 0;
    if (shake.current >= 0) {
      shake.current += dt;
      const t = shake.current / 0.4;
      dx = Math.sin(shake.current * 42) * (1 - t) * pack.stage.radius * 0.02;
      if (t >= 1) shake.current = -1;
    }
    g.position.set(liveRef.current.heldPos.x + dx, liveRef.current.heldPos.y, liveRef.current.heldPos.z);
    // turn the short way round to the requested angle
    let d = held.rotY - rot.current;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    rot.current += d * (1 - Math.exp(-dt * 14));
    g.rotation.y = rot.current;
    // drop guide: a line down to where it would land, and a ring on the spot
    if (line.current && marker.current) {
      const h = Math.max(0.01, liveRef.current.heldPos.y - base[1]);
      line.current.scale.set(1, h, 1);
      line.current.position.set(liveRef.current.heldPos.x, base[1] + h / 2, liveRef.current.heldPos.z);
      marker.current.position.set(base[0], base[1] + 0.1, base[2]);
      const m = marker.current.material as THREE.MeshBasicMaterial;
      m.color.set(onTarget ? "#7dffb0" : snap && snap.spot !== null ? "#ffc46b" : "#5cc8ff");
    }
  });
  return (
    <>
      <group ref={groupRef}>
        <group rotation={p.tilt ?? [0, 0, 0]}>
          <primitive object={obj} />
        </group>
      </group>
      <mesh ref={line} renderOrder={3} layers={GUIDE_LAYER}>
        <cylinderGeometry args={[pack.stage.radius * 0.0018, pack.stage.radius * 0.0018, 1, 8]} />
        <meshBasicMaterial color={HOLO} transparent opacity={0.55} depthWrite={false} />
      </mesh>
      <mesh ref={marker} rotation-x={-Math.PI / 2} renderOrder={3} layers={GUIDE_LAYER}>
        <ringGeometry args={[radius * 0.82, radius * 0.9, 48]} />
        <meshBasicMaterial color={HOLO} transparent opacity={0.6} depthWrite={false} />
      </mesh>
    </>
  );
}

// Base part (motherboard) with latches that open for the slots still to fill and click shut once filled.
function Base({ pack, placed }: { pack: Pack; placed: number }) {
  const obj = useMemo(() => (pack.base ? buildPart(pack.parts[pack.base].spec, solid) : null), [pack]);
  const root = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const base = root.current;
    if (!base) return;
    pack.placements.forEach((p, i) => {
      for (const name of p.latches ?? []) {
        const node = base.getObjectByName(name);
        if (!node) continue;
        const axis = node.userData.axis as "x" | "z";
        const goal = i < placed ? 0 : (node.userData.open as number);
        const cur = node.rotation[axis];
        node.rotation[axis] = cur + (goal - cur) * (1 - Math.exp(-dt * (goal === 0 ? 22 : 8)));
      }
    });
  });
  return obj ? (
    <group ref={root}>
      <primitive object={obj} />
    </group>
  ) : null;
}

// Slot labels as small sprites (a canvas texture per label): always face the camera, no extra React roots.
function labelTexture(text: string, active: boolean) {
  const c = document.createElement("canvas");
  const scale = 4;
  const g = c.getContext("2d")!;
  g.font = `600 ${11 * scale}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  const w = Math.ceil(g.measureText(text).width) + 14 * scale;
  const h = 20 * scale;
  c.width = w;
  c.height = h;
  g.font = `600 ${11 * scale}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  g.fillStyle = active ? "#5cc8ff" : "rgba(6,10,16,0.72)";
  g.beginPath();
  g.roundRect(0, 0, w, h, 6 * scale);
  g.fill();
  g.fillStyle = active ? "#04070d" : "rgba(255,255,255,0.86)";
  g.textBaseline = "middle";
  g.textAlign = "center";
  g.fillText(text, w / 2, h / 2 + scale);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { t, aspect: w / h };
}

function Label({ text, pos, active, height }: { text: string; pos: Vec3; active: boolean; height: number }) {
  const { t, aspect } = useMemo(() => labelTexture(text, active), [text, active]);
  useEffect(() => () => t.dispose(), [t]);
  return (
    <sprite position={pos} scale={[height * aspect, height, 1]} renderOrder={10} layers={GUIDE_LAYER}>
      <spriteMaterial map={t} transparent depthTest={false} depthWrite={false} toneMapped={false} />
    </sprite>
  );
}

function Labels({ pack, current }: { pack: Pack; current?: string }) {
  if (!pack.labels?.length) return null;
  const h = pack.stage.radius * 0.024;
  return (
    <>
      {pack.labels.map((l) => (
        <Label key={l.text} text={l.text} pos={l.pos} active={l.text === current} height={l.text === current ? h * 1.25 : h} />
      ))}
    </>
  );
}

// ---------- touch and mouse ----------

function Interaction({ pack, p, held, liveRef, ghost, heldGroup, onDrop, onTapEmpty }: {
  pack: Pack;
  p: Placement | undefined;
  held: Held | null;
  liveRef: LiveRef;
  ghost: MutableRefObject<THREE.Group | null>;
  heldGroup: MutableRefObject<THREE.Group | null>;
  onDrop: Props["onDrop"];
  onTapEmpty?: () => void;
}) {
  const { gl, camera } = useThree();
  const state = useRef({ p, held, onDrop, onTapEmpty });
  useLayoutEffect(() => {
    state.current = { p, held, onDrop, onTapEmpty };
  });

  useEffect(() => {
    const el = gl.domElement;
    const ray = new THREE.Raycaster();
    ray.layers.enableAll();
    const ndc = new THREE.Vector2();
    const pointers = new Map<number, { x: number; y: number }>();
    let mode: "none" | "drag" | "orbit" | "pinch" = "none";
    let moved = false;
    let downAt = { x: 0, y: 0 };
    let last = { x: 0, y: 0 };
    let pinch = { dist: 0, angle: 0, midY: 0 };
    const dragFrom = new THREE.Vector3();
    const freeFrom = new THREE.Vector3();

    const setRay = (x: number, y: number) => {
      const r = el.getBoundingClientRect();
      ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      camera.updateMatrixWorld();
      ray.setFromCamera(ndc, camera);
    };
    const planeHit = (x: number, y: number, h: number) => {
      setRay(x, y);
      const out = new THREE.Vector3();
      return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -h), out) ? out : null;
    };
    const hits = (obj: THREE.Object3D | null) => !!obj && ray.intersectObject(obj, true).length > 0;
    const twoFinger = () => {
      const [a, b] = [...pointers.values()];
      return { dist: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x), midY: (a.y + b.y) / 2 };
    };

    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        mode = "pinch";
        pinch = twoFinger();
        return;
      }
      if (pointers.size > 2) return;
      moved = false;
      downAt = last = { x: e.clientX, y: e.clientY };
      const { p: cur, held: h } = state.current;
      if (h && cur && e.button !== 2) {
        const hit = planeHit(e.clientX, e.clientY, cur.pos[1]);
        if (hit) {
          mode = "drag";
          dragFrom.copy(hit);
          freeFrom.copy(liveRef.current.free);
          return;
        }
      }
      mode = "orbit";
    };

    const move = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) moved = true;
      const rig = liveRef.current.rig;
      if (mode === "pinch" && pointers.size === 2) {
        const now = twoFinger();
        rig.goalDistance = THREE.MathUtils.clamp(rig.goalDistance * (pinch.dist / Math.max(1, now.dist)), pack.camera.minDistance, pack.camera.maxDistance);
        rig.distance = rig.goalDistance;
        rig.azimuth -= now.angle - pinch.angle;
        rig.polar = THREE.MathUtils.clamp(rig.polar - (now.midY - pinch.midY) * 0.005, 0.2, 1.45);
        pinch = now;
        return;
      }
      if (mode === "orbit") {
        rig.azimuth -= (e.clientX - last.x) * 0.008;
        rig.polar = THREE.MathUtils.clamp(rig.polar - (e.clientY - last.y) * 0.006, 0.2, 1.45);
      }
      if (mode === "drag") {
        const cur = state.current.p;
        if (!cur) return;
        const hit = planeHit(e.clientX, e.clientY, cur.pos[1]);
        if (hit) {
          liveRef.current.free.set(freeFrom.x + hit.x - dragFrom.x, cur.pos[1], freeFrom.z + hit.z - dragFrom.z);
          liveRef.current.snap = snapHeld(cur, liveRef.current.free.x, liveRef.current.free.z);
        }
      }
      last = { x: e.clientX, y: e.clientY };
    };

    const up = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (mode === "pinch") {
        if (pointers.size === 0) mode = "none";
        return;
      }
      const { p: cur, held: h, onDrop: drop, onTapEmpty: tapEmpty } = state.current;
      if (mode === "drag" && cur && h) {
        if (!moved) {
          // a tap: on the ghost places it there; anywhere else tries the spot it's hovering over
          setRay(e.clientX, e.clientY);
          if (hits(ghost.current)) drop({ spot: "target", pos: cur.pos });
          else if (hits(heldGroup.current) && liveRef.current.snap?.spot != null) drop({ spot: liveRef.current.snap.spot, pos: liveRef.current.snap.pos });
          else if (hits(heldGroup.current)) drop({ spot: null, pos: [liveRef.current.free.x, cur.pos[1], liveRef.current.free.z] });
        } else if (liveRef.current.snap && liveRef.current.snap.spot !== null) drop({ spot: liveRef.current.snap.spot, pos: liveRef.current.snap.pos });
        else if (liveRef.current.snap && Math.hypot(liveRef.current.snap.pos[0] - cur.pos[0], liveRef.current.snap.pos[2] - cur.pos[2]) < pack.stage.radius * 0.25)
          drop({ spot: null, pos: liveRef.current.snap.pos }); // let go just short of the spot: a gentle nudge
      } else if (mode === "orbit" && !moved) tapEmpty?.();
      mode = "none";
    };

    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const rig = liveRef.current.rig;
      rig.goalDistance = THREE.MathUtils.clamp(rig.goalDistance * Math.exp(e.deltaY * 0.0012), pack.camera.minDistance, pack.camera.maxDistance);
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [gl, camera, liveRef, pack, ghost, heldGroup]);
  return null;
}

// ---------- the whole scene ----------

export default function PracticeScene({ pack, placed, held, stuck, shakeKey, successKey, successFromHeld, gyro, onDrop, onTapEmpty }: Props) {
  const p = pack.placements[placed] as Placement | undefined;
  const liveRef = useRef<Live>(null as unknown as Live);
  if (liveRef.current === null) liveRef.current = makeLive(pack);
  // Pieces of a sub-assembly disappear into it once it's picked up (or placed).
  const hidden = new Set<string>();
  pack.placements.forEach((q, i) => {
    if (q.consumes && (placed > i || (placed === i && held))) q.consumes.forEach((id) => hidden.add(id));
  });
  const ghost = useRef<THREE.Group | null>(null);
  const heldGroup = useRef<THREE.Group | null>(null);

  // A new part in hand appears beside the target, already snapped to the grid.
  useEffect(() => {
    if (!held || !p) return;
    const s = spawnOf(pack, p);
    liveRef.current.free.copy(s);
    liveRef.current.snap = snapHeld(p, s.x, s.z);
    liveRef.current.heldPos.set(s.x, s.y + pack.lift * 1.6, s.z);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when a different part is picked up
  }, [held?.partId, p?.id]);

  // Remember where the held part was, so the placed one drops in from there.
  useEffect(() => {
    if (successKey > 0) liveRef.current.lastFrom = successFromHeld ? liveRef.current.heldPos.clone() : null;
  }, [successKey, successFromHeld, liveRef]);

  return (
    <>
      <CameraRig pack={pack} liveRef={liveRef} gyro={gyro} focus={p?.focus} />
      <Lighting pack={pack} />
      <Base pack={pack} placed={placed} />
      {pack.placements.slice(0, placed).map((q, i) =>
        hidden.has(q.id) ? null : <PlacedPart key={q.id} pack={pack} p={q} liveRef={liveRef} fresh={i === placed - 1 && successKey > 0} />,
      )}
      {p && <Ghost pack={pack} p={p} stuck={stuck} groupRef={ghost} />}
      {p && held && <HeldPart key={held.partId + p.id} pack={pack} p={p} held={held} liveRef={liveRef} shakeKey={shakeKey} groupRef={heldGroup} />}
      <Labels pack={pack} current={p?.label} />
      <Interaction pack={pack} p={p} held={held} liveRef={liveRef} ghost={ghost} heldGroup={heldGroup} onDrop={onDrop} onTapEmpty={onTapEmpty} />
    </>
  );
}
