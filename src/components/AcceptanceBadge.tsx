import { Badge } from '@/components/ui/badge';

interface AcceptanceBadgeProps {
  status: string;
  compact?: boolean;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: '🟡 Pending', className: 'bg-[hsl(45,100%,51%)] text-foreground border-transparent' },
  accepted: { label: '✅ Accepted', className: 'bg-primary text-primary-foreground border-transparent' },
  declined: { label: '❌ Declined', className: 'bg-destructive text-destructive-foreground border-transparent' },
  no_phone: { label: '⚠️ No Phone', className: 'bg-muted text-muted-foreground border-transparent' },
};

export function AcceptanceBadge({ status, compact }: AcceptanceBadgeProps) {
  const config = statusConfig[status] || statusConfig.pending;
  return (
    <Badge className={`text-[10px] font-bold ${config.className} ${compact ? 'px-1.5 py-0.5' : ''}`}>
      {config.label}
    </Badge>
  );
}
