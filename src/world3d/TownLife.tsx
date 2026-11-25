/**
 * Život v městečku: roboti pracují v boxech, chodí si nakoupit do stánků, navštěvují se,
 * procházejí se po náměstí, v noci spí a na zavolání se sejdou na poradě na radnici.
 * Jedna simulace řídí všechny roboty, aby o sobě „věděli“ (návštěvy, porada).
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { AGENT_BY_ID } from '../world/agents';
import { PLACEMENTS, TOWN_HALL_ID, type BoxPlacement } from '../world/layout';
import type { AgentDef } from '../world/types';
import { INTERIORS, NIGHT_SPOT } from './themes';
import { ONDIK_SPOTS } from './TownHall';
import { RobotBody, type RobotBrain } from './Robot3D';
import {
  MEETING_CENTER,
  ROAD_R,
  STALLS,
  angleOf,
  boxDoorPath,
  hallDoorPath,
  meetingSpot,
  nearestHallGap,
  polar,
  ringPath,
  toWorld,
  type V2,
} from './town';

const SPEED = 1.05; // m/s
const MAX_OUTSIDE = 3; // kolik robotů může být najednou venku
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
const dist = (a: V2, b: V2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Co kdo řekne na poradě. */
const MEETING_LINES: Record<string, string[]> = {
  echo: ['Zprávy jsou čerstvé. 📰', 'Počasí hlídám! 🌦️'],
  postak: ['Pošta je roztříděná. ✉️'],
  chronos: ['Kalendář mám pod kontrolou. 📅', 'Termíny sedí. ⏰'],
  lexa: ['Mám nové poznatky. 📚'],
  kasa: ['Rozpočet sedí. 💰'],
  bit: ['Servery běží. 🔧', 'Všechno funguje. 💻'],
};
const GREETINGS = ['Ahoj, {n}! 👋', 'Čau, {n}!', 'Dobrý den, {n}! 🙂'];
const SMALL_TALK = ['Jak to jde?', 'Dáš si kafe? ☕', 'Máš chvilku?', 'Viděl jsi plakátek? 🗞️', 'Pěkný den, co? ☀️'];
const REPLIES = ['Ahoj! 😊', 'Čau, rád tě vidím!', 'Jde to skvěle!', 'Jasně, sedni si.', 'Mám plno práce, ale pro tebe vždycky!'];

type Home = { kind: 'box'; pl: BoxPlacement } | { kind: 'hall' };
type Loc = { kind: 'home' } | { kind: 'stall'; i: number } | { kind: 'visit'; host: string } | { kind: 'road'; angle: number } | { kind: 'meeting' };
type Dest = { kind: 'home'; spot: V2 } | { kind: 'stall'; i: number } | { kind: 'visit'; host: string } | { kind: 'road'; angle: number } | { kind: 'meeting'; spot: V2 };

interface Brain extends RobotBrain {
  agent: AgentDef;
  home: Home;
  work: V2[];
  bed: V2;
  path: V2[];
  wait: number;
  loc: Loc;
  face: V2 | null;
  bubbleUntil: number;
  nextChatter: number;
  carryUntil: number;
  onArrive: (() => void) | null;
  afterWait: (() => void) | null;
  inMeeting: boolean;
}

interface Ctx {
  night: boolean;
  busy: Set<string>;
}

class TownSim {
  brains: Brain[];
  t = 0;
  private events: { at: number; fn: () => void }[] = [];
  private meeting: { phase: 'gather' | 'talk' | 'leave'; start: number; onEnd: () => void } | null = null;

  constructor() {
    const brains: Brain[] = [];
    const ondik = AGENT_BY_ID[TOWN_HALL_ID];
    brains.push(this.makeBrain(ondik, { kind: 'hall' }, ONDIK_SPOTS.map((s) => [s[0], s[2]] as V2), [ONDIK_SPOTS[0][0], ONDIK_SPOTS[0][2]]));
    for (const pl of PLACEMENTS) {
      const agent = pl.agentId ? AGENT_BY_ID[pl.agentId] : null;
      if (!agent || agent.theme === 'townhall') continue;
      const spots = INTERIORS[agent.theme].spots.map((s) => toWorld(pl, s));
      brains.push(this.makeBrain(agent, { kind: 'box', pl }, spots, toWorld(pl, NIGHT_SPOT)));
    }
    this.brains = brains;
  }

