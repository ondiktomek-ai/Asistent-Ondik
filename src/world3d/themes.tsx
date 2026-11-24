import type { ReactNode } from 'react';
import type { ThemeId } from '../world/types';
import {
  Armchair,
  BarChartBoard,
  Bookshelf,
  Cabinet,
  CalendarBoard,
  Coins,
  Desk,
  FloorLamp,
  Globe,
  MailBag,
  Pigeonholes,
  Plant,
  RoundTable,
  Rug,
  Safe,
  ServerRack,
  WallClock,
  Workbench,
  TvWall,
  LedTicker,
  Microphone,
  Newspapers,
  WeatherStation,
} from './props';

type V3 = [number, number, number];

export interface InteriorCtx {
  accent: string;
  time: Date;
  night: boolean;
}

export interface Interior {
  floor: string;
  render: (c: InteriorCtx) => ReactNode;
  /** Věci pověšené na zadní zdi – schovají se, když zeď kvůli výhledu klesne. */
  wall?: (c: InteriorCtx) => ReactNode;
  /** Místa, kam robot během dne chodí (lokální souřadnice boxu, y = 0). */
  spots: V3[];
}

/**
 * Vnitřek boxů. Levá zadní část (x < -1.6) je „byt“ – postel a noční stolek,
 * pravá část je pracoviště podle zaměření agenta.
 */
/**
 * Hloubka pro věci na zadní zdi. Vnitřní líc zdi je na z = -2.35;
 * věci musí být zřetelně před ním, jinak se se zdí „přetahují“ a blikají.
 */
const WALL_Z = -2.3;

export const INTERIORS: Record<Exclude<ThemeId, 'townhall'>, Interior> = {
  newsroom: {
    floor: '#4a2f36',
    wall: ({ accent }) => (
      <>
        <TvWall p={[0.9, 1.45, WALL_Z]} colors={['#4f8ef7', accent, '#f5b83d', '#22c3c9', '#34c47c', '#a874f7']} />
        <LedTicker p={[0, 2.16, WALL_Z]} color={accent} />
      </>
    ),
    render: ({ accent }) => (
      <>
        <Rug p={[0.9, 0, -0.3]} w={2.4} d={1.8} color={accent} />
        <Desk p={[0.9, 0, -0.6]} w={1.8} monitors={2} screen="#ffb3b8" />
        <Microphone p={[0.25, 0.77, -0.45]} />
        <Newspapers p={[1.6, 0.77, -0.55]} r={0.3} />
        <Newspapers p={[2.6, 0, 0.3]} r={-0.4} />
        <WeatherStation p={[2.45, 0, 1.75]} />
      </>
    ),
    spots: [
      [0.9, 0, 0.25],
      [2.0, 0, -1.7],
      [2.0, 0, 1.2],
      [-1.0, 0, 0.5],
      [0.2, 0, 1.8],
    ],
  },
  mail: {
    floor: '#3b4f78',
    render: ({ accent }) => (
      <>
        <Rug p={[0.9, 0, -0.2]} w={2.2} d={1.8} color={accent} />
        <Pigeonholes p={[1.2, 0, -2.2]} />
        <Desk p={[0.9, 0, -0.4]} screen="#9cc2ff" />
        <MailBag p={[2.4, 0, 0.9]} />
        <Plant p={[2.65, 0, -1.4]} s={0.9} />
      </>
    ),
    spots: [
      [1.2, 0, -1.6],
      [0.9, 0, 0.9],
      [2.0, 0, 1.0],
      [-1.0, 0, 0.5],
      [0.2, 0, 1.8],
    ],
  },
  calendar: {
    floor: '#6b4a32',
    wall: ({ accent, time }) => (
      <>
        <CalendarBoard p={[0.6, 1.45, WALL_Z]} accent={accent} />
        <WallClock p={[2.2, 1.6, WALL_Z]} time={time} />
      </>
    ),
    render: ({ accent }) => (
      <>
        <Desk p={[2.0, 0, -1.6]} w={1.3} screen="#ffd0a8" />
        <Rug p={[0.5, 0, 0.9]} w={2.2} d={2.0} color={accent} />
        <RoundTable p={[0.5, 0, 0.9]} />
        <Plant p={[2.65, 0, 1.9]} />
      </>
    ),
    spots: [
      [2.0, 0, -0.6],
      [0.6, 0, -1.6],
      [1.9, 0, 1.4],
      [-1.0, 0, 0.3],
      [-0.4, 0, 1.9],
    ],
  },
  research: {
    floor: '#4a3a6b',
    render: ({ accent, night }) => (
      <>
        <Bookshelf p={[1.3, 0, -2.2]} w={2.8} h={1.9} seed={11} />
        <Rug p={[2.0, 0, 1.0]} w={1.8} d={1.6} color={accent} />
        <Armchair p={[2.2, 0, 1.0]} r={-Math.PI / 2 - 0.4} color={accent} />
        <FloorLamp p={[2.7, 0, 1.9]} on={night} />
        <Desk p={[0.3, 0, -0.5]} w={1.3} screen="#d7c2ff" />
        <Globe p={[0.75, 0.77, -0.65]} />
      </>
    ),
    spots: [
      [1.3, 0, -1.5],
      [0.3, 0, 0.4],
      [1.5, 0, 1.2],
      [-1.0, 0, 0.5],
      [2.4, 0, -0.6],
    ],
  },
  finance: {
    floor: '#2f5a4c',
    wall: ({ accent }) => <BarChartBoard p={[0.3, 1.5, WALL_Z]} color={accent} />,
    render: ({ accent }) => (
      <>
        <Cabinet p={[1.45, 0, -2.15]} />
        <Cabinet p={[1.98, 0, -2.15]} />
        <Safe p={[2.55, 0, -1.95]} r={-0.3} />
        <Rug p={[0.8, 0, 0.0]} w={2.4} d={1.8} color={accent} />
        <Desk p={[0.8, 0, -0.4]} w={1.7} monitors={2} screen="#a5f3c8" />
        <Coins p={[1.45, 0.77, -0.45]} />
        <Plant p={[2.65, 0, 1.9]} />
      </>
    ),
    spots: [
      [0.8, 0, 0.6],
      [1.7, 0, -1.4],
      [2.3, 0, -0.9],
      [2.0, 0, 1.3],
      [-1.0, 0, 0.5],
    ],
  },
  workshop: {
    floor: '#2a4a52',
    render: () => (
      <>
        <Workbench p={[0.1, 0, -2.05]} />
        {[1.45, 2.05, 2.65].map((x, i) => (
          <ServerRack key={x} p={[x, 0, -2.1]} seed={i + 2} />
        ))}
        <Desk p={[1.3, 0, 0.3]} w={1.6} monitors={2} screen="#7ff5ef" />
        <Cabinet p={[2.7, 0, 1.9]} h={0.66} />
      </>
    ),
    spots: [
      [0.1, 0, -1.3],
      [2.0, 0, -1.3],
      [1.3, 0, 1.3],
      [-1.0, 0, 0.3],
      [2.5, 0, 0.6],
    ],
  },
};

/** Kde robot v noci stojí – u postele. */
export const NIGHT_SPOT: V3 = [-1.35, 0, -0.7];
