import type { ReactNode } from 'react';
import type { Point, ThemeId } from '../world/types';
import {
  Armchair,
  BarChart,
  Bookshelf,
  Cabinet,
  Coins,
  Conveyor,
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
  SmallTable,
  WallCalendar,
  WallClock,
  Workbench,
} from './Furniture';

export interface ThemeCtx {
  id: string;
  w: number;
  h: number;
  /** Směr k zadní zdi: -1 = nahoře (dveře dole), 1 = dole (dveře nahoře). */
  back: -1 | 1;
  /** Převede „vzdálenost od zadní zdi“ na y-souřadnici v místnosti. */
  b: (dist: number) => number;
  accent: string;
  time: Date;
}

export interface FloorStyle {
  kind: 'planks' | 'tiles' | 'carpet';
  a: string;
  b: string;
}

export interface ThemeDef {
  floor: FloorStyle;
  render: (c: ThemeCtx) => ReactNode;
  /** Místa (relativně k místnosti), mezi kterými robot chodí. */
  spots: (c: ThemeCtx) => Point[];
}

export const THEMES: Record<Exclude<ThemeId, 'reception'>, ThemeDef> = {
  mail: {
    floor: { kind: 'tiles', a: '#2b3a57', b: '#304263' },
    render: ({ w, b, back, accent, id }) => (
      <>
        <Rug cx={120} cy={b(140)} w={150} h={100} color={accent} />
        <Pigeonholes cx={105} cy={b(30)} w={160} h={40} />
        <Conveyor cx={280} cy={b(26)} w={140} id={id} />
        <Desk cx={120} cy={b(128)} back={back} screen="#9cc2ff" />
        <SmallTable cx={295} cy={b(150)} w={56} h={40} />
        <MailBag cx={295} cy={b(150)} />
        <Plant cx={26} cy={b(232)} />
        <Plant cx={w - 26} cy={b(232)} />
      </>
    ),
    spots: ({ b }) => [
      { x: 120, y: b(178) },
      { x: 105, y: b(76) },
      { x: 270, y: b(70) },
      { x: 250, y: b(185) },
      { x: 183, y: b(225) },
    ],
  },
  calendar: {
    floor: { kind: 'planks', a: '#5a3f2c', b: '#634632' },
    render: ({ w, b, back, accent, time }) => (
      <>
        <WallCalendar cx={110} cy={b(36)} w={150} h={52} accent={accent} />
        <WallClock cx={235} cy={b(30)} time={time} />
        <Desk cx={290} cy={b(115)} back={back} screen="#ffd0a8" />
        <Rug cx={110} cy={b(165)} w={140} h={110} color={accent} round />
        <RoundTable cx={110} cy={b(165)} r={30} />
        <Plant cx={w - 24} cy={b(232)} />
        <Plant cx={w - 24} cy={b(24)} r={12} />
      </>
    ),
    spots: ({ b }) => [
      { x: 290, y: b(165) },
      { x: 110, y: b(85) },
      { x: 200, y: b(150) },
      { x: 225, y: b(80) },
      { x: 280, y: b(225) },
    ],
  },
  research: {
    floor: { kind: 'carpet', a: '#3a2d55', b: '#40325e' },
    render: ({ w, b, back, accent }) => (
      <>
        <Bookshelf cx={w / 2} cy={b(16)} w={w - 24} h={22} seed={11} />
        <Bookshelf cx={20} cy={b(125)} w={22} h={150} seed={12} />
        <Rug cx={95} cy={b(165)} w={110} h={90} color={accent} round />
        <Armchair cx={95} cy={b(178)} color={accent} />
        <FloorLamp cx={52} cy={b(222)} />
        <Desk cx={265} cy={b(120)} back={back} screen="#d7c2ff" />
        <Globe cx={w - 34} cy={b(205)} />
        <Plant cx={w - 24} cy={b(55)} r={12} />
      </>
    ),
    spots: ({ b }) => [
      { x: 110, y: b(60) },
      { x: 240, y: b(60) },
      { x: 95, y: b(135) },
      { x: 265, y: b(168) },
      { x: 300, y: b(222) },
    ],
  },
  finance: {
    floor: { kind: 'tiles', a: '#24433a', b: '#294b41' },
    render: ({ w, b, back, accent }) => (
      <>
        <BarChart cx={100} cy={b(32)} w={140} h={44} color={accent} />
        <Cabinet cx={225} cy={b(24)} />
        <Cabinet cx={268} cy={b(24)} />
        <Safe cx={w - 36} cy={b(36)} />
        <Rug cx={130} cy={b(140)} w={160} h={100} color={accent} />
        <Desk cx={130} cy={b(128)} back={back} monitors={2} screen="#a5f3c8" />
        <Coins cx={200} cy={b(128)} />
        <Plant cx={26} cy={b(232)} />
        <Plant cx={w - 26} cy={b(232)} />
      </>
    ),
    spots: ({ b }) => [
      { x: 130, y: b(178) },
      { x: 100, y: b(80) },
      { x: 245, y: b(70) },
      { x: 320, y: b(85) },
      { x: 280, y: b(190) },
    ],
  },
  workshop: {
    floor: { kind: 'tiles', a: '#1f3a40', b: '#234147' },
    render: ({ w, b, back }) => (
      <>
        <Workbench cx={90} cy={b(28)} w={140} h={38} />
        {[0, 1, 2, 3].map((i) => (
          <ServerRack key={i} cx={w - 133 + i * 38} cy={b(38)} seed={i + 20} />
        ))}
        <Desk cx={130} cy={b(150)} w={120} back={back} monitors={2} screen="#7ff5ef" />
        <Cabinet cx={w - 40} cy={b(170)} w={36} h={50} />
        <Plant cx={26} cy={b(232)} />
      </>
    ),
    spots: ({ b, w }) => [
      { x: 130, y: b(198) },
      { x: 90, y: b(70) },
      { x: w - 100, y: b(90) },
      { x: w - 80, y: b(205) },
      { x: 240, y: b(150) },
    ],
  },
};