  private makeBrain(agent: AgentDef, home: Home, work: V2[], bed: V2): Brain {
    const start = pick(work);
    return {
      id: agent.id,
      agent,
      home,
      work,
      bed,
      pos: [start[0], start[1]],
      heading: 0,
      walking: false,
      sleeping: false,
      bubble: null,
      carry: null,
      path: [],
      wait: rand(1, 6),
      loc: { kind: 'home' },
      face: null,
      bubbleUntil: 0,
      nextChatter: rand(5, 20),
      carryUntil: 0,
      onArrive: null,
      afterWait: null,
      inMeeting: false,
    };
  }

  byId(id: string) {
    return this.brains.find((b) => b.id === id);
  }

  say(b: Brain, text: string, seconds = 3.5) {
    b.bubble = text;
    b.bubbleUntil = this.t + seconds;
  }

  later(seconds: number, fn: () => void) {
    this.events.push({ at: this.t + seconds, fn });
  }

  // ------------------------------------------------------------ cesty

  private homeAngle(b: Brain): number | null {
    return b.home.kind === 'box' ? b.home.pl.angle : null;
  }

  /** Úsek z aktuálního místa na okružní cestu. */
  private exitPart(b: Brain, towardAngle: number): { pts: V2[]; angle: number } {
    const loc = b.loc;
    if (loc.kind === 'home' || loc.kind === 'meeting') {
      if (loc.kind === 'home' && b.home.kind === 'box') return { pts: boxDoorPath(b.home.pl), angle: b.home.pl.angle };
      const gap = nearestHallGap(towardAngle);
      return { pts: hallDoorPath(gap), angle: gap };
    }
    if (loc.kind === 'stall') return { pts: [polar(STALLS[loc.i].angle, ROAD_R)], angle: STALLS[loc.i].angle };
    if (loc.kind === 'visit') {
      const h = this.byId(loc.host)!;
      if (h.home.kind === 'box') {
        const pl = h.home.pl;
        return { pts: [toWorld(pl, [0, 2.9]), toWorld(pl, [0, 3.9]), polar(pl.angle, ROAD_R)], angle: pl.angle };
      }
      const gap = nearestHallGap(towardAngle);
      return { pts: hallDoorPath(gap), angle: gap };
    }
    return { pts: [], angle: loc.angle };
  }

  /** Úsek z okružní cesty do cíle. */
  private enterPart(b: Brain, d: Dest, fromAngle: number): { pts: V2[]; angle: number } {
    const hallEntry = (spot: V2) => {
      const gap = nearestHallGap(fromAngle);
      return { pts: [polar(gap, 4.7), polar(gap, 2.5), spot], angle: gap };
    };
    switch (d.kind) {
      case 'home':
        if (b.home.kind === 'box') {
          const pl = b.home.pl;
          return { pts: [toWorld(pl, [0, 3.9]), toWorld(pl, [0, 2.9]), toWorld(pl, [0, 1.5]), d.spot], angle: pl.angle };
        }
        return hallEntry(d.spot);
      case 'meeting':
        return hallEntry(d.spot);
      case 'stall':
        return { pts: [STALLS[d.i].buy], angle: STALLS[d.i].angle };
      case 'visit': {
        const h = this.byId(d.host)!;
        if (h.home.kind === 'box') {
          const pl = h.home.pl;
          return { pts: [toWorld(pl, [0, 3.9]), toWorld(pl, [0, 2.9]), toWorld(pl, [-0.9, 2.0])], angle: pl.angle };
        }
        return hallEntry([1.5, -0.1]);
      }
      case 'road':
        return { pts: [], angle: d.angle };
    }
  }

