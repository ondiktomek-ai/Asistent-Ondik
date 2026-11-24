import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { Color, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { AGENT_BY_ID } from '../world/agents';
import { PLACEMENTS, RING_RADIUS, TOWN_HALL_ID, TOWN_HALL_RADIUS, placementId } from '../world/layout';
import { darknessFor, type LightMode } from '../hooks/useClock';
import { OfficeBox } from './OfficeBox';
import { TownHall, TownHallLabel } from './TownHall';
import { B, C, S } from './props';

interface World3DProps {
  time: Date;
  lightMode: LightMode;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  busy: Set<string>;
  /** Vlastní text bubliny pracujícího robota (agentId → text). */
  busyLabels?: Record<string, string>;
}

/** Výchozí pohled na celé městečko; na úzké (telefonní) obrazovce víc z dálky. */
function overview(aspect: number) {
  return aspect < 0.85 ? { height: 44, dist: 40 } : { height: 19, dist: 24 };
}

export function World3D({ time, lightMode, selectedId, onSelect, busy, busyLabels = {} }: World3DProps) {
  const darkness = darknessFor(time, lightMode);
  const night = darkness > 0.5;
  const [initial] = useState(() => overview(window.innerWidth / Math.max(1, window.innerHeight - 120)));
  return (
    <Canvas
      className="world3d"
      shadows
      dpr={[1, 2]}
      gl={{ logarithmicDepthBuffer: true, antialias: true }}
      camera={{ position: [0, initial.height, initial.dist], fov: 45, near: 0.8, far: 260 }}
      onPointerMissed={() => onSelect(null)}
    >
      <Scene time={time} darkness={darkness} night={night} selectedId={selectedId} onSelect={onSelect} busy={busy} busyLabels={busyLabels} />
    </Canvas>
  );
}

function Scene({
  time,
  darkness,
  night,
  selectedId,
  onSelect,
  busy,
  busyLabels = {},
}: {
  time: Date;
  darkness: number;
  night: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  busy: Set<string>;
  /** Vlastní text bubliny pracujícího robota (agentId → text). */
  busyLabels?: Record<string, string>;
}) {
  const sky = useMemo(() => new Color('#a9dcff').lerp(new Color('#0b1330'), darkness), [darkness]);
  const select = onSelect as (id: string) => void;

  return (
    <>
      <color attach="background" args={[sky]} />
      <fog attach="fog" args={[sky, 45, 95]} />
      {darkness > 0.3 && <Stars radius={90} depth={30} count={1500} factor={3} fade speed={0.5} />}

      <hemisphereLight args={['#ffffff', '#5f7a52', 0.9 * (1 - 0.7 * darkness)]} />
      <directionalLight
        position={[16, 26, 12]}
        intensity={2.4 * (1 - 0.85 * darkness)}
        color={darkness > 0.5 ? '#9db4ff' : '#fff6e5'}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-bias={-0.0002}
        shadow-normalBias={0.04}
      />
      <ambientLight intensity={0.15 + darkness * 0.1} color="#b8c6ff" />

      <Ground night={night} />

      <TownHall selected={selectedId === TOWN_HALL_ID} darkness={darkness} onSelect={select} busy={busy.has(TOWN_HALL_ID)} />
      <TownHallLabel selected={selectedId === TOWN_HALL_ID} onSelect={select} />

      {PLACEMENTS.map((pl) => {
        const agent = pl.agentId ? AGENT_BY_ID[pl.agentId] : null;
        return (
          <OfficeBox
            key={pl.key}
            placement={pl}
            agent={agent}
            selected={selectedId === placementId(pl)}
            night={night}
            darkness={darkness}
            time={time}
            busy={agent ? busy.has(agent.id) : false}
            busyText={agent ? busyLabels[agent.id] : undefined}
            onSelect={select}
          />
        );
      })}

      {PLACEMENTS.map((pl) => {
        const a = pl.angle + Math.PI / PLACEMENTS.length;
        return <LampPost key={pl.key} p={[Math.sin(a) * (RING_RADIUS - 1.2), 0, Math.cos(a) * (RING_RADIUS - 1.2)]} on={darkness > 0.25} />;
      })}

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={5}
        maxDistance={55}
        maxPolarAngle={1.38}
        autoRotate={!selectedId}
        autoRotateSpeed={0.35}
      />
      <CameraRig selectedId={selectedId} />
    </>
  );
}

function Ground({ night }: { night: boolean }) {
  const trees = useMemo(() => {
    let s = 7;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: 34 }, () => {
      const a = rnd() * Math.PI * 2;
      const r = 19 + rnd() * 9;
      return { x: Math.sin(a) * r, z: Math.cos(a) * r, h: 1.6 + rnd() * 1.6, kind: rnd() > 0.5 };
    });
  }, []);
  const plazaR = RING_RADIUS + 4.3;
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]} receiveShadow>
        <circleGeometry args={[140, 64]} />
        <meshStandardMaterial color={night ? '#27452f' : '#6fae62'} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[plazaR, 72]} />
        <meshStandardMaterial color="#d6cfbf" roughness={0.95} />
      </mesh>
      {/* vnitřní okruh a paprskovité cesty k boxům */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} receiveShadow>
        <ringGeometry args={[TOWN_HALL_RADIUS + 0.3, TOWN_HALL_RADIUS + 1.3, 64]} />
        <meshStandardMaterial color="#bfb6a3" roughness={0.95} />
      </mesh>
      {PLACEMENTS.map((pl) => {
        const len = RING_RADIUS - 2.6 - TOWN_HALL_RADIUS;
        const mid = TOWN_HALL_RADIUS + len / 2;
        return (
          <mesh key={pl.key} position={[Math.sin(pl.angle) * mid, 0.06, Math.cos(pl.angle) * mid]} rotation={[-Math.PI / 2, 0, pl.angle]} receiveShadow>
            <planeGeometry args={[1.6, len]} />
            <meshStandardMaterial color="#bfb6a3" roughness={0.95} />
          </mesh>
        );
      })}
      {/* záhony mezi cestami */}
      {PLACEMENTS.map((pl) => {
        const a = pl.angle + Math.PI / PLACEMENTS.length;
        const r = (TOWN_HALL_RADIUS + RING_RADIUS) / 2 + 0.3;
        return (
          <group key={`bed-${pl.key}`} position={[Math.sin(a) * r, 0, Math.cos(a) * r]}>
            <C p={[0, 0.12, 0]} r={1.1} h={0.24} c="#9a8f7a" seg={24} />
            <C p={[0, 0.2, 0]} r={1.0} h={0.1} c="#4f8f45" seg={24} />
            {[0, 1, 2, 3, 4].map((k) => {
              const b = (k / 5) * Math.PI * 2;
              return <S key={k} p={[Math.sin(b) * 0.55, 0.32, Math.cos(b) * 0.55]} r={0.12} c={['#f2617a', '#f5b83d', '#ffffff', '#a874f7', '#ff8a3d'][k]} />;
            })}
          </group>
        );
      })}
      {trees.map((t, i) =>
        t.kind ? (
          <group key={i} position={[t.x, 0, t.z]}>
            <C p={[0, t.h * 0.2, 0]} r={0.15} h={t.h * 0.4} c="#7a5638" seg={8} />
            <mesh position={[0, t.h * 0.7, 0]} castShadow>
              <coneGeometry args={[t.h * 0.35, t.h, 10]} />
              <meshStandardMaterial color="#2f7a48" roughness={0.9} />
            </mesh>
          </group>
        ) : (
          <group key={i} position={[t.x, 0, t.z]}>
            <C p={[0, t.h * 0.25, 0]} r={0.14} h={t.h * 0.5} c="#7a5638" seg={8} />
            <S p={[0, t.h * 0.7, 0]} r={t.h * 0.33} c="#4aa366" />
          </group>
        ),
      )}
    </>
  );
}

