import { format } from 'date-fns';

interface IssuesListProps {
  issues: any[];
}

export default function IssuesList({ issues }: IssuesListProps) {
  if (!issues.length) return null;

  return (
    <div className="space-y-3">
      {issues.map((issue: any) => (
        <div
          key={issue.id}
          className={`rounded-xl p-4 border ${
            issue.status === 'open'
              ? 'border-destructive/30 bg-destructive/5'
              : 'border-border bg-muted/50'
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold text-sm">{issue.room}</p>
              <p className="text-sm text-muted-foreground">{issue.description}</p>
              {issue.reported_at && (
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(issue.reported_at), 'dd MMM yyyy, h:mm a')}
                </p>
              )}
            </div>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                issue.status === 'open'
                  ? 'bg-destructive/10 text-destructive'
                  : issue.status === 'acknowledged'
                  ? 'bg-accent/20 text-accent-foreground'
                  : 'bg-primary/10 text-primary'
              }`}
            >
              {issue.status}
            </span>
          </div>
          {issue.photo_url && (
            <img src={issue.photo_url} alt="Issue" className="w-24 h-24 object-cover rounded-lg mt-2" />
          )}
        </div>
      ))}
    </div>
  );
}
