import { Briefcase, DollarSign, Star, Users } from 'lucide-react';

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

export function TopStatsBar({ kpi }: TopStatsBarProps) {
  const cards = [
    {
      label: 'Jobs This Month',
      value: kpi.completedThisMonth.toString(),
      icon: Briefcase,
      iconBg: 'bg-primary',
      iconText: 'text-primary-foreground',
    },
    {
      label: 'Revenue This Month',
      value: fmt$(kpi.revenueThisMonth),
      icon: DollarSign,
      iconBg: 'bg-accent',
      iconText: 'text-accent-foreground',
    },
    {
      label: 'Average Rating',
      value: kpi.avgRating != null ? `${kpi.avgRating.toFixed(1)} / 5.0` : '—',
      icon: Star,
      iconBg: 'bg-[hsl(45,100%,51%)]',
      iconText: 'text-[hsl(45,100%,15%)]',
      isRating: true,
    },
    {
      label: 'Active Cleaners',
      value: kpi.activeCleanersThisWeek.toString(),
      icon: Users,
      iconBg: 'bg-secondary',
      iconText: 'text-secondary-foreground',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-card rounded-2xl shadow-sm border border-border p-5 flex flex-col gap-3"
        >
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl ${card.iconBg} ${card.iconText} flex items-center justify-center shrink-0`}>
              <card.icon className="h-5 w-5" />
            </div>
            <p className="text-xs font-semibold text-muted-foreground leading-tight">{card.label}</p>
          </div>
          <p className="text-2xl font-extrabold text-foreground">
            {card.isRating && kpi.avgRating != null && '⭐ '}
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}