  /** Naplánuje cestu do cíle (přes vchody a okružní cestu). */
  go(b: Brain, d: Dest, onArrive: (() => void) | null = null) {
    b.sleeping = false;
    b.face = null;
    b.afterWait = null;
    b.onArrive = onArrive;
    const sameBuilding =
      (d.kind === 'home' && b.loc.kind === 'home') ||
      (d.kind === 'meeting' && b.home.kind === 'hall' && b.loc.kind === 'home') ||
      (d.kind === 'home' && b.home.kind === 'hall' && b.loc.kind === 'meeting');
    if (sameBuilding) {
      b.path = [(d as { spot: V2 }).spot];
    } else {
      const target = d.kind === 'home' ? (this.homeAngle(b) ?? angleOf(b.pos)) : this.destAngleSimple(d, angleOf(b.pos));
      const ex = this.exitPart(b, target);
      const en = this.enterPart(b, d, ex.angle);
      b.path = [...ex.pts, ...ringPath(ex.angle, en.angle), ...en.pts];
    }
    b.loc = d.kind === 'home' ? { kind: 'home' } : d.kind === 'stall' ? { kind: 'stall', i: d.i } : d.kind === 'visit' ? { kind: 'visit', host: d.host } : d.kind === 'road' ? { kind: 'road', angle: d.angle } : { kind: 'meeting' };
  }

  private destAngleSimple(d: Dest, from: number): number {
    if (d.kind === 'stall') return STALLS[d.i].angle;
    if (d.kind === 'road') return d.angle;
    if (d.kind === 'visit') {
      const h = this.byId(d.host)!;
      return h.home.kind === 'box' ? h.home.pl.angle : nearestHallGap(from);
    }
    return nearestHallGap(from);
  }

  goHome(b: Brain, spot?: V2, onArrive: (() => void) | null = null) {
    this.go(b, { kind: 'home', spot: spot ?? pick(b.work) }, onArrive);
  }

  private outsideCount() {
    return this.brains.filter((b) => b.loc.kind !== 'home').length;
  }

  // ------------------------------------------------------------ činnosti

  private plan(b: Brain, ctx: Ctx) {
    const busy = ctx.busy.has(b.id);
    if (busy) {
      // práce (chat, plakátek) → domů ke stolu
      if (b.loc.kind !== 'home') this.goHome(b, b.work[0]);
      else if (dist(b.pos, b.work[0]) > 0.1) b.path = [b.work[0]];
      b.wait = 1;
      return;
    }
    if (ctx.night && b.home.kind === 'box') {
      if (b.loc.kind !== 'home') this.goHome(b, b.bed);
      else if (dist(b.pos, b.bed) > 0.1) b.path = [b.bed];
      else b.sleeping = true;
      b.wait = 3;
      return;
    }
    b.sleeping = false;
    if (b.loc.kind !== 'home') {
      this.goHome(b);
      return;
    }
    const r = Math.random();
    const canGoOut = this.outsideCount() < MAX_OUTSIDE;
    if (canGoOut && r < 0.17) return this.errand(b);
    if (canGoOut && r < 0.3) return this.visit(b);
    if (canGoOut && r < 0.37 && b.home.kind === 'box') return this.stroll(b);
    // práce v kanceláři: přejít k jinému místu
    const options = b.work.filter((s) => dist(s, b.pos) > 0.3);
    b.path = [pick(options.length ? options : b.work)];
    b.onArrive = () => {
      b.wait = rand(4, 10);
    };
  }

  private errand(b: Brain) {
    const i = Math.floor(Math.random() * STALLS.length);
    const st = STALLS[i];
    this.go(b, { kind: 'stall', i }, () => {
      b.face = st.pos;
      this.say(b, pick(st.buyLines), 3.5);
      b.wait = 4;
      b.afterWait = () => {
        b.carry = st.item;
        b.carryUntil = this.t + 40;
        this.say(b, pick(st.afterLines), 3);
        this.goHome(b, undefined, () => {
          b.wait = rand(3, 6);
        });
      };
    });
  }

