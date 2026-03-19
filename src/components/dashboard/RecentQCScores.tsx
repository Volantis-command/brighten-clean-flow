interface QCScore {
  id: string;
  cleanerName: string;
  propertyName: string;
  percentage: number;
  result: string;
}

interface RecentQCScoresProps {
  scores: QCScore[];
}

export function RecentQCScores({ scores }: RecentQCScoresProps) {
  if (scores.length === 0) {
    return (
      <div>
        <h2 className="text-xl font-bold text-primary mb-4">Recent QC Scores</h2>
        <div className="bg-card rounded-2xl shadow-md p-5">
          <p className="text-muted-foreground text-sm">No QC audits yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-primary mb-4">Recent QC Scores</h2>
      <div className="space-y-3">
        {scores.map((score) => (
          <div key={score.id} className="bg-card rounded-2xl shadow-md p-5 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="font-bold text-foreground truncate">{score.cleanerName}</p>
              <p className="text-sm text-muted-foreground truncate">{score.propertyName}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xl font-extrabold text-foreground">{score.percentage}%</span>
              <span
                className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                  score.result === 'pass'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-destructive text-destructive-foreground'
                }`}
              >
                {score.result === 'pass' ? 'Pass' : 'Fail'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
