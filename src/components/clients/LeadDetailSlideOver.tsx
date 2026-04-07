import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, MapPin, FileText, Phone, Mail, Home, Wrench } from 'lucide-react';

interface Props {
  lead: any;
  open: boolean;
  onClose: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  pending_form: 'Pending Form',
  form_submitted: 'Form Submitted',
  awaiting_quote: 'Awaiting Quote',
  quote_sent: 'Quote Sent',
  awaiting_client_response: 'Awaiting Response',
  quote_declined: 'Declined',
  declined: 'Declined',
};

export default function LeadDetailSlideOver({ lead, open, onClose }: Props) {
  const navigate = useNavigate();
  if (!lead) return null;

  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || '—';
  const preferredDate = lead.preferred_date
    ? new Date(lead.preferred_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : lead.asap ? 'As Soon As Possible' : null;

  const handleSendQuote = () => {
    onClose();
    navigate('/quoting', { state: { quoteRequestId: lead.id } });
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto bg-card">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-xl font-extrabold text-foreground">{name}</SheetTitle>
          <Badge variant="outline" className="w-fit text-xs">
            {STATUS_LABELS[lead.status] || lead.status}
          </Badge>
        </SheetHeader>

        <div className="space-y-5 text-sm">

          {/* Contact */}
          <div className="space-y-2">
            <p className="font-bold text-muted-foreground uppercase text-xs tracking-wide">Contact</p>
            {lead.phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-primary" /><a href={`tel:${lead.phone}`} className="text-foreground font-semibold">{lead.phone}</a></div>}
            {lead.email && <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-primary" /><span className="text-foreground">{lead.email}</span></div>}
          </div>

          {/* Property */}
          <div className="space-y-2">
            <p className="font-bold text-muted-foreground uppercase text-xs tracking-wide">Property</p>
            {lead.address && <div className="flex items-start gap-2"><MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" /><span className="text-foreground">{lead.address}</span></div>}
            <div className="flex items-center gap-2"><Home className="w-4 h-4 text-primary" /><span className="text-foreground">{lead.bedrooms || '?'} bed · {lead.bathrooms || '?'} bath</span></div>
            {lead.property_type && <div className="flex items-center gap-2"><Home className="w-4 h-4 text-muted-foreground" /><span className="text-muted-foreground capitalize">{lead.property_type}</span></div>}
          </div>

          {/* Clean Details */}
          <div className="space-y-2">
            <p className="font-bold text-muted-foreground uppercase text-xs tracking-wide">Clean Requested</p>
            {lead.clean_type && <div className="flex items-center gap-2"><Wrench className="w-4 h-4 text-primary" /><span className="text-foreground font-semibold">{lead.clean_type}</span></div>}
            {lead.extras && lead.extras.length > 0 && <div className="flex items-start gap-2"><Wrench className="w-4 h-4 text-muted-foreground mt-0.5" /><span className="text-muted-foreground">Extras: {Array.isArray(lead.extras) ? lead.extras.join(', ') : lead.extras}</span></div>}
          </div>

          {/* Timing */}
          <div className="space-y-2">
            <p className="font-bold text-muted-foreground uppercase text-xs tracking-wide">Preferred Timing</p>
            {preferredDate && <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" /><span className="text-foreground font-semibold">{preferredDate}</span></div>}
            {lead.time_preference && <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /><span className="text-foreground">{lead.time_preference}</span></div>}
          </div>

          {/* Access */}
          {(lead.access_method || lead.access_instructions || lead.parking) && (
            <div className="space-y-2">
              <p className="font-bold text-muted-foreground uppercase text-xs tracking-wide">Access</p>
              {lead.access_method && <div className="flex items-start gap-2"><MapPin className="w-4 h-4 text-primary mt-0.5" /><span className="text-foreground capitalize">{lead.access_method}</span></div>}
              {lead.access_instructions && <div className="flex items-start gap-2"><FileText className="w-4 h-4 text-muted-foreground mt-0.5" /><span className="text-muted-foreground">{lead.access_instructions}</span></div>}
              {lead.parking && <div className="flex items-start gap-2"><MapPin className="w-4 h-4 text-muted-foreground mt-0.5" /><span className="text-muted-foreground">Parking: {lead.parking}</span></div>}
            </div>
          )}

          {/* Notes */}
          {lead.notes && (
            <div className="space-y-2">
              <p className="font-bold text-muted-foreground uppercase text-xs tracking-wide">Client Notes</p>
              <div className="flex items-start gap-2"><FileText className="w-4 h-4 text-primary mt-0.5" /><span className="text-foreground">{lead.notes}</span></div>
            </div>
          )}

          {/* Source */}
          {lead.source && (
            <div className="text-xs text-muted-foreground">Source: {lead.source} · Submitted: {lead.created_at ? new Date(lead.created_at).toLocaleString('en-AU') : '—'}</div>
          )}
        </div>

        <div className="mt-8 space-y-3">
          <Button onClick={handleSendQuote} className="w-full h-12 font-bold bg-primary text-[#0C463D]">
            Open in Quote Calculator
          </Button>
          <Button variant="outline" onClick={onClose} className="w-full h-12">
            Close
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
