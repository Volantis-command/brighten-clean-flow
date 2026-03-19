interface ClockedInCleaner {
  name: string;
  propertyName: string;
}

interface LiveStatusStripProps {
  clockedInCleaners: ClockedInCleaner[];
}

export function LiveStatusStrip({ clockedInCleaners }: LiveStatusStripProps) {
  if (clockedInCleaners.length === 0) {
    return (
      <div className="bg-card rounded-2xl shadow-md p-5">
        <h2 className="text-xl font-bold text-primary mb-3">Live Status</h2>
        <p className="text-muted-foreground text-sm">No cleaners currently clocked in.</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl shadow-md p-5">
      <h2 className="text-xl font-bold text-primary mb-3">Live Status</h2>
      <div className="flex flex-wrap gap-3">
        {clockedInCleaners.map((cleaner, idx) => (
          <div
            key={idx}
            className="flex items-center gap-2 bg-secondary rounded-2xl px-4 py-2.5"
          >
            <span className="h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />
            <span className="text-sm font-bold text-foreground">{cleaner.name}</span>
            <span className="text-sm text-muted-foreground">@ {cleaner.propertyName}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
