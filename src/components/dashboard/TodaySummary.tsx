import { Calendar, CheckCircle, Clock, AlertTriangle, UserX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface TodaySummaryProps {
  totalJobs: number;
  completeCount: number;
  inProgressCount: number;
  flaggedCount: number;
  actionNeededCount?: number;
}

export function TodaySummary({ totalJobs, completeCount, inProgressCount, flaggedCount, actionNeededCount = 0 }: TodaySummaryProps) {
  const navigate = useNavigate();

  const stats = [
    { label: 'Jobs Today', value: totalJobs, icon: Calendar, className: 'bg-primary text-primary-foreground', path: '/schedule' },
    { label: 'Complete', value: completeCount, icon: CheckCircle, className: 'bg-primary text-primary-foreground', path: '/schedule?status=complete' },
    { label: 'In Progress', value: inProgressCount, icon: Clock, className: 'bg-accent text-accent-foreground', path: '/schedule?status=in_progress' },
    { label: 'Flagged', value: flaggedCount, icon: AlertTriangle, className: 'bg-destructive text-destructive-foreground', path: '/schedule?status=flagged' },
    { label: 'Action Needed', value: actionNeededCount, icon: UserX, className: 'bg-[hsl(45,100%,51%)] text-foreground', path: '/schedule?acceptance=declined' },
  ];

  return (
    <div>
      <h2 className="text-xl font-bold text-primary mb-4">Today's Summary</h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            onClick={() => navigate(stat.path)}
            className="bg-card rounded-2xl shadow-md p-5 cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98]"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={`h-10 w-10 rounded-xl ${stat.className} flex items-center justify-center`}>
                <stat.icon className="h-5 w-5" />
              </div>
            </div>
            <p className="text-3xl font-extrabold text-foreground">{stat.value}</p>
            <p className="text-sm font-semibold text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
