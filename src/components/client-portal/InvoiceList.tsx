import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { FileText } from 'lucide-react';

interface InvoiceListProps {
  jobs: any[];
  properties: any[];
}

function invoiceStatusBadge(status: string | null) {
  // Source of truth for jobs.invoice_status values — see xero-sync-invoice-status
  // status map: draft, sent (incl. authorised/submitted), paid, voided, none.
  if (status === 'paid') return { label: 'Paid', cls: 'bg-brightly/10 text-brightly' };
  if (status === 'sent') return { label: 'Sent', cls: 'bg-blue-100 text-blue-800' };
  if (status === 'authorised') return { label: 'Sent', cls: 'bg-blue-100 text-blue-800' };
  if (status === 'draft' || status === 'raised') return { label: 'Draft', cls: 'bg-yellow-100 text-yellow-800' };
  if (status === 'voided') return { label: 'Voided', cls: 'bg-muted text-muted-foreground line-through' };
  return { label: 'Not Raised', cls: 'bg-muted text-muted-foreground' };
}

export default function InvoiceList({ jobs, properties }: InvoiceListProps) {
  // Show jobs that have invoice data
  const invoiceJobs = jobs.filter(
    (j: any) => j.invoice_status && j.invoice_status !== 'not_raised'
  );

  const getPropertyName = (propId: string) => {
    const p = properties.find((pr: any) => pr.id === propId);
    return p ? (p.property_name || p.address) : 'Property';
  };

  if (invoiceJobs.length === 0) {
    return (
      <div className="text-center py-8">
        <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
        <p className="text-muted-foreground text-sm">No invoices yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {invoiceJobs.map((job: any) => {
        const st = invoiceStatusBadge(job.invoice_status);
        return (
          <div key={job.id} className="bg-card rounded-2xl border border-border/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-sm text-foreground">
                  {format(new Date(job.scheduled_date + 'T00:00:00'), 'dd MMM yyyy')}
                  {job.xero_invoice_number ? ` — #${job.xero_invoice_number}` : ''}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {getPropertyName(job.property_id)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {job.invoice_amount && (
                  <span className="font-bold text-sm text-foreground">
                    ${Number(job.invoice_amount).toFixed(2)}
                  </span>
                )}
                <Badge className={`${st.cls} text-[10px]`}>{st.label}</Badge>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
