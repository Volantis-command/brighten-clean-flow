import { Calendar, CheckCircle, Clock, AlertTriangle } from 'lucide-react';

interface TodaySummaryProps {
  totalJobs: number;
  completeCount: number;
  inProgressCount: number;
  flaggedCount: number;
}

export function TodaySummary({ totalJobs, completeCount, inProgressCount, flaggedCount }: TodaySummaryProps) {
  const stats = [
    { label: 'Jobs Today', value: totalJobs, icon: Calendar, className: 'bg-primary text-primary-foreground' },
    { label: 'Complete', value: completeCount, icon: CheckCircle, className: 'bg-primary text-primary-foreground' },
    { label: 'In Progress', value: inProgressCount, icon: Clock, className: 'bg-accent text-accent-foreground' },
    { label: 'Flagged', value: flaggedCount, icon: AlertTriangle, className: 'bg-destructive text-destructive-foreground' },
  ];

  return (
    <div>
      <h2 className="text-xl font-bold text-primary mb-4">Today's Summary</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-card rounded-2xl shadow-md p-5">
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
