import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, MapPin, FileText, Phone, Mail, Home, Wrench, Loader2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  lead: any;
  open: boolean;
  onClose: () => void;
}

function timeAgo(iso?: string) {
  if (!iso) return '';
  const secs = (Date.now() - new Date(iso).getTime()) / 1000;
  if (secs < 3600) return `${Math.max(1, Math.round(secs / 60))} min ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)} hr ago`;
  const days = Math.round(secs / 86400);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

// The story + recommended action for each stage — so you know exactly what
// they did and what to do next, at a glance.
function stageInfo(lead: any) {
  const q = lead.total_inc_gst != null ? `$${Math.round(Number(lead.total_inc_gst))}` : (lead.form_data?.quoted_inc_gst ? `$${Math.round(Number(lead.form_data.quoted_inc_gst))}` : null);
  const type = lead.clean_type || 'clean';
  const size = (lead.bedrooms || lead.bathrooms) ? `${lead.bedrooms || '?'}bd/${lead.bathrooms || '?'}ba ` : '';
  const ago = timeAgo(lead.created_at || lead.form_submitted_at);
  const mode = lead.form_data?.mode;
  switch (lead.status) {
    case 'price_viewed':
      return { emoji: '👀', title: 'Viewed their price — not booked', tone: 'border-[#8AA0A0] bg-[rgba(138,160,160,0.12)]',
        story: `Saw an instant quote of ${q || '—'} for a ${size}${type} ${ago} and entered their details to see it. They haven't accepted or booked.`,
        action: 'Follow up — a quick call or text to win the job.' };
    case 'info_requested':
      return { emoji: '💬', title: 'Wants a call', tone: 'border-[#C08A3E] bg-[rgba(192,138,62,0.12)]',
        story: `Got a quote of ${q || '—'} for a ${size}${type} ${ago}, then asked you to call — they have a question before deciding.`,
        action: 'Call them now — they\'re waiting to hear from you.' };
    case 'booking_requested':
      return { emoji: '✅', title: mode === 'residential' ? 'Booked in' : 'Wants to book (Airbnb)', tone: 'border-emerald-400 bg-emerald-50',
        story: mode === 'residential'
          ? `Accepted ${q || 'their quote'} for a ${type} and picked a slot ${ago} — the clean is already in your Schedule.`
          : `Accepted ${q || 'their quote'} for an Airbnb turnover ${ago}. Airbnb dates track guest checkouts, so this one needs setting up with them.`,
        action: mode === 'residential' ? 'Add to clients & assign a cleaner to the booked clean.' : 'Add to clients, then confirm the turnover schedule with them.' };
    case 'quote_sent':
    case 'awaiting_client_response':
      return { emoji: '📤', title: 'Quote sent', tone: 'border-[#5E93A0] bg-[rgba(94,147,160,0.12)]',
        story: `You sent them a quote of ${q || '—'}. Waiting on their response.`,
        action: 'Give them a nudge if they\'ve gone quiet.' };
    case 'accepted':
    case 'client_accepted':
      return { emoji: '🎉', title: 'Accepted the quote', tone: 'border-emerald-400 bg-emerald-50',
        story: `Accepted their ${q || 'quote'} ${ago}.`,
        action: 'Add to clients & get them scheduled.' };
    default:
      return { emoji: '🟡', title: 'New enquiry', tone: 'border-[#C08A3E] bg-[rgba(251,191,36,0.12)]',
        story: `Enquired about a ${type} ${ago}.`,
        action: 'Review and follow up.' };
  }
}

export default function LeadDetailSlideOver({ lead, open, onClose }: Props) {
  const [addingClient, setAddingClient] = useState(false);
  if (!lead) return null;

  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || '—';
  const preferredDate = lead.preferred_date
    ? new Date(lead.preferred_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : lead.asap ? 'As Soon As Possible' : null;
  const s = stageInfo(lead);

  const handleCall = () => { if (lead.phone) window.location.href = `tel:${lead.phone}`; };

  const handleAddClient = async () => {
    setAddingClient(true);
    try {
      const { error } = await supabase.functions.invoke('link-intake-to-profile', {
        body: {
          first_name: lead.first_name, last_name: lead.last_name,
          full_name: name, phone: lead.phone || null, email: lead.email || null,
          property_address: lead.address || `${name}'s property`,
          bedrooms: lead.bedrooms || null, bathrooms: lead.bathrooms || null,
          clean_type: lead.clean_type || 'Standard Clean',
        },
      });
      if (error) throw error;
      toast.success(`${name} added to Clients`);
    } catch (e: any) {
      toast.error(e.message || 'Could not add to clients');
    } finally {
      setAddingClient(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto bg-card">
        <SheetHeader className="mb-4">
          <SheetTitle className="text-xl font-extrabold text-foreground">{name}</SheetTitle>
        </SheetHeader>

        {/* ── The story: what they did + what to do ── */}
        <div className={`rounded-2xl border p-4 mb-5 ${s.tone}`}>
          <div className="text-lg font-extrabold text-foreground">{s.emoji} {s.title}</div>
          <p className="text-sm text-foreground/80 mt-1.5 leading-relaxed">{s.story}</p>
          <div className="mt-3 rounded-xl bg-card/70 border border-border px-3 py-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Your move</p>
            <p className="text-sm font-semibold text-foreground mt-0.5">→ {s.action}</p>
          </div>
        </div>

        <div className="space-y-5 text-sm">
          <div className="space-y-2">
            <p className="font-bold text-muted-foreground uppercase text-xs tracking-wide">Contact</p>
            {lead.phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-primary" /><a href={`tel:${lead.phone}`} className="text-foreground font-semibold">{lead.phone}</a></div>}
            {lead.email && <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-primary" /><span className="text-foreground">{lead.email}</span></div>}
          </div>

          <div className="space-y-2">
            <p className="font-bold text-muted-foreground uppercase text-xs tracking-wide">Property & clean</p>
            {lead.address && <div className="flex items-start gap-2"><MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" /><span className="text-foreground">{lead.address}</span></div>}
            <div className="flex items-center gap-2"><Home className="w-4 h-4 text-primary" /><span className="text-foreground">{lead.bedrooms || '?'} bed · {lead.bathrooms || '?'} bath</span></div>
            {lead.clean_type && <div className="flex items-center gap-2"><Wrench className="w-4 h-4 text-primary" /><span className="text-foreground font-semibold">{lead.clean_type}</span></div>}
            {lead.total_inc_gst != null && <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /><span className="text-foreground font-bold">Quoted ${Math.round(Number(lead.total_inc_gst))} inc GST</span></div>}
          </div>

          {(preferredDate || lead.time_preference) && (
            <div className="space-y-2">
              <p className="font-bold text-muted-foreground uppercase text-xs tracking-wide">Preferred timing</p>
              {preferredDate && <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" /><span className="text-foreground font-semibold">{preferredDate}</span></div>}
              {lead.time_preference && <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /><span className="text-foreground">{lead.time_preference}</span></div>}
            </div>
          )}

          {lead.extra_notes && (
            <div className="space-y-2">
              <p className="font-bold text-muted-foreground uppercase text-xs tracking-wide">Notes</p>
              <div className="flex items-start gap-2"><FileText className="w-4 h-4 text-primary mt-0.5" /><span className="text-foreground">{lead.extra_notes}</span></div>
            </div>
          )}
        </div>

        <div className="mt-8 space-y-3">
          {lead.phone && (
            <Button onClick={handleCall} className="w-full h-12 font-bold bg-primary text-primary-foreground">
              <Phone className="w-4 h-4" /> Call {lead.phone}
            </Button>
          )}
          <Button variant="outline" onClick={handleAddClient} disabled={addingClient} className="w-full h-12 font-bold gap-2">
            {addingClient ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Add to Clients
          </Button>
          <Button variant="ghost" onClick={onClose} className="w-full h-11">Close</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
