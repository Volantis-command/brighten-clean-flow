import { useNavigate } from 'react-router-dom';
import {
  Calendar, CheckCircle, Clock, CalendarDays, DollarSign, Receipt,
  AlertTriangle, CalendarPlus, FileText, UserX, Users
} from 'lucide-react';

interface KPI {
  totalJobsToday: number;
  inProgressToday: number;
  completedToday: number;
  flaggedCount: number;
  scheduledThisWeek: number;
  completedThisWeek: number;
  revenueThisWeek: number;
  unpaidCount: number;
  unpaidTotal: number;
  paidThisMonth: number;
  outstandingThisMonth: number;
  pendingRequestsCount: number;
  onboardingNotSentCount: number;
  idleCleanersCount: number;
  unassignedJobsCount: number;
}

interface Props {
  kpi: KPI;
}

function fmt$(n: number) {
  return '$' + n.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function TodaySummary({ kpi }: Props) {
  const navigate = useNavigate();

  const rows = [
    {
      title: 'Today',
      items: [
        { label: 'Jobs Today', value: kpi.totalJobsToday, icon: Calendar, bg: 'bg-[hsl(162,72%,16%)]', text: 'text-white', path: '/schedule' },
        { label: 'In Progress', value: kpi.inProgressToday, icon: Clock, bg: 'bg-accent', text: 'text-accent-foreground', path: '/schedule?status=in_progress' },
        { label: 'Completed', value: kpi.completedToday, icon: CheckCircle, bg: 'bg-[hsl(162,72%,16%)]', text: 'text-white', path: '/schedule?status=complete' },
      ],
    },
    {
      title: 'This Week',
      items: [
        { label: 'Scheduled', value: kpi.scheduledThisWeek, icon: CalendarDays, bg: 'bg-[hsl(162,72%,16%)]', text: 'text-white', path: '/schedule' },
        { label: 'Completed', value: kpi.completedThisWeek, icon: CheckCircle, bg: 'bg-[hsl(162,72%,16%)]', text: 'text-white', path: '/schedule?status=complete' },
        { label: 'Revenue', value: fmt$(kpi.revenueThisWeek), icon: DollarSign, bg: 'bg-[hsl(50,100%,50%)]', text: 'text-[hsl(162,72%,16%)]', path: '/schedule?status=complete', isText: true },
      ],
    },
    {
      title: 'Financial',
      items: [
        { label: 'Unpaid Invoices', value: `${kpi.unpaidCount}`, subValue: fmt$(kpi.unpaidTotal), icon: Receipt, bg: 'bg-destructive', text: 'text-destructive-foreground', path: '/schedule?status=complete&invoice=unpaid', isText: true },
        { label: 'Paid This Month', value: fmt$(kpi.paidThisMonth), icon: DollarSign, bg: 'bg-[hsl(162,72%,16%)]', text: 'text-white', path: '/schedule', isText: true },
        { label: 'Outstanding', value: fmt$(kpi.outstandingThisMonth), icon: AlertTriangle, bg: 'bg-[hsl(50,100%,50%)]', text: 'text-[hsl(162,72%,16%)]', path: '/schedule?status=complete', isText: true },
      ],
    },
    {
      title: 'Alerts',
      items: [
        ...(kpi.pendingRequestsCount > 0 ? [{ label: 'Booking Requests', value: kpi.pendingRequestsCount, icon: CalendarPlus, bg: 'bg-[hsl(50,100%,50%)]', text: 'text-[hsl(162,72%,16%)]', path: '/requests' }] : []),
        ...(kpi.onboardingNotSentCount > 0 ? [{ label: 'Onboarding Unsent', value: kpi.onboardingNotSentCount, icon: FileText, bg: 'bg-[hsl(50,100%,50%)]', text: 'text-[hsl(162,72%,16%)]', path: '/clients' }] : []),
        ...(kpi.idleCleanersCount > 0 ? [{ label: 'Idle Cleaners', value: kpi.idleCleanersCount, icon: Users, bg: 'bg-[hsl(50,100%,50%)]', text: 'text-[hsl(162,72%,16%)]', path: '/staff' }] : []),
        ...(kpi.unassignedJobsCount > 0 ? [{ label: 'Unassigned Jobs', value: kpi.unassignedJobsCount, icon: UserX, bg: 'bg-destructive', text: 'text-destructive-foreground', path: '/schedule' }] : []),
      ],
    },
  ];

  // Filter out empty alert row
  const visibleRows = rows.filter(r => r.items.length > 0);

  return (
    <div className="space-y-6">
      {visibleRows.map((row) => (
        <div key={row.title}>
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">{row.title}</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {row.items.map((stat: any) => (
              <div
                key={stat.label}
                onClick={() => navigate(stat.path)}
                className="bg-card rounded-2xl shadow-sm border border-border p-4 cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`h-10 w-10 rounded-xl ${stat.bg} ${stat.text} flex items-center justify-center shrink-0`}>
                    <stat.icon className="h-5 w-5" />
                  </div>
                  <p className="text-xs font-semibold text-muted-foreground leading-tight">{stat.label}</p>
                </div>
                <p className={`font-extrabold text-foreground ${stat.isText ? 'text-xl' : 'text-3xl'}`}>
                  {stat.value}
                </p>
                {stat.subValue && (
                  <p className="text-sm font-bold text-muted-foreground mt-0.5">{stat.subValue}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