  private visit(b: Brain) {
    const hosts = this.brains.filter((h) => h.id !== b.id && !h.inMeeting);
    if (!hosts.length) return;
    const host = pick(hosts);
    this.go(b, { kind: 'visit', host: host.id }, () => {
      b.face = host.pos;
      this.say(b, pick(GREETINGS).replace('{n}', host.agent.name), 3);
      this.later(1.8, () => {
        if (host.loc.kind === 'home' && !host.walking && !host.sleeping) host.face = b.pos;
        this.say(host, host.sleeping ? 'Zzz… 😴' : pick(REPLIES), 3);
      });
      this.later(4.5, () => this.say(b, pick(SMALL_TALK), 3));
      this.later(7, () => {
        if (!host.sleeping) this.say(host, pick(REPLIES), 2.5);
        host.face = null;
      });
      b.wait = 9.5;
      b.afterWait = () => {
        this.say(b, 'Tak zatím! 👋', 2.5);
        this.goHome(b, undefined, () => {
          b.wait = rand(3, 6);
        });
      };
    });
  }

  private stroll(b: Brain) {
    const angle = angleOf(b.pos) + rand(-2.2, 2.2);
    this.go(b, { kind: 'road', angle }, () => {
      if (Math.random() < 0.6) this.say(b, pick(['Hezký den! ☀️', 'Krásné náměstí.', 'Trochu se protáhnu.', 'Kde je kavárna? ☕']), 3);
      b.wait = rand(2, 4);
      b.afterWait = () => this.goHome(b);
    });
  }

  // ------------------------------------------------------------ porada

  startMeeting(onEnd: () => void) {
    if (this.meeting) return;
    this.meeting = { phase: 'gather', start: this.t, onEnd };
    this.events = [];
    const n = this.brains.length;
    this.brains.forEach((b, i) => {
      b.inMeeting = true;
      this.say(b, i === 0 ? 'Svolávám poradu! 🏛️' : 'Jdu na poradu!', 3);
      this.go(b, { kind: 'meeting', spot: meetingSpot(i, n) }, () => {
        b.face = MEETING_CENTER;
        b.wait = 999;
      });
    });
  }

  private updateMeeting() {
    const m = this.meeting;
    if (!m) return;
    if (m.phase === 'gather') {
      const arrived = this.brains.every((b) => b.path.length === 0);
      if (arrived || this.t - m.start > 45) {
        m.phase = 'talk';
        const [host, ...rest] = this.brains;
        this.say(host, 'Vítejte na poradě! 🏛️', 3.5);
        rest.forEach((b, i) => this.later(3.5 + i * 3.2, () => this.say(b, pick(MEETING_LINES[b.id] ?? ['Všechno v pořádku.']), 3)));
        const end = 3.5 + rest.length * 3.2 + 1;
        this.later(end, () => this.say(host, 'Díky všem, jdeme na to! 💪', 3.5));
        this.later(end + 3.5, () => {
          m.phase = 'leave';
          this.brains.forEach((b) => {
            b.inMeeting = false;
            b.face = null;
            b.wait = 0;
            this.goHome(b, undefined, () => {
              b.wait = rand(2, 6);
            });
          });
          this.later(40, () => this.finishMeeting());
        });
      }
    } else if (m.phase === 'leave') {
      if (this.brains.every((b) => b.loc.kind === 'home' && b.path.length === 0)) this.finishMeeting();
    }
  }

  private finishMeeting() {
    if (!this.meeting) return;
    const done = this.meeting.onEnd;
    this.meeting = null;
    done();
  }

  get meetingActive() {
    return !!this.meeting;
  }

  // ------------------------------------------------------------ krok simulace

