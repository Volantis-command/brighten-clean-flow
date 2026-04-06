import { Star } from 'lucide-react';

interface TeamMember {
  id: string;
  name: string;
  jobCount: number;
  avgRating: number | null;
  hoursWorked: number;
  isActive: boolean;
}

interface TeamPerformanceTableProps {
  data: TeamMember[];
}

export function TeamPerformanceTable({ data }: TeamPerformanceTableProps) {
  if (data.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Team Performance — This Week</h2>
      <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs font-bold text-muted-foreground uppercase px-5 py-3">Cleaner</th>
                <th className="text-center text-xs font-bold text-muted-foreground uppercase px-3 py-3">Jobs</th>
                <th className="text-center text-xs font-bold text-muted-foreground uppercase px-3 py-3">Avg Rating</th>
                <th className="text-center text-xs font-bold text-muted-foreground uppercase px-3 py-3">Hours</th>
                <th className="text-center text-xs font-bold text-muted-foreground uppercase px-3 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((member, idx) => (
                <tr key={member.id} className="last:border-0 hover:bg-muted/30 transition-colors" style={{ background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-extrabold shrink-0">
                        {member.name.charAt(0)}
                      </span>
                      <span className="font-semibold text-sm text-foreground">{member.name}</span>
                    </div>
                  </td>
                  <td className="text-center px-3 py-3">
                    <span className="text-sm font-bold text-foreground">{member.jobCount}</span>
                  </td>
                  <td className="text-center px-3 py-3">
                    {member.avgRating != null ? (
                      <span className="inline-flex items-center gap-1 text-sm font-bold text-foreground">
                        <Star className="h-3.5 w-3.5 fill-[hsl(45,100%,51%)] text-[hsl(45,100%,51%)]" />
                        {member.avgRating.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="text-center px-3 py-3">
                    <span className="text-sm font-semibold text-foreground">
                      {member.hoursWorked > 0 ? `${member.hoursWorked}h` : '—'}
                    </span>
                  </td>
                  <td className="text-center px-3 py-3">
                    {member.isActive ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                        Active
                      </span>
                    ) : member.jobCount > 0 ? (
                      <span className="text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Idle</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">No jobs</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
