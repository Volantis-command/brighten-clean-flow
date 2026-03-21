import { Badge } from '@/components/ui/badge';

interface InvoiceBadgeProps {
  status: string | null | undefined;
}

export function InvoiceBadge({ status }: InvoiceBadgeProps) {
  if (!status || status === 'none') {
    return <Badge variant="secondary" className="text-[10px] px-2 py-0.5">No Invoice</Badge>;
  }

  const config: Record<string, { label: string; className: string }> = {
    draft: { label: 'Draft', className: 'bg-[#FEDB00] text-foreground border-transparent' },
    sent: { label: 'Sent', className: 'bg-blue-100 text-blue-800 border-transparent' },
    paid: { label: 'Paid', className: 'bg-primary text-primary-foreground border-transparent' },
  };

  const c = config[status] || config.draft;
  return <Badge className={`text-[10px] px-2 py-0.5 ${c.className}`}>{c.label}</Badge>;
}
