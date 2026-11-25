import { useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { DoubleSide, type Group, type Mesh, type PointLight } from 'three';
import { TOWN_HALL_ID, TOWN_HALL_RADIUS } from '../world/layout';
import { B, C, Chair, Desk, Plant, S } from './props';
import { useSceneReady } from './useSceneReady';

const STONE = '#e9e4d8';
const GOLD = '#f5b83d';
const JARVIS = '#4fd8ff';

/** Radnice uprostřed – sídlo CEO. Uvnitř čeká podstavec pro budoucího Jarvise. */
/** Štítek radnice nad kupolí. */
export function TownHallLabel({ selected, onSelect }: { selected: boolean; onSelect: (id: string) => void }) {
  const ready = useSceneReady();
  if (!ready) return null;
  return (
    <Html position={[0, 8.4, 0]} center zIndexRange={[10, 0]}>
      <button className={`box-label townhall-label${selected ? ' active' : ''}`} style={{ ['--accent' as string]: GOLD }} onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(TOWN_HALL_ID);
        }}
      >
        <span className="box-label-icon">🏛️</span>
        <span>
          <strong>Radnice</strong>
          <small>CEO Ondřej Tomek · Ondik</small>
        </span>
      </button>
    </Html>
  );
}

/** Kam Ondik na radnici chodí: k CEO stolu, k podstavci Jarvise a mezi sloupy. */
export const ONDIK_SPOTS: [number, number, number][] = [
  [0.9, 0, 0.1],
  [-0.9, 0, 0.1],
  [0.7, 0, 1.6],
  [-1.7, 0, 1.2],
  [1.8, 0, -0.4],
];

export function TownHall({ selected, darkness, onSelect, jarvis = false }: { selected: boolean; darkness: number; onSelect: (id: string) => void; jarvis?: boolean }) {
  const [hover, setHover] = useState(false);
  const holo = useRef<Mesh>(null);
  const ring = useRef<Group>(null);
  const light = useRef<PointLight>(null);
  const boost = useRef(0);

  useFrame(({ clock }, dt) => {
    // když Jarvis mluví, holo se zrychlí, zvětší a pulzuje
    boost.current += ((jarvis ? 1 : 0) - boost.current) * Math.min(1, dt * 3);
    const b = boost.current;
    const t = clock.elapsedTime;
    if (holo.current) {
      holo.current.rotation.y += dt * (0.6 + b * 2.4);
      holo.current.rotation.x += dt * (0.25 + b * 0.8);
      holo.current.position.y = 1.75 + Math.sin(t * 1.5) * 0.08 + b * 0.15;
      holo.current.scale.setScalar(1 + b * (0.35 + 0.12 * Math.sin(t * 9)));
    }
    if (ring.current) ring.current.rotation.y -= dt * (0.8 + b * 3);
    if (light.current) light.current.intensity = 1.5 + darkness * 3 + b * (4 + 2 * Math.sin(t * 9));
  });

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(TOWN_HALL_ID);
  };

  const columns = 10;
  const colR = 3.15;
  const floorY = 0.45;
  const colH = 3.0;

  return (
    <group
      onClick={click}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = '';
      }}
    >
      {/* schody */}
      <C p={[0, 0.08, 0]} r={TOWN_HALL_RADIUS} h={0.16} c="#cfc8b8" seg={48} />
      <C p={[0, 0.23, 0]} r={TOWN_HALL_RADIUS - 0.35} h={0.15} c="#ddd6c6" seg={48} />
      <C p={[0, 0.375, 0]} r={TOWN_HALL_RADIUS - 0.7} h={0.15} c={STONE} seg={48} />
      {/* zlatý kruh na podlaze */}
      <mesh position={[0, floorY + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.55, 2.7, 48]} />
        <meshStandardMaterial color={GOLD} emissive={GOLD} emissiveIntensity={selected ? 1.2 : hover ? 0.7 : 0.25} />
      </mesh>

      {/* sloupy */}
      {Array.from({ length: columns }, (_, i) => {
        const a = (i / columns) * Math.PI * 2;
        const x = Math.sin(a) * colR;
        const z = Math.cos(a) * colR;
        return (
          <group key={i} position={[x, floorY, z]}>
            <C p={[0, 0.08, 0]} r={0.26} h={0.16} c={STONE} seg={12} />
            <C p={[0, colH / 2, 0]} r={[0.16, 0.19]} h={colH} c="#f6f2e9" seg={14} />
            <B p={[0, colH - 0.05, 0]} s={[0.46, 0.12, 0.46]} c={STONE} />
          </group>
        );
      })}
      {/* obvodový věnec a kupole */}
      <mesh position={[0, floorY + colH + 0.08, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[colR, 0.13, 10, 56]} />
        <meshStandardMaterial color={STONE} roughness={0.7} />
      </mesh>
      <mesh position={[0, floorY + colH + 0.15, 0]}>
        <sphereGeometry args={[colR + 0.1, 40, 18, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#bfe6ff" transparent opacity={0.22} side={DoubleSide} depthWrite={false} roughness={0.1} metalness={0.3} />
      </mesh>
      <C p={[0, floorY + colH + colR + 0.35, 0]} r={[0.05, 0.12]} h={0.6} c={GOLD} seg={10} />
      <S p={[0, floorY + colH + colR + 0.72, 0]} r={0.16} c={GOLD} e={GOLD} ei={0.5 + darkness} />

      {/* kancelář CEO – stůl čelem ke vchodu */}
      <group position={[0, floorY, 0]}>
        <B p={[0, 0.02, -1.2]} s={[3.2, 0.04, 1.6]} c="#7a2f3a" />
        <Desk p={[0, 0, -1.0]} r={Math.PI} w={1.9} monitors={2} screen="#ffe39a" chair={false} />
        <Chair p={[0, 0, -1.65]} r={Math.PI} c="#7a2f3a" />
        <Plant p={[-1.8, 0, -1.8]} />
        <Plant p={[1.8, 0, -1.8]} />


        {/* podstavec pro Jarvise */}
        <C p={[0, 0.15, 1.1]} r={[0.5, 0.6]} h={0.3} c="#1b2130" seg={32} />
        <group position={[0, 0, 1.1]}>
          <group ref={ring} position={[0, 0.34, 0]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.42, 0.025, 8, 48]} />
              <meshStandardMaterial color={JARVIS} emissive={JARVIS} emissiveIntensity={2} />
            </mesh>
          </group>
          <mesh position={[0, 0.9, 0]}>
            <cylinderGeometry args={[0.38, 0.45, 1.1, 32, 1, true]} />
            <meshBasicMaterial color={JARVIS} transparent opacity={0.08} side={DoubleSide} depthWrite={false} />
          </mesh>
          <mesh ref={holo} position={[0, 1.75, 0]}>
            <icosahedronGeometry args={[0.42, 1]} />
            <meshStandardMaterial color={JARVIS} emissive={JARVIS} emissiveIntensity={1.6} wireframe transparent opacity={0.85} />
          </mesh>
          <pointLight ref={light} position={[0, 1.4, 0]} color={JARVIS} intensity={1.5 + darkness * 3} distance={5} />
        </group>
      </group>

    </group>
  );
}
