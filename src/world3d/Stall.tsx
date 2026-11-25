import { Html } from '@react-three/drei';
import type { StallDef } from './town';
import { B, C, S } from './props';
import { useSceneReady } from './useSceneReady';

/** Zboží na pultu podle druhu stánku. */
function Goods({ item }: { item: StallDef['item'] }) {
  if (item === 'kafe')
    return (
      <>
        <B p={[-0.45, 1.08, 0.05]} s={[0.36, 0.3, 0.3]} c="#2c3140" />
        <B p={[-0.45, 1.12, 0.21]} s={[0.12, 0.08, 0.02]} c="#3dff8c" e="#3dff8c" ei={1.5} />
        {[0, 1, 2].map((i) => (
          <C key={i} p={[0.05 + i * 0.16, 0.99, 0.12]} r={[0.05, 0.04]} h={0.12} c="#ffffff" />
        ))}
      </>
    );
  if (item === 'rohlik')
    return (
      <>
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh key={i} position={[-0.5 + i * 0.22, 0.99, 0.1 - (i % 2) * 0.12]} rotation={[0, 0.4 * i, Math.PI / 2]} castShadow>
            <capsuleGeometry args={[0.05, 0.14, 4, 8]} />
            <meshStandardMaterial color="#d9963f" />
          </mesh>
        ))}
        <B p={[0.45, 0.97, -0.05]} s={[0.3, 0.06, 0.25]} c="#b98a5a" />
      </>
    );
  if (item === 'jablko')
    return (
      <>
        <B p={[-0.3, 0.97, 0.05]} s={[0.5, 0.08, 0.35]} c="#8a6440" />
        <B p={[0.35, 0.97, 0.05]} s={[0.5, 0.08, 0.35]} c="#8a6440" />
        {Array.from({ length: 10 }, (_, i) => (
          <S key={i} p={[-0.48 + (i % 5) * 0.09 + (i > 4 ? 0.65 : 0), 1.06, -0.04 + Math.floor((i % 10) / 5) * 0.0 + (i % 2) * 0.12]} r={0.055} c={i > 4 ? '#f5c84d' : '#d93b3b'} />
        ))}
      </>
    );
  return (
    <>
      <B p={[0, 0.98, 0.05]} s={[1.1, 0.1, 0.4]} c="#dfe4ee" />
      {['#f7a8c8', '#fff3c4', '#8b5a3c', '#a8e6cf'].map((col, i) => (
        <S key={col} p={[-0.38 + i * 0.25, 1.06, 0.05]} r={0.09} c={col} />
      ))}
    </>
  );
}

/** Stánek na náměstí, kam si roboti chodí nakoupit. Pult míří do středu městečka. */
export function Stall({ stall }: { stall: StallDef }) {
  const ready = useSceneReady();
  // natočit čelem ke středu (k okružní cestě)
  const rot = stall.angle + Math.PI;
  const stripes = 7;
  return (
    <group position={[stall.pos[0], 0, stall.pos[1]]} rotation={[0, rot, 0]}>
      {/* pult */}
      <B p={[0, 0.45, 0]} s={[1.6, 0.9, 0.7]} c="#c99a68" />
      <B p={[0, 0.92, 0]} s={[1.7, 0.06, 0.8]} c="#8a6440" />
      <B p={[0, 0.45, 0.352]} s={[1.5, 0.6, 0.01]} c={stall.awning} />
      {/* sloupky */}
      {[-0.78, 0.78].map((x) => (
        <B key={x} p={[x, 1.25, -0.3]} s={[0.07, 2.5, 0.07]} c="#6b4a2f" />
      ))}
      {/* pruhovaná markýza */}
      <group position={[0, 2.35, 0.05]} rotation={[0.35, 0, 0]}>
        {Array.from({ length: stripes }, (_, i) => (
          <B key={i} p={[-0.85 + (i + 0.5) * (1.7 / stripes), 0, 0]} s={[1.7 / stripes, 0.05, 1.0]} c={i % 2 ? '#ffffff' : stall.awning} />
        ))}
      </group>
      <Goods item={stall.item} />
      {ready && (
        <Html position={[0, 2.95, 0]} center distanceFactor={14} zIndexRange={[9, 0]} style={{ pointerEvents: 'none' }}>
          <div className="stall-sign">
            {stall.icon} {stall.name}
          </div>
        </Html>
      )}
    </group>
  );
}
