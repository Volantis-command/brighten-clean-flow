import { Badge } from '@/components/ui/badge';
import { Check } from 'lucide-react';

interface InvoiceBadgeProps {
  status: string | null | undefined;
}

export function InvoiceBadge({ status }: InvoiceBadgeProps) {
  if (!status || status === 'none') {
    return <Badge variant="secondary" className="text-[10px] px-2 py-0.5">No Invoice</Badge>;
  }

  const config: Record<string, { label: string; className: string; icon?: boolean }> = {
    draft: { label: 'Draft', className: 'bg-[hsl(var(--accent))] text-accent-foreground border-transparent' },
    sent: { label: 'Sent', className: 'bg-[rgba(96,165,250,0.15)] text-[#60A5FA] border-transparent' },
    awaiting_approval: { label: 'Awaiting Approval', className: 'bg-[hsl(45,100%,90%)] text-[hsl(45,100%,25%)] border-transparent' },
    awaiting_payment: { label: 'Awaiting Payment', className: 'bg-[hsl(45,100%,90%)] text-[hsl(45,100%,25%)] border-transparent' },
    paid: { label: 'Paid', className: 'bg-primary text-primary-foreground border-transparent', icon: true },
    voided: { label: 'Voided', className: 'bg-muted text-muted-foreground border-transparent line-through' },
  };

  const c = config[status] || config.draft;
  return (
    <Badge className={`text-[10px] px-2 py-0.5 gap-1 ${c.className}`}>
      {c.icon && <Check className="h-3 w-3" />}
      {c.label}
    </Badge>
  );
}
