import { Calendar, CheckCircle, Clock, AlertTriangle } from 'lucide-react';

export default function DashboardPage() {
  const stats = [
    { label: 'Jobs Today', value: '0', icon: Calendar, color: 'bg-primary' },
    { label: 'Completed', value: '0', icon: CheckCircle, color: 'bg-accent' },
    { label: 'In Progress', value: '0', icon: Clock, color: 'bg-secondary' },
    { label: 'Flagged', value: '0', icon: AlertTriangle, color: 'bg-destructive' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-primary">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-card rounded-2xl shadow-md p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className={`h-10 w-10 rounded-xl ${stat.color} flex items-center justify-center`}>
                <stat.icon className="h-5 w-5 text-primary-foreground" />
              </div>
            </div>
            <p className="text-3xl font-extrabold text-foreground">{stat.value}</p>
            <p className="text-sm font-semibold text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-2xl shadow-md p-6">
        <h2 className="text-lg font-bold text-primary mb-4">Today's Schedule</h2>
        <p className="text-muted-foreground">No jobs scheduled for today.</p>
      </div>
    </div>
  );
}
