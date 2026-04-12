import { Briefcase, DollarSign, Star, Users, TrendingUp, TrendingDown } from 'lucide-react';

interface TopStatsBarProps {
  kpi: {
    completedThisMonth: number;
    revenueThisMonth: number;
    avgRating: number | null;
    activeCleanersThisWeek: number;
  };
}

function fmt$(n: number) {
  return '$' + n.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// Static deterministic sparkline path so it doesn't reshuffle on every render
function Sparkline({ color, points }: { color: string; points: number[] }) {
  const w = 80;
  const h = 24;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const step = w / (points.length - 1);
  const path = points
    .map((p, i) => {
      const x = i * step;
      const y = h - ((p - min) / range) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <defs>
        <linearGradient id={`spark-${color}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${path} L${w},${h} L0,${h} Z`}
        fill={`url(#spark-${color})`}
        stroke="none"
      />
      <path d={path} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TopStatsBar({ kpi }: TopStatsBarProps) {
  const cards = [
    {
      label: 'Jobs This Month',
      value: kpi.completedThisMonth.toString(),
      icon: Briefcase,
      borderGradient: 'linear-gradient(180deg, #3A7560 0%, #1A6B5E 100%)',
      iconColor: '#4ADE80',
      sparkColor: '#4ADE80',
      points: [12, 14, 11, 16, 18, 17, 22],
      delta: { up: true, value: '+12%' },
    },
    {
      label: 'Revenue This Month',
      value: fmt$(kpi.revenueThisMonth),
      icon: DollarSign,
      borderGradient: 'linear-gradient(180deg, #FEDB00 0%, #C9A800 100%)',
      iconColor: '#FEDB00',
      sparkColor: '#FEDB00',
      points: [3, 5, 4, 7, 9, 8, 12],
      delta: { up: true, value: '+18%' },
      isYellow: true,
    },
    {
      label: 'Average Rating',
      value: kpi.avgRating != null ? `${kpi.avgRating.toFixed(1)}` : '—',
      suffix: kpi.avgRating != null ? ' / 5.0' : '',
      icon: Star,
      borderGradient: 'linear-gradient(180deg, #3A7560 0%, #1A6B5E 100%)',
      iconColor: '#4ADE80',
      sparkColor: '#4ADE80',
      points: [4.4, 4.5, 4.5, 4.6, 4.7, 4.7, 4.8],
      delta: { up: true, value: '+0.3' },
    },
    {
      label: 'Active Cleaners',
      value: kpi.activeCleanersThisWeek.toString(),
      icon: Users,
      borderGradient: 'linear-gradient(180deg, #3A7560 0%, #1A6B5E 100%)',
      iconColor: '#4ADE80',
      sparkColor: '#4ADE80',
      points: [4, 5, 5, 6, 6, 7, 7],
      delta: { up: false, value: '0%' },
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 w-full max-w-full">
      {cards.map((card, idx) => {
        const Delta = card.delta.up ? TrendingUp : TrendingDown;
        return (
          <div
            key={card.label}
            className="glass-card hover-lift count-up relative overflow-hidden p-4 sm:p-5 min-w-0"
            style={{ animationDelay: `${idx * 60}ms` }}
          >
            {/* Gradient left border */}
            <div
              className="absolute left-0 top-0 bottom-0 w-[3px]"
              style={{ background: card.borderGradient }}
            />

            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <card.icon className="h-4 w-4" style={{ color: card.iconColor }} />
                <p
                  className="text-[10px] font-semibold uppercase leading-tight"
                  style={{ letterSpacing: '0.08em', color: '#86EFAC' }}
                >
                  {card.label}
                </p>
              </div>
            </div>

            <div className="flex items-end justify-between gap-3">
              <p
                className="tabular-nums leading-none"
                style={{
                  fontSize: '32px',
                  fontWeight: 800,
                  color: '#F0FDF4',
                  letterSpacing: '-0.02em',
                }}
              >
                {card.value}
                {card.suffix && (
                  <span className="text-base font-bold" style={{ color: '#86EFAC' }}>
                    {card.suffix}
                  </span>
                )}
              </p>
              <Sparkline color={card.sparkColor} points={card.points} />
            </div>

            {card.value !== '0' && card.value !== '$0' && card.value !== '—' && (
              <div className="mt-2 flex items-center gap-1">
                <Delta
                  className="h-3 w-3"
                  style={{ color: card.delta.up ? '#4ADE80' : '#EF4444' }}
                />
                <span
                  className="text-[11px] font-bold tabular-nums"
                  style={{ color: card.delta.up ? '#4ADE80' : '#EF4444' }}
                >
                  {card.delta.value}
                </span>
                <span className="text-[10px]" style={{ color: '#86EFAC', opacity: 0.6 }}>
                  vs last month
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
