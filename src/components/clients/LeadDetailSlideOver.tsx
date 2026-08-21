import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, MapPin, FileText, Phone, Mail, Home, Wrench, Loader2, UserPlus, FilePen, CheckCircle2, CalendarCheck } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { OPEN_STAGES, stageDef, type LeadStage } from '@/lib/leadPipeline';
import LeadConversation from '@/components/clients/LeadConversation';

interface Props {
  lead: any;
  open: boolean;
  onClose: () => void;
  /** Supplied by the pipeline board so a lead can be moved without leaving it. */
  onMoveStage?: (lead: any, stage: LeadStage) => void;
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
    case 'booking_requested': {
      const pref = lead.preferred_date
        ? new Date(lead.preferred_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
        : null;
      return { emoji: '🔔', title: mode === 'residential' ? 'Wants to book — needs your approval' : 'Wants to book (Airbnb)', tone: 'border-emerald-400 bg-emerald-50',
        story: mode === 'residential'
          ? `Accepted ${q || 'their quote'} for a ${type} and asked for ${pref || 'a slot'} ${ago}. Approve it and the clean drops onto that date in your Schedule (pending a cleaner).`
          : `Accepted ${q || 'their quote'} for an Airbnb turnover ${ago}. Airbnb dates track guest checkouts, so this one needs setting up with them.`,
        action: mode === 'residential' ? `Approve & schedule the clean${pref ? ` for ${pref}` : ''}.` : 'Add to clients, then confirm the turnover schedule with them.' };
    }
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

export default function LeadDetailSlideOver({ lead, open, onClose, onMoveStage }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [addingClient, setAddingClient] = useState(false);
  const [approving, setApproving] = useState(false);

  // NOTE: every hook below must run on EVERY render, including the renders
  // where there is no lead yet. This component stays mounted while the list is
  // open, so `lead` flips between null and an object. An early `if (!lead)
  // return null` used to sit above useQuery, which meant React saw four hooks
  // on one render and five on the next, and threw "Rendered more hooks than
  // during the previous render" (#310) — the app crashed to a black screen.
  // The guard now lives below the hooks, and the query simply stays disabled
  // until there is a lead to look up.
  const leadFullName = [lead?.first_name, lead?.last_name].filter(Boolean).join(' ');
  const { data: scheduledJob } = useQuery({
    queryKey: ['lead-scheduled-job', lead?.id ?? null, leadFullName],
    queryFn: async () => {
      if (!leadFullName) return null;
      const { data } = await supabase
        .from('jobs')
        .select('id, scheduled_date, scheduled_time, status, cleaner_1_id')
        .eq('client_name', leadFullName)
        .neq('status', 'cancelled')
        .order('scheduled_date', { ascending: false })
        .limit(1);
      return data?.[0] ?? null;
    },
    enabled: !!lead && !!leadFullName,
  });

  // Safe to bail out now — every hook above has already run.
  if (!lead) return null;

  // Approve is offered whenever they've asked for a date, it's not an Airbnb
  // turnover, and no clean exists yet — so it stays available if approval ever
  // fails, and disappears once the clean is actually in the Schedule.
  const canApprove = ['booking_requested', 'accepted', 'client_accepted'].includes(lead.status)
    && lead.form_data?.mode !== 'airbnb'
    && !!lead.preferred_date
    && !scheduledJob;

  const handleApprove = async () => {
    setApproving(true);
    try {
      const nm = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Client';
      const { data, error } = await supabase.functions.invoke('link-intake-to-profile', {
        body: {
          first_name: lead.first_name, last_name: lead.last_name, full_name: nm,
          phone: lead.phone || null, email: lead.email || null,
          property_address: lead.address || `${nm}'s property`,
          bedrooms: lead.bedrooms || null, bathrooms: lead.bathrooms || null,
          clean_type: lead.clean_type || 'Standard Clean',
          create_job: true,
          scheduled_date: lead.preferred_date,
          scheduled_time: lead.preferred_time || null,
          price_inc_gst: lead.total_inc_gst ?? null,
          price_ex_gst: lead.total_ex_gst ?? null,
          estimated_hours: lead.estimated_hours ?? null,
        },
      });
      if (error) throw error;
      if (!data?.job_id) throw new Error('Could not create the clean — check the address on the lead and try again.');
      await supabase.from('quote_requests').update({ status: 'accepted' } as any).eq('id', lead.id);

      // Booking someone in makes them a client, so say so in the data rather
      // than relying on the Clients page inferring it from their jobs. That
      // inference works, but only once a second query has caught up, so the
      // person can appear to be missing in the meantime.
      if (data?.client_profile_id) {
        await supabase.from('profiles')
          .update({ lead_stage: 'active' } as any)
          .eq('id', data.client_profile_id);
      }

      queryClient.invalidateQueries({ queryKey: ['lead-scheduled-job'] });
      queryClient.invalidateQueries({ queryKey: ['quote-requests-leads'] });
      queryClient.invalidateQueries({ queryKey: ['clients-list'] });
      queryClient.invalidateQueries({ queryKey: ['client-lead-stages'] });
      queryClient.invalidateQueries({ queryKey: ['property-ids-with-jobs'] });
      toast.success(`Approved, ${nm}'s clean is in your Schedule and she's now in Clients. Assign a cleaner next.`);
    } catch (e: any) {
      toast.error(e.message || 'Could not approve the booking');
    } finally {
      setApproving(false);
    }
  };

  // Open the Quote Builder pre-filled with this lead's config so you can edit
  // the quote and send it back. The lead stays the source of truth — sending
  // updates THIS lead (not a duplicate). See AirbnbQuotePage prefill handling.
  const handleEditQuote = () => {
    navigate('/airbnb-quote', { state: { prefillLead: lead } });
    onClose();
  };

  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || '—';
  const preferredDate = lead.preferred_date
    ? new Date(lead.preferred_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : lead.asap ? 'As Soon As Possible' : null;
  const s = stageInfo(lead);

  const handleCall = () => { if (lead.phone) window.location.href = `tel:${lead.phone}`; };

  const handleAddClient = async () => {
    setAddingClient(true);
    try {
      const { data, error } = await supabase.functions.invoke('link-intake-to-profile', {
        body: {
          first_name: lead.first_name, last_name: lead.last_name,
          full_name: name, phone: lead.phone || null, email: lead.email || null,
          property_address: lead.address || `${name}'s property`,
          bedrooms: lead.bedrooms || null, bathrooms: lead.bathrooms || null,
          clean_type: lead.clean_type || 'Standard Clean',
        },
      });
      if (error) throw error;

      // The profile now exists, but the Clients page splits people into
      // Active clients and Leads, and it decides using profiles.lead_stage:
      //   active = lead_stage 'active', OR they already have a clean booked.
      // Creating the profile sets neither, so pressing "Add to Clients" used
      // to drop them into the LEADS tab, which is where they already were.
      // The toast said "added to Clients" and nothing appeared to change.
      // Mark them active explicitly, which is exactly what the "Move to
      // Active" button on the Clients page does.
      const profileId = (data as any)?.client_profile_id;
      if (profileId) {
        const { error: stageErr } = await supabase
          .from('profiles')
          .update({ lead_stage: 'active' } as any)
          .eq('id', profileId);
        if (stageErr) throw new Error(`Added, but could not move to Active: ${stageErr.message}`);
      }

      // Refresh the Clients page so she is there the moment you switch tabs.
      queryClient.invalidateQueries({ queryKey: ['clients-list'] });
      queryClient.invalidateQueries({ queryKey: ['client-lead-stages'] });
      queryClient.invalidateQueries({ queryKey: ['property-ids-with-jobs'] });

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
            <p className="text-sm font-semibold text-foreground mt-0.5">
              → {scheduledJob
                ? (scheduledJob.cleaner_1_id ? 'Nothing — this one\'s scheduled and covered.' : 'Assign a cleaner to the scheduled clean.')
                : s.action}
            </p>
          </div>
        </div>

        {/* ── Already scheduled? Show it, so approval is never ambiguous ── */}
        {scheduledJob && (
          <button
            onClick={() => { navigate('/schedule'); onClose(); }}
            className="w-full text-left rounded-2xl border border-primary/40 bg-primary/5 p-4 mb-5"
          >
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-primary shrink-0" />
              <p className="text-sm font-extrabold text-foreground">Clean scheduled</p>
            </div>
            <p className="text-sm text-foreground mt-1.5 font-semibold">
              {new Date(scheduledJob.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              {scheduledJob.scheduled_time ? ` · ${String(scheduledJob.scheduled_time).slice(0, 5)}` : ''}
            </p>
            <p className="text-xs mt-1 text-muted-foreground">
              {scheduledJob.cleaner_1_id
                ? 'Cleaner assigned. Tap to view in Schedule.'
                : '⚠️ No cleaner assigned yet — tap to open Schedule and assign one.'}
            </p>
          </button>
        )}

        <div className="space-y-5 text-sm">
          <div className="space-y-2">
            <p className="font-bold text-muted-foreground uppercase text-xs tracking-wide">Contact</p>
            {lead.phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-primary" /><a href={`tel:${lead.phone}`} className="text-foreground font-semibold">{lead.phone}</a></div>}
            {lead.email && <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-primary" /><span className="text-foreground">{lead.email}</span></div>}
          </div>

          <div className="space-y-2">
            <p className="font-bold text-muted-foreground uppercase text-xs tracking-wide">Property & clean</p>
            {lead.address
              ? <div className="flex items-start gap-2"><MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" /><span className="text-foreground">{lead.address}</span></div>
              /* Say it out loud rather than just omitting the line. A missing
                 address is the thing that stops you scheduling, so it should
                 look like a job to do, not like nothing. */
              : <div className="flex items-start gap-2"><MapPin className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" /><span className="text-amber-600 font-semibold">No address on file — ask when you call</span></div>}
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
          {canApprove && (
            <Button onClick={handleApprove} disabled={approving} className="w-full h-12 font-bold bg-primary text-primary-foreground gap-2">
              {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Approve &amp; schedule
            </Button>
          )}
          <Button onClick={handleEditQuote}
            className={`w-full h-12 font-bold gap-2 ${canApprove ? 'bg-card border border-border text-foreground hover:bg-muted' : 'bg-primary text-primary-foreground'}`}
            variant={canApprove ? 'outline' : 'default'}>
            <FilePen className="w-4 h-4" /> Edit &amp; send quote
          </Button>
          {lead.phone && (
            <Button variant="outline" onClick={handleCall} className="w-full h-12 font-bold gap-2">
              <Phone className="w-4 h-4" /> Call {lead.phone}
            </Button>
          )}
          {/* The conversation, right where you decide what to do next. */}
          <LeadConversation leadId={lead.id} leadName={lead.first_name || ''} />

          {onMoveStage && (
            <div className="mb-1">
              <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">
                Stage: {stageDef(lead.stage).label}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {OPEN_STAGES.filter(st => st.key !== lead.stage).map(st => (
                  <button key={st.key} onClick={() => onMoveStage(lead, st.key)}
                    className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold text-muted-foreground hover:border-primary hover:text-primary">
                    {st.label}
                  </button>
                ))}
                <button onClick={() => onMoveStage(lead, 'lost')}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold text-muted-foreground hover:border-destructive hover:text-destructive">
                  Lost
                </button>
              </div>
            </div>
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