  update(dt: number, ctx: Ctx) {
    this.t += dt;
    // naplánované události (repliky při návštěvě, porada)
    const due = this.events.filter((e) => e.at <= this.t);
    if (due.length) {
      this.events = this.events.filter((e) => e.at > this.t);
      due.forEach((e) => e.fn());
    }
    this.updateMeeting();

    for (const b of this.brains) {
      if (b.bubble && this.t > b.bubbleUntil) b.bubble = null;
      if (b.carry && this.t > b.carryUntil) b.carry = null;

      if (b.path.length) {
        const target = b.path[0];
        const dx = target[0] - b.pos[0];
        const dz = target[1] - b.pos[1];
        const d = Math.hypot(dx, dz);
        const step = SPEED * dt;
        if (d <= step) {
          b.pos = [target[0], target[1]];
          b.path.shift();
        } else {
          b.pos = [b.pos[0] + (dx / d) * step, b.pos[1] + (dz / d) * step];
        }
        b.walking = true;
        if (d > 0.01) b.heading = turn(b.heading, Math.atan2(dx, dz), dt * 10);
        if (!b.path.length) {
          b.walking = false;
          const cb = b.onArrive;
          b.onArrive = null;
          cb?.();
        }
        continue;
      }

      b.walking = false;
      // natočení v klidu: na koho mluví, jinak do středu městečka
      const look = b.face ?? (b.home.kind === 'box' && b.loc.kind === 'home' ? ([0, 0] as V2) : null);
      if (look) b.heading = turn(b.heading, Math.atan2(look[0] - b.pos[0], look[1] - b.pos[1]), dt * 3);

      if (b.inMeeting) continue;

      // povídání při práci
      if (!ctx.busy.has(b.id) && !b.bubble && b.loc.kind === 'home' && !ctx.night) {
        b.nextChatter -= dt;
        if (b.nextChatter <= 0) {
          b.nextChatter = rand(15, 35);
          this.say(b, pick(b.agent.idleLines), 3.5);
        }
      }
      if (b.sleeping && !b.bubble && Math.random() < dt / 12) this.say(b, 'Zzz… 💤', 2.5);

      // když se začne pracovat (chat), přeruš čekání
      if (ctx.busy.has(b.id) && (b.loc.kind !== 'home' || dist(b.pos, b.work[0]) > 0.1)) b.wait = Math.min(b.wait, 0);

      b.wait -= dt;
      if (b.wait > 0) continue;
      if (b.afterWait) {
        const fn = b.afterWait;
        b.afterWait = null;
        fn();
        continue;
      }
      this.plan(b, ctx);
    }
  }
}

function turn(from: number, to: number, k: number) {
  let d = to - from;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return from + d * Math.min(1, k);
}

interface TownLifeProps {
  night: boolean;
  busy: Set<string>;
  busyLabels: Record<string, string>;
  /** Zvýšením čísla se svolá porada. */
  meetingId: number;
  onMeetingEnd: () => void;
  onSelect: (id: string) => void;
}

export function TownLife({ night, busy, busyLabels, meetingId, onMeetingEnd, onSelect }: TownLifeProps) {
  const sim = useMemo(() => new TownSim(), []);
  // ladění: s ?ladeni v adrese je simulace dostupná v konzoli jako window.mestecko
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('ladeni')) (window as unknown as { mestecko: TownSim }).mestecko = sim;
  }, [sim]);
  const ctx = useRef<Ctx>({ night, busy });
  ctx.current = { night, busy };
  const endRef = useRef(onMeetingEnd);
  endRef.current = onMeetingEnd;

  useEffect(() => {
    if (meetingId > 0) sim.startMeeting(() => endRef.current());
  }, [meetingId, sim]);

  // Při nízkém počtu snímků (pomalý počítač) uděláme víc menších kroků, aby roboti nezpomalili.
  const speed = useMemo(() => {
    const q = new URLSearchParams(window.location.search);
    return q.has('ladeni') ? Math.min(20, Math.max(1, Number(q.get('rychlost') ?? 1))) : 1;
  }, []);
  useFrame((_, dt) => {
    let rest = Math.min(dt, 0.5) * speed;
    while (rest > 0) {
      const step = Math.min(rest, 0.05);
      sim.update(step, ctx.current);
      rest -= step;
    }
  });

  return (
    <>
      {sim.brains.map((b) => (
        <group
          key={b.id}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            onSelect(b.id);
          }}
        >
          <RobotBody brain={b} color={b.agent.color} busy={busy.has(b.id)} busyText={busyLabels[b.id]} />
        </group>
      ))}
    </>
  );
}
