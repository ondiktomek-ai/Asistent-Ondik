import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, RoundedBox } from '@react-three/drei';
import type { Group, Mesh } from 'three';
import { heightAt, type V2 } from './town';

/** Stav robota, který řídí simulace městečka (TownLife) a robot ho jen vykresluje. */
export interface RobotBrain {
  id: string;
  pos: V2;
  heading: number;
  walking: boolean;
  sleeping: boolean;
  bubble: string | null;
  carry: 'kafe' | 'rohlik' | 'jablko' | 'zmrzlina' | null;
}

interface RobotBodyProps {
  brain: RobotBrain;
  color: string;
  busy: boolean;
  /** Bublina, když robot pracuje (např. „Přemýšlím…“). */
  busyText?: string;
}

/** Věc v ruce robota. */
function Carried({ item }: { item: NonNullable<RobotBrain['carry']> }) {
  if (item === 'kafe')
    return (
      <group>
        <mesh>
          <cylinderGeometry args={[0.05, 0.04, 0.12, 12]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0, 0.065, 0]}>
          <cylinderGeometry args={[0.052, 0.052, 0.02, 12]} />
          <meshStandardMaterial color="#6b3f22" />
        </mesh>
      </group>
    );
  if (item === 'rohlik')
    return (
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.04, 0.12, 4, 8]} />
        <meshStandardMaterial color="#d9963f" />
      </mesh>
    );
  if (item === 'jablko')
    return (
      <mesh>
        <sphereGeometry args={[0.06, 12, 10]} />
        <meshStandardMaterial color="#d93b3b" />
      </mesh>
    );
  return (
    <group>
      <mesh position={[0, -0.04, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.04, 0.12, 10]} />
        <meshStandardMaterial color="#e3b26b" />
      </mesh>
      <mesh position={[0, 0.04, 0]}>
        <sphereGeometry args={[0.05, 12, 10]} />
        <meshStandardMaterial color="#f7a8c8" />
      </mesh>
    </group>
  );
}

/** Robot-agent. Kde je a co dělá, určuje simulace; tady se jen animuje tělo. */
export function RobotBody({ brain, color, busy, busyText = '💭 Přemýšlím…' }: RobotBodyProps) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const legL = useRef<Mesh>(null);
  const legR = useRef<Mesh>(null);
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);
  const eyes = useRef<Group>(null);
  const walkPhase = useRef(0);
  const [bubble, setBubble] = useState<string | null>(null);
  const [carry, setCarry] = useState<RobotBrain['carry']>(null);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = clock.elapsedTime;
    // bublina a nesená věc se mění zřídka – React stav jen při změně
    if (brain.bubble !== bubble) setBubble(brain.bubble);
    if (brain.carry !== carry) setCarry(brain.carry);

    if (brain.walking) walkPhase.current += dt * 9;
    if (root.current) {
      root.current.position.set(brain.pos[0], heightAt(brain.pos), brain.pos[1]);
      root.current.rotation.y = brain.heading;
    }
    if (body.current) body.current.position.y = brain.walking ? Math.abs(Math.sin(walkPhase.current)) * 0.04 : Math.sin(t * 2.5) * 0.015;
    const swing = brain.walking ? Math.sin(walkPhase.current) * 0.5 : 0;
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    if (armL.current) armL.current.rotation.x = busy ? -0.9 + Math.sin(t * 3) * 0.15 : -swing;
    // s nákupem drží pravou ruku před sebou
    if (armR.current) armR.current.rotation.x = brain.carry ? -1.1 : swing;
    if (eyes.current) eyes.current.scale.y = brain.sleeping ? 0.15 : t % 4.5 < 0.12 ? 0.1 : 1;
  });

  const shownBubble = busy ? busyText : bubble;

  return (
    <group ref={root}>
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <circleGeometry args={[0.28, 20]} />
        <meshBasicMaterial color="#000" transparent opacity={0.25} depthWrite={false} polygonOffset polygonOffsetFactor={-4} />
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
        <group ref={armL} position={[-0.28, 0.62, 0]}>
          <mesh position={[0, -0.12, 0]} castShadow>
            <boxGeometry args={[0.08, 0.26, 0.1]} />
            <meshStandardMaterial color={color} roughness={0.45} />
          </mesh>
        </group>
        <group ref={armR} position={[0.28, 0.62, 0]}>
          <mesh position={[0, -0.12, 0]} castShadow>
            <boxGeometry args={[0.08, 0.26, 0.1]} />
            <meshStandardMaterial color={color} roughness={0.45} />
          </mesh>
          {carry && (
            <group position={[0, -0.3, 0.02]}>
              <Carried item={carry} />
            </group>
          )}
        </group>
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
