export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl shadow-sm border border-border/50 p-5">
      <h3 className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: '#FEDB00' }}>{title}</h3>
      {children}
    </div>
  );
}

export function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground text-xs">{label}</span>
      <p className="font-semibold text-sm text-foreground">{value}</p>
    </div>
  );
}