function LampPost({ p, on }: { p: [number, number, number]; on: boolean }) {
  return (
    <group position={p}>
      <C p={[0, 0.06, 0]} r={0.18} h={0.12} c="#2c3140" seg={10} />
      <C p={[0, 1.3, 0]} r={0.05} h={2.6} c="#2c3140" seg={8} />
      <S p={[0, 2.7, 0]} r={0.2} c="#fff4c9" e="#ffd77a" ei={on ? 2.2 : 0.1} />
      <B p={[0, 2.92, 0]} s={[0.3, 0.06, 0.3]} c="#2c3140" />
    </group>
  );
}

/** Při výběru boxu (nebo radnice) plynule přeletí kamerou k němu; při zrušení výběru se vrátí do přehledu. */
function CameraRig({ selectedId }: { selectedId: string | null }) {
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const anim = useRef(0);
  const goal = useRef<{ target: Vector3; cam: Vector3 } | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (!controls) return;
    if (first.current) {
      first.current = false;
      if (!selectedId) return;
    }
    if (selectedId === TOWN_HALL_ID) {
      const dir = new Vector3(camera.position.x, 0, camera.position.z).normalize();
      goal.current = { target: new Vector3(0, 1.4, 0), cam: dir.multiplyScalar(10.5).add(new Vector3(0, 4.2, 0)) };
    } else if (selectedId) {
      const pl = PLACEMENTS.find((p) => placementId(p) === selectedId);
      if (!pl) return;
      const box = new Vector3(...pl.position);
      const inward = box.clone().normalize().multiplyScalar(-1);
      goal.current = { target: box.clone().add(new Vector3(0, 0.9, 0)), cam: box.clone().add(inward.multiplyScalar(7.5)).add(new Vector3(0, 5.5, 0)) };
    } else {
      const dir = new Vector3(camera.position.x - controls.target.x, 0, camera.position.z - controls.target.z);
      if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
      const ov = overview(size.width / size.height);
      dir.normalize().multiplyScalar(ov.dist);
      goal.current = { target: new Vector3(0, 0, 0), cam: dir.add(new Vector3(0, ov.height, 0)) };
    }
    anim.current = 1.6;
    const stop = () => (anim.current = 0);
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [selectedId, controls, camera]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dt) => {
    if (anim.current <= 0 || !controls || !goal.current) return;
    anim.current -= dt;
    const k = 1 - Math.exp(-dt * 3.5);
    controls.target.lerp(goal.current.target, k);
    camera.position.lerp(goal.current.cam, k);
    controls.update();
  });
  return null;
}
