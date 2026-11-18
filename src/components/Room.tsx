import { memo } from 'react';
import type { AgentDef } from '../world/types';
import { VACANT_ID, roomKey, type RoomLayout } from '../world/layout';
import { THEMES, type FloorStyle, type ThemeCtx } from './themes';

export function roomCtx(room: RoomLayout, agent: AgentDef, time: Date): ThemeCtx {
  const back: -1 | 1 = room.door === 'bottom' ? -1 : 1;
  return {
    id: roomKey(room),
    w: room.w,
    h: room.h,
    back,
    b: (d) => (back === -1 ? d : room.h - d),
    accent: agent.color,
    time,
  };
}

export function FloorPattern({ id, floor }: { id: string; floor: FloorStyle }) {
  if (floor.kind === 'planks') {
    return (
      <pattern id={id} width={80} height={24} patternUnits="userSpaceOnUse">
        <rect width={80} height={24} fill={floor.a} />
        <rect y={12} width={80} height={12} fill={floor.b} />
        <line x1={0} x2={80} y1={12} y2={12} stroke="#000" strokeOpacity={0.18} />
        <line x1={0} x2={80} y1={24} y2={24} stroke="#000" strokeOpacity={0.18} />
        <line x1={30} x2={30} y1={0} y2={12} stroke="#000" strokeOpacity={0.18} />
        <line x1={70} x2={70} y1={12} y2={24} stroke="#000" strokeOpacity={0.18} />
      </pattern>
    );
  }
  if (floor.kind === 'tiles') {
    return (
      <pattern id={id} width={40} height={40} patternUnits="userSpaceOnUse">
        <rect width={40} height={40} fill={floor.a} />
        <rect width={20} height={20} fill={floor.b} />
        <rect x={20} y={20} width={20} height={20} fill={floor.b} />
      </pattern>
    );
  }
  return (
    <pattern id={id} width={10} height={10} patternUnits="userSpaceOnUse">
      <rect width={10} height={10} fill={floor.a} />
      <circle cx={5} cy={5} r={1.2} fill={floor.b} />
    </pattern>
  );
}

interface RoomProps {
  room: RoomLayout;
  agent: AgentDef;
  time: Date;
  selected: boolean;
  onSelect: (id: string) => void;
}

export const Room = memo(function Room({ room, agent, time, selected, onSelect }: RoomProps) {
  const theme = THEMES[agent.theme as keyof typeof THEMES];
  const ctx = roomCtx(room, agent, time);
  const patternId = `floor-${room.agentId}`;
  return (
    <g
      className={`room${selected ? ' selected' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(agent.id);
      }}
      style={{ ['--accent' as string]: agent.color }}
    >
      <defs>
        <FloorPattern id={patternId} floor={theme.floor} />
      </defs>
      <rect x={room.x} y={room.y} width={room.w} height={room.h} fill={`url(#${patternId})`} />
      <g transform={`translate(${room.x}, ${room.y})`}>{theme.render(ctx)}</g>
      <rect className="room-highlight" x={room.x + 2} y={room.y + 2} width={room.w - 4} height={room.h - 4} rx={4} fill={agent.color} fillOpacity={0} stroke={agent.color} strokeWidth={3} />
    </g>
  );
});

/** Volná kancelář – připravená pro budoucího agenta. */
export const VacantRoom = memo(function VacantRoom({ room, selected, onSelect }: { room: RoomLayout; selected: boolean; onSelect: (id: string) => void }) {
  const patternId = `floor-${roomKey(room)}`;
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;
  return (
    <g
      className={`room vacant${selected ? ' selected' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(VACANT_ID);
      }}
    >
      <defs>
        <FloorPattern id={patternId} floor={{ kind: 'planks', a: '#33384a', b: '#373d50' }} />
      </defs>
      <rect x={room.x} y={room.y} width={room.w} height={room.h} fill={`url(#${patternId})`} />
      {/* krabice po stěhování */}
      <g opacity={0.9}>
        <rect x={room.x + 30} y={room.y + (room.door === 'top' ? room.h - 70 : 30)} width={44} height={36} rx={3} fill="#b58b5c" stroke="#8a6440" strokeWidth={2} />
        <line x1={room.x + 52} x2={room.x + 52} y1={room.y + (room.door === 'top' ? room.h - 70 : 30)} y2={room.y + (room.door === 'top' ? room.h - 34 : 66)} stroke="#e8d3a8" strokeWidth={4} />
        <rect x={room.x + 82} y={room.y + (room.door === 'top' ? room.h - 58 : 42)} width={30} height={26} rx={3} fill="#a87d50" stroke="#8a6440" strokeWidth={2} />
      </g>
      <g className="vacant-plus">
        <circle cx={cx} cy={cy} r={34} fill="none" stroke="#8f9bb5" strokeOpacity={0.5} strokeWidth={2.5} strokeDasharray="7 6" />
        <path d={`M${cx - 12} ${cy} H${cx + 12} M${cx} ${cy - 12} V${cy + 12}`} stroke="#8f9bb5" strokeOpacity={0.8} strokeWidth={4} strokeLinecap="round" />
        <text x={cx} y={cy + 58} textAnchor="middle" fontSize={13} fontWeight={600} fill="#8f9bb5">
          Volná kancelář
        </text>
      </g>
      <rect className="room-highlight" x={room.x + 2} y={room.y + 2} width={room.w - 4} height={room.h - 4} rx={4} fill="#8f9bb5" fillOpacity={0} stroke="#8f9bb5" strokeWidth={3} />
    </g>
  );
});
