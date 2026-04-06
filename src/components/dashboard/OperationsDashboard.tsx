import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, differenceInHours } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronDown, Clock, Plus, Search, Send, DollarSign, ClipboardList, Star } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { SendQuoteLinkModal } from './SendQuoteLinkModal';

type PipelineStatus = 'new_enquiry' | 'quote_sent' | 'accepted' | 'scheduled' | 'in_progress' | 'complete';

const PIPELINE_STAGES: { key: PipelineStatus; label: string }[] = [
  { key: 'new_enquiry', label: 'New Enquiry' },
  { key: 'quote_sent', label: 'Quote Sent' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'complete', label: 'Complete' },
];

export default function OperationsDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [smsModalOpen, setSmsModalOpen] = useState(false);
  const now = new Date();
  const todayStr = format(now, 'yyyy-MM-dd');

  // Alerts
  const { data: alerts = [] } = useQuery({
    queryKey: ['ops-alerts'],
    queryFn: async () => {
      const alertItems: { type: string; color: string; icon: string; message: string; link?: string }[] = [];

      const { data: staleQuotes } = await supabase
        .from('quote_requests')
        .select('id, first_name, last_name, form_submitted_at, quote_sent_at, created_at, status')
        .in('status', ['form_submitted', 'quote_sent']);
      (staleQuotes || []).forEach((q: any) => {
        // For quote_sent status, use quote_sent_at first; otherwise fall back to form_submitted_at or created_at
        const refDate = q.status === 'quote_sent'
          ? (q.quote_sent_at || q.form_submitted_at || q.created_at)
          : (q.form_submitted_at || q.created_at);
        const hoursWaiting = refDate ? differenceInHours(now, new Date(refDate)) : 0;
        if (hoursWaiting > 24) {
          const days = Math.floor(hoursWaiting / 24);
          const statusLabel = q.status === 'quote_sent' ? 'Quote sent' : 'Quote not followed up';
          alertItems.push({
            type: 'stale_quote',
            color: days >= 2 ? 'bg-destructive' : 'bg-orange-500',
            icon: days >= 2 ? '🔴' : '🟠',
            message: `${statusLabel} ${days}d ago — ${q.first_name || ''} ${q.last_name || ''}`.trim(),
            link: `/quoting`,
          });
        }
      });

      const { data: quietClients } = await supabase
        .from('quote_requests')
        .select('id, first_name, last_name, accepted_at')
        .eq('status', 'accepted');
      (quietClients || []).forEach((q: any) => {
        if (q.accepted_at && differenceInHours(now, new Date(q.accepted_at)) > 48) {
          alertItems.push({ type: 'quiet_client', color: 'bg-orange-500', icon: '🟠', message: `Client went quiet: ${q.first_name} ${q.last_name}` });
        }
      });

      const { data: soonJobs } = await supabase
        .from('jobs')
        .select('id, scheduled_time, property_id, properties(property_name)')
        .eq('scheduled_date', todayStr)
        .in('status', ['scheduled', 'confirmed']);
      (soonJobs || []).forEach((j: any) => {
        if (j.scheduled_time) {
          const [h, m] = j.scheduled_time.split(':').map(Number);
          const jobTime = new Date();
          jobTime.setHours(h, m, 0, 0);
          const diff = (jobTime.getTime() - now.getTime()) / (1000 * 60 * 60);
          if (diff > 0 && diff <= 2) {
            alertItems.push({ type: 'soon', color: 'bg-blue-500', icon: '🔵', message: `Clean starting soon: ${(j as any).properties?.property_name || 'Property'}`, link: `/jobs/${j.id}` });
          }
        }
      });

      const { data: awaitingReview } = await supabase
        .from('jobs')
        .select('id, property_id, properties(property_name)')
        .eq('status', 'completed')
        .is('feedback_score', null)
        .limit(5);
      (awaitingReview || []).forEach((j: any) => {
        alertItems.push({ type: 'review', color: 'bg-green-500', icon: '🟢', message: `Awaiting review: ${(j as any).properties?.property_name || 'Property'}`, link: `/jobs/${j.id}` });
      });

      return alertItems;
    },
  });

  // Quick stats
  const { data: stats } = useQuery({
    queryKey: ['ops-stats'],
    queryFn: async () => {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const { data: weekJobs } = await supabase
        .from('jobs')
        .select('price_inc_gst')
        .in('status', ['completed', 'complete'])
        .gte('scheduled_date', format(weekStart, 'yyyy-MM-dd'));
      const weekRevenue = (weekJobs || []).reduce((s: number, j: any) => s + (j.price_inc_gst || 0), 0);

      const { count: outstandingQuotes } = await supabase
        .from('quote_requests')
        .select('id', { count: 'exact', head: true })
        .in('status', ['form_submitted', 'quote_sent']);

      const { count: cleansToday } = await supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('scheduled_date', todayStr);

      const { data: scores } = await supabase
        .from('job_feedback')
        .select('score')
        .not('score', 'is', null)
        .limit(100);
      const avgScore = (scores && scores.length > 0)
        ? (scores.reduce((s: number, f: any) => s + f.score, 0) / scores.length).toFixed(1)
        : '—';

      return { weekRevenue, outstandingQuotes: outstandingQuotes || 0, cleansToday: cleansToday || 0, avgScore };
    },
  });

  // Pipeline data
  const { data: pipeline = {} as Record<PipelineStatus, any[]> } = useQuery({
    queryKey: ['ops-pipeline'],
    queryFn: async () => {
      const result: Record<PipelineStatus, any[]> = {
        new_enquiry: [], quote_sent: [], accepted: [], scheduled: [], in_progress: [], complete: [],
      };

      const { data: qrs } = await supabase
        .from('quote_requests')
        .select('*')
        .in('status', ['form_submitted', 'quote_sent', 'accepted', 'booking_requested'])
        .order('created_at', { ascending: false });

      (qrs || []).forEach((q: any) => {
        if (q.status === 'form_submitted') result.new_enquiry.push(q);
        else if (q.status === 'quote_sent') result.quote_sent.push(q);
        else if (['accepted', 'booking_requested'].includes(q.status)) result.accepted.push(q);
      });

      const { data: jobs } = await supabase
        .from('jobs')
        .select('*, properties(property_name, address)')
        .in('status', ['scheduled', 'confirmed', 'in_progress', 'completed'])
        .gte('scheduled_date', format(new Date(Date.now() - 7 * 86400000), 'yyyy-MM-dd'))
        .order('scheduled_date', { ascending: false })
        .limit(100);

      (jobs || []).forEach((j: any) => {
        if (['scheduled', 'confirmed'].includes(j.status)) result.scheduled.push(j);
        else if (j.status === 'in_progress') result.in_progress.push(j);
        else if (j.status === 'completed') result.complete.push(j);
      });

      return result;
    },
  });

  // Auto-expand stages that have items
  const defaultExpanded = useMemo(() => {
    const expanded: Record<string, boolean> = {};
    PIPELINE_STAGES.forEach(s => {
      expanded[s.key] = (pipeline[s.key] || []).length > 0;
    });
    return expanded;
  }, [pipeline]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Merge: use user toggles over defaults
  const isExpanded = (key: string) =>
    expanded[key] !== undefined ? expanded[key] : defaultExpanded[key] ?? false;

  const toggle = (key: string) =>
    setExpanded(prev => ({ ...prev, [key]: !isExpanded(key) }));

  return (
    <div className="space-y-6 w-full max-w-[900px] mx-auto">
      {/* Alerts strip */}
      {alerts.length > 0 && (
        <div className="space-y-2 slide-down">
          {alerts.slice(0, 5).map((a, i) => {
            const isRed = a.color === 'bg-destructive';
            const isAmber = a.color === 'bg-orange-500';
            const isBlue = a.color === 'bg-blue-500';
            const accentColor = isRed ? '#EF4444' : isAmber ? '#F59E0B' : isBlue ? '#3B82F6' : '#22C55E';
            const bgColor = isRed
              ? 'rgba(239,68,68,0.08)'
              : isAmber
                ? 'rgba(245,158,11,0.08)'
                : isBlue
                  ? 'rgba(59,130,246,0.08)'
                  : 'rgba(34,197,94,0.08)';
            return (
              <div
                key={i}
                onClick={() => a.link && navigate(a.link)}
                className="glass-card hover-lift px-4 py-3 flex items-center gap-3 cursor-pointer relative overflow-hidden"
                style={{
                  background: bgColor,
                  borderLeft: `4px solid ${accentColor}`,
                }}
              >
                {isRed && (
                  <span
                    className="inline-block w-2 h-2 rounded-full animate-pulse-dot"
                    style={{ background: '#EF4444', boxShadow: '0 0 8px rgba(239,68,68,0.8)' }}
                  />
                )}
                <span className="text-sm">{a.icon}</span>
                <p className="text-sm font-semibold flex-1" style={{ color: '#F0FDF4' }}>{a.message}</p>
                <ChevronRight className="h-4 w-4" style={{ color: '#86EFAC' }} />
              </div>
            );
          })}
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile icon={<DollarSign className="h-5 w-5" />} label="This Week Revenue" value={`$${(stats?.weekRevenue || 0).toLocaleString()}`} />
        <StatTile icon={<ClipboardList className="h-5 w-5" />} label="Outstanding Quotes" value={`${stats?.outstandingQuotes || 0}`} />
        <StatTile icon={<Clock className="h-5 w-5" />} label="Cleans Today" value={`${stats?.cleansToday || 0}`} />
        <StatTile icon={<Star className="h-5 w-5" />} label="Avg Brightly Score" value={`${stats?.avgScore || '—'}`} />
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" className="rounded-xl h-12 gap-2" onClick={() => navigate('/quoting')}>
          <Plus className="h-4 w-4" /> New Enquiry
        </Button>
        <Button variant="outline" className="rounded-xl h-12 gap-2" onClick={() => setSmsModalOpen(true)}>
          <Send className="h-4 w-4" /> Send SMS Quote Link
        </Button>
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search clients…" className="h-12 rounded-xl pl-10" />
          </div>
        </div>
      </div>

      {/* Vertical Pipeline */}
      <div>
        <h2 className="page-heading mb-4" style={{ color: '#FEDB00' }}>Pipeline</h2>
        <div className="space-y-2">
          {PIPELINE_STAGES.map(stage => {
            const items = pipeline[stage.key] || [];
            const count = items.length;
            const open = isExpanded(stage.key);

            return (
              <div key={stage.key} className="glass-card overflow-hidden">
                {/* Stage header */}
                <button
                  onClick={() => toggle(stage.key)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.04] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {open
                      ? <ChevronDown className="h-4 w-4" style={{ color: '#86EFAC' }} />
                      : <ChevronRight className="h-4 w-4" style={{ color: '#86EFAC' }} />
                    }
                    <h3 className="text-sm font-bold" style={{ color: '#F0FDF4' }}>{stage.label}</h3>
                  </div>
                  <span
                    className="text-[11px] font-bold px-2 py-0.5 rounded-full tabular-nums"
                    style={{ background: 'rgba(255,255,255,0.06)', color: '#86EFAC' }}
                  >
                    {count}
                  </span>
                </button>

                {/* Expanded cards */}
                {open && (
                  <div className="px-4 pb-4 space-y-2">
                    {items.length === 0 ? (
                      <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
                        <p className="text-xs" style={{ color: '#86EFAC' }}>No items</p>
                      </div>
                    ) : (
                      items.map((item: any) => (
                        <PipelineCard key={item.id} item={item} column={stage.key} navigate={navigate} />
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <SendQuoteLinkModal open={smsModalOpen} onOpenChange={setSmsModalOpen} />
    </div>
  );
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="glass-card hover-lift p-4 space-y-1.5">
      <div className="flex items-center gap-2" style={{ color: '#22C55E' }}>{icon}</div>
      <p className="text-2xl font-extrabold tabular-nums" style={{ color: '#F0FDF4' }}>{value}</p>
      <p className="text-[11px] font-semibold uppercase" style={{ letterSpacing: '0.08em', color: '#86EFAC' }}>{label}</p>
    </div>
  );
}

// Pill colors per pipeline stage (matches spec)
const STAGE_PILL: Record<PipelineStatus, { bg: string; color: string; label: string }> = {
  new_enquiry: { bg: 'rgba(59,130,246,0.15)', color: '#93C5FD', label: 'New Enquiry' },
  quote_sent: { bg: 'rgba(251,191,36,0.15)', color: '#FCD34D', label: 'Quote Sent' },
  accepted: { bg: 'rgba(34,197,94,0.15)', color: '#86EFAC', label: 'Accepted' },
  scheduled: { bg: 'rgba(139,92,246,0.15)', color: '#C4B5FD', label: 'Scheduled' },
  in_progress: { bg: 'rgba(254,219,0,0.15)', color: '#FEDB00', label: 'In Progress' },
  complete: { bg: 'rgba(34,197,94,0.20)', color: '#22C55E', label: 'Complete' },
};

function PipelineCard({ item, column, navigate }: { item: any; column: PipelineStatus; navigate: (path: string) => void }) {
  const isQuoteRequest = ['new_enquiry', 'quote_sent', 'accepted'].includes(column);
  const pill = STAGE_PILL[column];

  if (isQuoteRequest) {
    const name = [item.first_name, item.last_name].filter(Boolean).join(' ');
    const daysWaiting = item.form_submitted_at
      ? Math.floor(differenceInHours(new Date(), new Date(item.form_submitted_at)) / 24)
      : 0;
    const isOverdue = column === 'quote_sent' && daysWaiting >= 2;

    return (
      <div
        className="hover-lift p-4 cursor-pointer"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
          ...(isOverdue ? { borderLeft: '3px solid #EF4444' } : {}),
        }}
        onClick={() => navigate('/quoting')}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold truncate" style={{ color: '#F0FDF4' }}>{name || 'Unknown'}</p>
            <p className="text-xs truncate" style={{ color: '#86EFAC' }}>{item.address || 'No address'}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: pill.bg, color: pill.color }}
            >
              {pill.label}
            </span>
            {item.clean_type && (
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#86EFAC' }}
              >
                {item.clean_type}
              </span>
            )}
            {column === 'quote_sent' && daysWaiting > 0 && (
              <span
                className="text-xs font-bold tabular-nums"
                style={{ color: daysWaiting >= 2 ? '#EF4444' : '#F59E0B' }}
              >
                {daysWaiting}d
              </span>
            )}
          </div>
        </div>
        {column === 'new_enquiry' && (
          <div className="mt-2">
            <Button size="sm" variant="outline" className="h-8 text-xs">Send Quote</Button>
          </div>
        )}
        {column === 'quote_sent' && (
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs">Follow Up</Button>
            <Button size="sm" variant="outline" className="h-8 text-xs">Mark Accepted</Button>
          </div>
        )}
        {column === 'accepted' && (
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs">Schedule Clean</Button>
            <Button size="sm" variant="outline" className="h-8 text-xs">Assign Cleaner</Button>
          </div>
        )}
      </div>
    );
  }

  // Job card
  const propName = (item as any).properties?.property_name || 'Property';
  const address = (item as any).properties?.address || '';
  return (
    <div
      className="hover-lift p-4 cursor-pointer"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px',
      }}
      onClick={() => navigate(`/jobs/${item.id}`)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold truncate" style={{ color: '#F0FDF4' }}>{propName}</p>
          <p className="text-xs truncate" style={{ color: '#86EFAC' }}>
            {address && `${address} · `}
            {item.scheduled_date ? format(new Date(item.scheduled_date + 'T00:00:00'), 'EEE, d MMM') : ''}
            {item.scheduled_time ? ` · ${item.scheduled_time.slice(0, 5)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: pill.bg, color: pill.color }}
          >
            {pill.label}
          </span>
          {column === 'in_progress' && (
            <div className="flex items-center gap-1">
              <div
                className="w-2 h-2 rounded-full animate-pulse-dot"
                style={{ background: '#22C55E', boxShadow: '0 0 6px rgba(34,197,94,0.8)' }}
              />
              <span className="text-xs font-semibold" style={{ color: '#22C55E' }}>Live</span>
            </div>
          )}
          {item.invoice_status && column === 'complete' && (
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#86EFAC' }}
            >
              {item.invoice_status}
            </span>
          )}
        </div>
      </div>
      {column === 'scheduled' && (
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs">View Job</Button>
          <Button size="sm" variant="outline" className="h-8 text-xs">Send Tracker Link</Button>
        </div>
      )}
      {column === 'complete' && (
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs">Send Invoice</Button>
          <Button size="sm" variant="outline" className="h-8 text-xs">Request Review</Button>
          <Button size="sm" variant="outline" className="h-8 text-xs">Rebook</Button>
        </div>
      )}
    </div>
  );
}
