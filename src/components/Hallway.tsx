import { memo } from 'react';
import { HALLWAY } from '../world/layout';
import { AGENTS } from '../world/agents';
import { CoffeeMachine, Plant, Rug, Sofa, SmallTable } from './Furniture';

interface HallwayProps {
  selected: boolean;
  onSelect: (id: string) => void;
}

/** Chodba s recepcí (Ondik), salonkem a nástěnkou se stavem agentů. */
export const Hallway = memo(function Hallway({ selected, onSelect }: HallwayProps) {
  const { x, y, w, h } = HALLWAY;
  const cx = x + w / 2;
  return (
    <g className={`room hallway${selected ? ' selected' : ''}`} style={{ ['--accent' as string]: '#f5b83d' }}>
      <defs>
        <pattern id="floor-hall" width={48} height={48} patternUnits="userSpaceOnUse">
          <rect width={48} height={48} fill="#3a3f4f" />
          <rect x={1} y={1} width={46} height={46} rx={2} fill="#424859" />
        </pattern>
      </defs>
      <rect x={x} y={y} width={w} height={h} fill="url(#floor-hall)" />

      {/* koberec k recepci */}
      <rect x={cx - 70} y={y} width={140} height={h} fill="#7a2f3a" opacity={0.55} />
      <rect x={cx - 62} y={y} width={124} height={h} fill="none" stroke="#f5b83d" strokeOpacity={0.35} strokeWidth={2} />

      {/* Recepce – klikací zóna Ondika */}
      <g
        onClick={(e) => {
          e.stopPropagation();
          onSelect('ondik');
        }}
        style={{ cursor: 'pointer' }}>
        <ellipse cx={cx} cy={y + 100} rx={92} ry={62} fill="#f5b83d" opacity={0.08} className="reception-aura" />
        <path d={`M${cx - 64} ${y + 92} A64 44 0 0 0 ${cx + 64} ${y + 92}`} fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth={24} transform="translate(3 4)" />
        <path d={`M${cx - 64} ${y + 92} A64 44 0 0 0 ${cx + 64} ${y + 92}`} fill="none" stroke="#8a6440" strokeWidth={24} strokeLinecap="round" />
        <path d={`M${cx - 64} ${y + 92} A64 44 0 0 0 ${cx + 64} ${y + 92}`} fill="none" stroke="#c99a68" strokeWidth={18} strokeLinecap="round" />
        <rect x={cx - 34} y={y + 122} width={68} height={16} rx={4} fill="#1b2130" />
        <text x={cx} y={y + 134} textAnchor="middle" fontSize={10} fontWeight={700} fill="#f5b83d" letterSpacing={2}>
          RECEPCE
        </text>
        <rect className="room-highlight" x={cx - 96} y={y + 30} width={192} height={130} rx={18} fill="#f5b83d" fillOpacity={0} stroke="#f5b83d" strokeWidth={3} />
      </g>

      {/* Salonek vlevo */}
      <Rug cx={x + 135} cy={y + 115} w={170} h={110} color="#4f8ef7" />
      <Sofa cx={x + 135} cy={y + 70} w={110} color="#56658a" />
      <Sofa cx={x + 48} cy={y + 120} w={70} vertical color="#56658a" />
      <SmallTable cx={x + 135} cy={y + 125} w={60} h={34} />
      <CoffeeMachine cx={x + 26} cy={y + 180} />
      <Plant cx={x + 340} cy={y + 34} />

      {/* Nástěnka se stavem agentů vpravo */}
      <g transform={`translate(${x + w - 262}, ${y + 32})`}>
        <rect x={3} y={4} width={240} height={70} rx={6} fill="rgba(0,0,0,0.3)" />
        <rect width={240} height={70} rx={6} fill="#141925" stroke="#56607a" strokeWidth={3} />
        <text x={10} y={16} fontSize={9} fontWeight={700} fill="#8f9bb5" letterSpacing={1.5}>
          STAV TÝMU
        </text>
        {AGENTS.map((a, i) => (
          <g key={a.id} transform={`translate(${10 + (i % 4) * 57}, ${28 + Math.floor(i / 4) * 22})`}>
            <circle cx={5} cy={5} r={4} fill={a.color} className="led" style={{ animationDuration: `${1.4 + i * 0.3}s` }} />
            <text x={13} y={9} fontSize={9} fill="#dfe4ee">
              {a.name}
            </text>
          </g>
        ))}
      </g>
      <Sofa cx={x + w - 130} cy={y + 150} w={120} color="#56658a" />
      <Plant cx={x + w - 24} cy={y + 170} />
      <Plant cx={x + 380} cy={y + 172} r={12} />
    </g>
  );
});
