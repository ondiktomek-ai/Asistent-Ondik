import { useMemo } from 'react';
import { AGENT_BY_ID } from '../world/agents';
import { BUILDING, DOOR_WIDTH, HALLWAY, RECEPTION_SPOTS, ROOMS, VACANT_ID, WORLD, doorCenter, roomKey } from '../world/layout';
import { useRobots, type RobotPlan } from '../hooks/useRobots';
import { darknessFor, type LightMode } from '../hooks/useClock';
import { THEMES } from './themes';
import { Room, VacantRoom, roomCtx } from './Room';
import { Hallway } from './Hallway';
import { Robot } from './Robot';
import { seeded } from './Furniture';

interface WorldProps {
  time: Date;
  lightMode: LightMode;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const DOOR_FLOOR = '#424859';

export function World({ time, lightMode, selectedId, onSelect }: WorldProps) {
  const plans = useMemo<RobotPlan[]>(() => {
    const roomPlans = ROOMS.flatMap((room) => {
      const agent = room.agentId ? AGENT_BY_ID[room.agentId] : null;
      if (!agent) return [];
      const theme = THEMES[agent.theme as keyof typeof THEMES];
      const ctx = roomCtx(room, agent, new Date());
      return {
        id: agent.id,
        spots: theme.spots(ctx).map((p) => ({ x: room.x + p.x, y: room.y + p.y })),
        lines: agent.idleLines,
      };
    });
    return [{ id: 'ondik', spots: RECEPTION_SPOTS, lines: AGENT_BY_ID.ondik.idleLines }, ...roomPlans];
  }, []);
  const robots = useRobots(plans);

  const darkness = darknessFor(time, lightMode);
  const night = darkness > 0.5;

  // Roboti seřazení podle y, aby ten vpředu překrýval toho vzadu.
  const sortedRobots = [...robots].sort((a, b) => a.y - b.y);

  return (
    <svg className="world" viewBox={`0 0 ${WORLD.width} ${WORLD.height}`} onClick={() => onSelect(null)} role="img" aria-label="Kancelář agentů">
      <defs>
        <radialGradient id="lampGlow">
          <stop offset="0%" stopColor="#ffe9a8" stopOpacity={0.55} />
          <stop offset="100%" stopColor="#ffe9a8" stopOpacity={0} />
        </radialGradient>
        <radialGradient id="roomLight">
          <stop offset="0%" stopColor="#ffdb8a" stopOpacity={0.22} />
          <stop offset="70%" stopColor="#ffdb8a" stopOpacity={0.06} />
          <stop offset="100%" stopColor="#ffdb8a" stopOpacity={0} />
        </radialGradient>
        <filter id="buildingShadow" x="-5%" y="-5%" width="110%" height="115%">
          <feDropShadow dx={0} dy={10} stdDeviation={10} floodColor="#000" floodOpacity={0.45} />
        </filter>
      </defs>

      {/* Okolí budovy */}
      <rect width={WORLD.width} height={WORLD.height} fill={night ? '#12261d' : '#2d5a3d'} className="ground" />
      <Bushes />

      {/* Budova – zdi */}
      <rect x={BUILDING.x} y={BUILDING.y} width={BUILDING.w} height={BUILDING.h} rx={6} fill="#20263a" filter="url(#buildingShadow)" />

      <Hallway selected={selectedId === 'ondik'} onSelect={onSelect} />

      {ROOMS.map((room) =>
        room.agentId ? (
          <Room key={roomKey(room)} room={room} agent={AGENT_BY_ID[room.agentId]} time={time} selected={selectedId === room.agentId} onSelect={onSelect} />
        ) : (
          <VacantRoom key={roomKey(room)} room={room} selected={selectedId === VACANT_ID} onSelect={onSelect} />
        ),
      )}

      {/* Dveře */}
      {ROOMS.map((room) => {
        const d = doorCenter(room);
        return (
          <g key={`door-${roomKey(room)}`} style={{ pointerEvents: 'none' }}>
            <rect x={d.x - DOOR_WIDTH / 2} y={d.y - 5} width={DOOR_WIDTH} height={10} fill={DOOR_FLOOR} />
            <rect x={d.x - DOOR_WIDTH / 2} y={d.y - 1.5} width={DOOR_WIDTH} height={3} fill={room.agentId ? AGENT_BY_ID[room.agentId].color : '#5a6278'} opacity={0.7} />
          </g>
        );
      })}

      {/* Okna ve vnějších zdech */}
      {ROOMS.map((room) => {
        const wy = room.door === 'bottom' ? BUILDING.y + 2 : BUILDING.y + BUILDING.h - 8;
        const lit = night && room.agentId !== null;
        return [0.2, 0.5, 0.8].map((f) => (
          <rect
            key={`win-${roomKey(room)}-${f}`}
            x={room.x + room.w * f - 34}
            y={wy}
            width={68}
            height={6}
            rx={2}
            fill={lit ? '#ffd77a' : night ? '#2a3558' : '#9fd8ff'}
            opacity={0.9}
            className="window"
          />
        ));
      })}

      {/* Cedulky kanceláří na chodbě */}
      {ROOMS.map((room) => {
        const agent = room.agentId ? AGENT_BY_ID[room.agentId] : null;
        const d = doorCenter(room);
        const label = agent ? `${agent.icon} ${agent.roomName}` : '＋ Volno';
        const color = agent ? agent.color : '#5a6278';
        const lw = label.length * 7 + 22;
        const ly = room.door === 'bottom' ? HALLWAY.y + 8 : HALLWAY.y + HALLWAY.h - 28;
        return (
          <g
            key={`sign-${roomKey(room)}`}
            className="room-sign"
            transform={`translate(${d.x + DOOR_WIDTH / 2 + 8}, ${ly})`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(agent ? agent.id : VACANT_ID);
            }}
          >
            <rect width={lw} height={20} rx={5} fill="#141925" stroke={color} strokeWidth={1.5} />
            <text x={lw / 2} y={14} textAnchor="middle" fontSize={11} fontWeight={600} fill="#fff">
              {label}
            </text>
          </g>
        );
      })}

      {/* Noc – ztmavení a světla */}
      <g style={{ pointerEvents: 'none' }}>
        <rect x={0} y={0} width={WORLD.width} height={WORLD.height} fill="#0a1030" opacity={darkness * 0.42} className="night-overlay" />
        {darkness > 0 &&
          ROOMS.filter((room) => room.agentId).map((room) => (
            <ellipse
              key={`light-${roomKey(room)}`}
              cx={room.x + room.w / 2}
              cy={room.y + room.h / 2}
              rx={room.w * 0.55}
              ry={room.h * 0.6}
              fill="url(#roomLight)"
              opacity={darkness}
            />
          ))}
        {darkness > 0 && <ellipse cx={600} cy={410} rx={260} ry={110} fill="url(#roomLight)" opacity={darkness} />}
      </g>

      {/* Roboti */}
      {sortedRobots.map((r) => {
        const agent = AGENT_BY_ID[r.id];
        return (
          <Robot
            key={r.id}
            x={r.x}
            y={r.y}
            facing={r.facing}
            walking={r.walking}
            bubble={r.bubble}
            color={agent.color}
            icon={agent.icon}
            name={agent.name}
            selected={selectedId === r.id}
            showName
            onClick={() => onSelect(r.id)}
          />
        );
      })}
    </svg>
  );
}

function Bushes() {
  const rnd = seeded(42);
  const bushes: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < 26; i++) {
    const side = i % 4;
    const t = rnd();
    const r = 7 + rnd() * 7;
    if (side === 0) bushes.push({ x: 20 + t * 1160, y: 12 + rnd() * 8, r });
    else if (side === 1) bushes.push({ x: 20 + t * 1160, y: 805 + rnd() * 8, r });
    else if (side === 2) bushes.push({ x: 10 + rnd() * 10, y: 40 + t * 740, r: r * 0.8 });
    else bushes.push({ x: 1180 + rnd() * 10, y: 40 + t * 740, r: r * 0.8 });
  }
  return (
    <g style={{ pointerEvents: 'none' }}>
      {bushes.map((b, i) => (
        <g key={i}>
          <circle cx={b.x} cy={b.y} r={b.r} fill="#2f7a48" />
          <circle cx={b.x - b.r * 0.3} cy={b.y - b.r * 0.3} r={b.r * 0.55} fill="#4aa366" />
        </g>
      ))}
    </g>
  );
}
