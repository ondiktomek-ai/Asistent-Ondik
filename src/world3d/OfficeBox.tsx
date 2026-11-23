import { memo, useRef, useState } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Color, Vector3, type Group } from 'three';
import type { AgentDef } from '../world/types';
import { BOX, placementId, type BoxPlacement } from '../world/layout';
import { B, Bed, MovingBoxes, Nightstand, Plant } from './props';
import { INTERIORS, NIGHT_SPOT } from './themes';
import { Robot3D } from './Robot3D';
import { useSceneReady } from './useSceneReady';

export function tint(hex: string, toWhite: number) {
  return '#' + new Color(hex).lerp(new Color('#ffffff'), toWhite).getHexString();
}

interface OfficeBoxProps {
  placement: BoxPlacement;
  agent: AgentDef | null;
  selected: boolean;
  night: boolean;
  darkness: number;
  time: Date;
  busy: boolean;
  onSelect: (id: string) => void;
}

/** Jeden kancelářský box: otevřený „domeček pro panenky“ – byt + pracoviště agenta. */
export const OfficeBox = memo(function OfficeBox({ placement, agent, selected, night, darkness, time, busy, onSelect }: OfficeBoxProps) {
  const [hover, setHover] = useState(false);
  const ready = useSceneReady();
  const accent = agent?.color ?? '#8f9bb5';
  const wall = tint(accent, 0.62);
  const interior = agent && agent.theme !== 'townhall' ? INTERIORS[agent.theme] : null;
  const { w, d, h } = BOX;
  const id = placementId(placement);

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(id);
  };
  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHover(true);
    document.body.style.cursor = 'pointer';
  };
  const out = () => {
    setHover(false);
    document.body.style.cursor = '';
  };

  const glow = selected ? 2.2 : hover ? 1.2 : 0.35;

  // Zeď mezi kamerou a boxem se sníží, aby byl vidět dovnitř (jako v The Sims).
  const root = useRef<Group>(null);
  const backWall = useRef<Group>(null);
  const leftWall = useRef<Group>(null);
  const rightWall = useRef<Group>(null);
  const [cam] = useState(() => new Vector3());
  const lowered = useRef({ back: false, left: false, right: false });
  useFrame(({ camera }, dt) => {
    if (!root.current) return;
    root.current.worldToLocal(cam.copy(camera.position));
    const k = Math.min(1, dt * 4);
    // hystereze: zeď se sníží až kus za hranou a zvedne až kus před ní, aby necukala
    const M = 0.6;
    const low = lowered.current;
    low.back = low.back ? cam.z < -d / 2 + M : cam.z < -d / 2 - M;
    low.left = low.left ? cam.x < -w / 2 + M : cam.x < -w / 2 - M;
    low.right = low.right ? cam.x > w / 2 - M : cam.x > w / 2 + M;
    const set = (g: Group | null, isLow: boolean) => {
      if (g) g.scale.y += ((isLow ? 0.12 : 1) - g.scale.y) * k;
    };
    set(backWall.current, low.back);
    set(leftWall.current, low.left);
    set(rightWall.current, low.right);
  });

  return (
    <group ref={root} position={placement.position} rotation={[0, placement.rotationY, 0]} onClick={click} onPointerOver={over} onPointerOut={out}>
      {/* podlaha a základ */}
      <B p={[0, -0.13, 0]} s={[w + 0.3, 0.3, d + 0.3]} c="#3a3f4f" />
      <B p={[0, 0.02, 0]} s={[w, 0.04, d]} c={interior?.floor ?? '#5a5f70'} />
      {/* svítící práh – barva agenta */}
      <B p={[0, 0.05, d / 2 + 0.05]} s={[w + 0.3, 0.06, 0.12]} c={accent} e={accent} ei={glow} />

      {/* zdi: zadní a boční, předek je otevřený do středu */}
      <group ref={backWall}>
        <B p={[0, h / 2, -d / 2 + 0.075]} s={[w, h, 0.15]} c={wall} />
        <B p={[0, h + 0.04, -d / 2 + 0.075]} s={[w + 0.04, 0.08, 0.19]} c={accent} e={accent} ei={glow * 0.5} />
      </group>
      {([
        [leftWall, -1],
        [rightWall, 1],
      ] as const).map(([ref, sx]) => (
        <group key={sx} ref={ref}>
          <B p={[sx * (w / 2 - 0.075), h / 2, 0]} s={[0.15, h, d]} c={wall} />
          <B p={[sx * (w / 2 - 0.075), h + 0.04, 0]} s={[0.19, 0.08, d]} c={accent} e={accent} ei={glow * 0.5} />
          {/* okno */}
          <B p={[sx * (w / 2 - 0.075), 1.35, 0.7]} s={[0.21, 0.8, 1.3]} c={night ? '#ffd77a' : '#a8dcff'} e={night ? '#ffc65a' : '#000'} ei={night ? 1.1 : 0} />
        </group>
      ))}

      {agent && interior ? (
        <>
          {/* bydlení */}
          <Bed p={[-2.2, 0, -1.4]} color={accent} />
          <Nightstand p={[-1.35, 0, -2.15]} lampOn={night} />
          <Plant p={[-2.55, 0, 1.9]} s={0.9} />
          {/* pracoviště */}
          {interior.render({ accent, time, night })}
          <Robot3D color={agent.color} spots={interior.spots} nightSpot={NIGHT_SPOT} night={night && !busy} busy={busy} lines={agent.idleLines} />
        </>
      ) : (
        <>
          <MovingBoxes p={[-1.8, 0, -1.7]} />
          <mesh position={[0.6, 1.2, 0]} rotation={[0, 0, 0]}>
            <torusGeometry args={[0.55, 0.05, 10, 40]} />
            <meshStandardMaterial color="#8f9bb5" emissive="#8f9bb5" emissiveIntensity={hover ? 1.2 : 0.4} />
          </mesh>
          <B p={[0.6, 1.2, 0]} s={[0.6, 0.1, 0.06]} c="#8f9bb5" e="#8f9bb5" ei={hover ? 1.2 : 0.4} />
          <B p={[0.6, 1.2, 0]} s={[0.1, 0.6, 0.06]} c="#8f9bb5" e="#8f9bb5" ei={hover ? 1.2 : 0.4} />
        </>
      )}

      {darkness > 0.05 && <pointLight position={[0, h - 0.2, 0.3]} intensity={darkness * 6} distance={7} decay={1.6} color="#ffdca0" />}

      {ready && (
      <Html position={[0, h + 0.9, -d / 2]} center zIndexRange={[10, 0]}>
        <button className={`box-label${selected ? ' active' : ''}`} style={{ ['--accent' as string]: accent }} onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(id);
          }}
        >
          <span className="box-label-icon">{agent ? agent.icon : '＋'}</span>
          <span>
            <strong>{agent ? agent.name : 'Volný box'}</strong>
            <small>{agent ? agent.roomName : 'pro nového agenta'}</small>
          </span>
        </button>
      </Html>
      )}
    </group>
  );
});
