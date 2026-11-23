import { useState } from 'react';
import { useFrame } from '@react-three/fiber';

/**
 * true až po prvních snímcích scény. HTML štítky (drei <Html>) připojené dřív, než se Canvas
 * napojí na události, se znovu zakládají a přijdou o obsah – proto je vykreslujeme až pak.
 */
export function useSceneReady(frames = 2): boolean {
  const [ready, setReady] = useState(false);
  const [count] = useState({ n: 0 });
  useFrame(() => {
    if (ready) return;
    if (++count.n >= frames) setReady(true);
  });
  return ready;
}
