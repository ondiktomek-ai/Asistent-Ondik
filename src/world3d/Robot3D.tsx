import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import type { Group, Mesh } from 'three';

type V3 = [number, number, number];

interface Robot3DProps {
  color: string;
  spots: V3[];
  nightSpot: V3;
  night: boolean;
  busy: boolean;
  lines: string[];
  scale?: number;
}

const SPEED = 0.9; // m/s
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Robot-agent. Přes den chodí po svém pracovišti, v noci stojí u postele. */
export function Robot3D({ color, spots, nightSpot, night, busy, lines, scale = 1 }: Robot3DProps) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const legL = useRef<Mesh>(null);
  const legR = useRef<Mesh>(null);
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);
  const eyes = useRef<Group>(null);
  const st = useRef({
    pos: [...spots[Math.floor(Math.random() * spots.length)]] as V3,
    target: null as V3 | null,
    wait: rand(0.5, 3),
    heading: 0,
    walk: 0,
    nextBubble: rand(3, 14),
  });
  const [bubble, setBubble] = useState<string | null>(null);

  // Řeč: občas pronese hlášku (v noci chrápe).
  useEffect(() => {
    if (!bubble) return;
    const t = setTimeout(() => setBubble(null), 3500);
    return () => clearTimeout(t);
  }, [bubble]);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = st.current;
    const t = clock.elapsedTime;

    // cíl cesty
    if (busy) {
      s.target = null; // když přemýšlí, stojí na místě
    } else if (night) {
      s.target = nightSpot;
    } else if (!s.target) {
      s.wait -= dt;
      if (s.wait <= 0) s.target = spots[Math.floor(Math.random() * spots.length)];
    }

    let walking = false;
    if (s.target) {
      const dx = s.target[0] - s.pos[0];
      const dz = s.target[2] - s.pos[2];
      const dist = Math.hypot(dx, dz);
      if (dist < 0.03) {
        if (!night) {
          s.target = null;
          s.wait = rand(2, 7);
        }
      } else {
        const step = Math.min(dist, SPEED * dt);
        s.pos[0] += (dx / dist) * step;
        s.pos[2] += (dz / dist) * step;
        walking = true;
        const want = Math.atan2(dx, dz);
        let d = want - s.heading;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        s.heading += d * Math.min(1, dt * 10);
      }
    }
    if (!walking) {
      // v klidu se otočí čelem do středu městečka (+z boxu)
      let d = 0 - s.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      s.heading += d * Math.min(1, dt * 3);
    }
    s.walk += dt * (walking ? 9 : 0);

    // bubliny
    if (!busy) {
      s.nextBubble -= dt;
      if (s.nextBubble <= 0) {
        s.nextBubble = rand(10, 24);
        const pool = night ? ['Zzz…', 'Zzz…', '💤'] : lines;
        if (pool.length) setBubble(pool[Math.floor(Math.random() * pool.length)]);
      }
    }

    if (root.current) {
      root.current.position.set(s.pos[0], 0, s.pos[2]);
      root.current.rotation.y = s.heading;
    }
    if (body.current) body.current.position.y = walking ? Math.abs(Math.sin(s.walk)) * 0.04 : Math.sin(t * 2.5) * 0.015;
    const swing = walking ? Math.sin(s.walk) * 0.5 : 0;
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    if (armL.current) armL.current.rotation.x = busy ? -0.9 + Math.sin(t * 3) * 0.15 : -swing;
    if (armR.current) armR.current.rotation.x = swing;
    if (eyes.current) eyes.current.scale.y = night && !walking ? 0.15 : t % 4.5 < 0.12 ? 0.1 : 1;
  });

  const shownBubble = busy ? '💭 Přemýšlím…' : bubble;

  return (
    <group ref={root} scale={scale}>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.28, 20]} />
        <meshBasicMaterial color="#000" transparent opacity={0.25} />
      </mesh>
      <mesh ref={legL} position={[-0.09, 0.2, 0]} castShadow>
        <boxGeometry args={[0.1, 0.22, 0.12]} />
        <meshStandardMaterial color="#2a3040" />
      </mesh>
      <mesh ref={legR} position={[0.09, 0.2, 0]} castShadow>
        <boxGeometry args={[0.1, 0.22, 0.12]} />
        <meshStandardMaterial color="#2a3040" />
      </mesh>
      <group ref={body}>
        <RoundedBox args={[0.44, 0.38, 0.3]} radius={0.08} position={[0, 0.48, 0]} castShadow>
          <meshStandardMaterial color={color} roughness={0.45} />
        </RoundedBox>
        <mesh position={[0, 0.48, 0.152]}>
          <circleGeometry args={[0.07, 20]} />
          <meshStandardMaterial color="#ffffff" emissive={color} emissiveIntensity={0.6} />
        </mesh>
        {[
          [armL, -0.28],
          [armR, 0.28],
        ].map(([ref, x]) => (
          <group key={x as number} ref={ref as React.RefObject<Group>} position={[x as number, 0.62, 0]}>
            <mesh position={[0, -0.12, 0]} castShadow>
              <boxGeometry args={[0.08, 0.26, 0.1]} />
              <meshStandardMaterial color={color} roughness={0.45} />
            </mesh>
          </group>
        ))}
        <RoundedBox args={[0.52, 0.38, 0.4]} radius={0.11} position={[0, 0.88, 0]} castShadow>
          <meshStandardMaterial color="#e8edf5" roughness={0.35} />
        </RoundedBox>
        <RoundedBox args={[0.42, 0.2, 0.04]} radius={0.06} position={[0, 0.89, 0.19]}>
          <meshStandardMaterial color="#1b2433" roughness={0.2} />
        </RoundedBox>
        <group ref={eyes} position={[0, 0.89, 0.215]}>
          {[-0.09, 0.09].map((x) => (
            <mesh key={x} position={[x, 0, 0]}>
              <sphereGeometry args={[0.04, 12, 10]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2} />
            </mesh>
          ))}
        </group>
        <mesh position={[0, 1.13, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.14, 6]} />
          <meshStandardMaterial color="#9aa3b5" />
        </mesh>
        <mesh position={[0, 1.22, 0]}>
          <sphereGeometry args={[0.05, 12, 10]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={busy ? 3 : 1.2} />
        </mesh>
      </group>
      {shownBubble && (
        <Html position={[0, 1.55, 0]} center distanceFactor={9} zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
          <div className="bubble3d">{shownBubble}</div>
        </Html>
      )}
    </group>
  );
}
