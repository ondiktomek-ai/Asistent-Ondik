import { memo } from 'react';

interface RobotProps {
  x: number;
  y: number;
  color: string;
  icon: string;
  name: string;
  facing?: 1 | -1;
  walking?: boolean;
  bubble?: string | null;
  selected?: boolean;
  showName?: boolean;
  onClick?: () => void;
  scale?: number;
}

/** Robot-agent v pohledu „shora zepředu“. Souřadnice (x, y) = místo, kde stojí. */
export const Robot = memo(function Robot({
  x,
  y,
  color,
  icon,
  name,
  facing = 1,
  walking = false,
  bubble,
  selected = false,
  showName = false,
  onClick,
  scale = 1.35,
}: RobotProps) {
  const eyeShift = facing * 2;
  return (
    <g
      transform={`translate(${x.toFixed(1)}, ${y.toFixed(1)}) scale(${scale})`}
      className={`robot${walking ? ' walking' : ''}${selected ? ' selected' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      style={{ cursor: onClick ? 'pointer' : undefined }}
    >
      {selected && <ellipse cx={0} cy={2} rx={22} ry={8} fill="none" stroke={color} strokeWidth={2.5} className="select-ring" />}
      <ellipse cx={0} cy={2} rx={13} ry={5} fill="rgba(0,0,0,0.35)" />
      <g className="robot-body">
        {/* nohy / kolečka */}
        <rect x={-9} y={-5} width={7} height={7} rx={3} fill="#2a3040" className="leg-l" />
        <rect x={2} y={-5} width={7} height={7} rx={3} fill="#2a3040" className="leg-r" />
        {/* ruce */}
        <rect x={-17} y={-21} width={6} height={13} rx={3} fill={color} className="arm-l" />
        <rect x={11} y={-21} width={6} height={13} rx={3} fill={color} className="arm-r" />
        {/* tělo */}
        <rect x={-12} y={-24} width={24} height={21} rx={7} fill={color} />
        <rect x={-12} y={-24} width={24} height={8} rx={6} fill="#fff" opacity={0.18} />
        <text x={0} y={-9} textAnchor="middle" fontSize={10} style={{ pointerEvents: 'none' }}>
          {icon}
        </text>
        {/* hlava */}
        <rect x={-14} y={-46} width={28} height={23} rx={9} fill="#e8edf5" stroke="#c4ccd9" strokeWidth={1} />
        <rect x={-11} y={-41} width={22} height={12} rx={5} fill="#1b2433" />
        <g className="eyes">
          <circle cx={-5 + eyeShift} cy={-35} r={2.4} fill={color} />
          <circle cx={5 + eyeShift} cy={-35} r={2.4} fill={color} />
        </g>
        {/* anténa */}
        <line x1={0} y1={-46} x2={0} y2={-53} stroke="#9aa3b5" strokeWidth={2} />
        <circle cx={0} cy={-55} r={3} fill={color} className="antenna" />
      </g>
      {showName && (
        <g className="name-tag" style={{ pointerEvents: 'none' }}>
          <rect x={-name.length * 3.6 - 6} y={8} width={name.length * 7.2 + 12} height={15} rx={7} fill="rgba(15,19,30,0.85)" />
          <text x={0} y={19} textAnchor="middle" fontSize={10} fontWeight={600} fill="#fff">
            {name}
          </text>
        </g>
      )}
      {bubble && <SpeechBubble text={bubble} />}
    </g>
  );
});

function SpeechBubble({ text }: { text: string }) {
  const w = Math.max(40, text.length * 6.3 + 18);
  const h = 22;
  const y = -88;
  return (
    <g className="bubble" style={{ pointerEvents: 'none' }}>
      <rect x={-w / 2} y={y} width={w} height={h} rx={10} fill="#fff" stroke="#1b2433" strokeOpacity={0.15} />
      <path d={`M-5 ${y + h - 1} L0 ${y + h + 7} L5 ${y + h - 1}`} fill="#fff" />
      <text x={0} y={y + 15} textAnchor="middle" fontSize={11} fill="#1b2433" fontWeight={500}>
        {text}
      </text>
    </g>
  );
}
