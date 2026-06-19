import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Loader2, ChevronLeft, ChevronRight, ChevronRight as ArrowRight,
  Calendar, Home, Send, CheckCircle2,
} from 'lucide-react';
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth,
  parseISO,
} from 'date-fns';

/* ── Theme — dark admin palette ────────────────────────────────── */
const BG     = '#0B0F17';
const CARD   = '#131920';
const CARD2  = '#1A2130';
const BORDER = 'rgba(255,255,255,0.07)';
const GREEN  = '#4ADE80';
const YELLOW = '#FEDB00';
const WHITE  = '#FFFFFF';
const MUTED  = 'rgba(255,255,255,0.45)';

/* ── One colour per property (up to 8) ─────────────────────────── */
const PROP_COLORS = [
  '#4ADE80', '#60A5FA', '#C084FC', '#F97316',
  '#FB7185', '#34D399', '#FACC15', '#818CF8',
];

const ACTIVE     = ['confirmed', 'scheduled', 'pending_cleaner', 'awaiting_cleaner_acceptance', 'in_progress'];
const NEEDS_ATTN = ['pending_cleaner', 'awaiting_cleaner_acceptance'];
const DONE       = ['completed', 'complete'];

function jobStatus(s: string) {
  if (DONE.includes(s))        return { label: 'Completed',    color: 'rgba(255,255,255,0.28)' };
  if (s === 'in_progress')     return { label: 'In Progress',  color: '#60A5FA' };
  if (NEEDS_ATTN.includes(s)) return { label: 'Needs Cleaner', color: '#F59E0B' };
  if (s === 'cancelled')       return { label: 'Cancelled',    color: '#EF4444' };
  return { label: 'Scheduled', color: GREEN };
}

/* ── Month Calendar ─────────────────────────────────────────────── */
function PortalMonthCalendar({
  jobs, properties, token,
}: { jobs: any[]; properties: any[]; token: string }) {
  const [viewDate,     setViewDate]     = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [requestJobId, setRequestJobId] = useState<string | null>(null);
  const [requestText,  setRequestText]  = useState('');
  const [requestSent,  setRequestSent]  = useState(false);
  const [sending,      setSending]      = useState(false);

  const calStart = startOfWeek(startOfMonth(viewDate), { weekStartsOn: 1 });
  const calEnd   = endOfWeek(endOfMonth(viewDate),   { weekStartsOn: 1 });
  const days     = eachDayOfInterval({ start: calStart, end: calEnd });

  const propColorMap = useMemo(() => {
    const m: Record<string, string> = {};
    properties.forEach((p, i) => { m[p.id] = PROP_COLORS[i % PROP_COLORS.length]; });
    return m;
  }, [properties]);

  const jobsByDate = useMemo(() => {
    const m: Record<string, any[]> = {};
    jobs.forEach(j => {
      if (!m[j.scheduled_date]) m[j.scheduled_date] = [];
      m[j.scheduled_date].push(j);
    });
    return m;
  }, [jobs]);

  const todayStr    = format(new Date(), 'yyyy-MM-dd');
  const selectedJobs = jobsByDate[selectedDate] || [];

  const handleSendRequest = async () => {
    if (!requestText.trim() || !requestJobId) return;
    setSending(true);
    const job = jobs.find((j: any) => j.id === requestJobId);
    await supabase.from('client_change_requests' as any).insert({
      job_id: requestJobId,
      property_id: job?.property_id,
      portal_token: token,
      message: requestText.trim(),
    });
    setSending(false);
    setRequestSent(true);
    setTimeout(() => {
      setRequestJobId(null);
      setRequestText('');
      setRequestSent(false);
    }, 2500);
  };

  return (
    <div>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => setViewDate(d => subMonths(d, 1))}
          className="w-8 h-8 flex items-center justify-center rounded-lg"
          style={{ background: CARD2, color: WHITE }}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-extrabold" style={{ color: WHITE }}>
          {format(viewDate, 'MMMM yyyy')}
        </span>
        <button
          onClick={() => setViewDate(d => addMonths(d, 1))}
          className="w-8 h-8 flex items-center justify-center rounded-lg"
          style={{ background: CARD2, color: WHITE }}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-px">
        {['M','T','W','T','F','S','S'].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-bold py-1.5" style={{ color: MUTED }}>
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px" style={{ background: BORDER }}>
        {days.map(day => {
          const dStr    = format(day, 'yyyy-MM-dd');
          const dayJobs = jobsByDate[dStr] || [];
          const inMonth = isSameMonth(day, viewDate);
          const isToday = dStr === todayStr;
          const isSel   = dStr === selectedDate;
          const visible = dayJobs.filter(j => ACTIVE.includes(j.status) || DONE.includes(j.status));

          return (
            <button
              key={dStr}
              onClick={() => setSelectedDate(dStr)}
              className="text-left p-1.5 min-h-[68px] transition-colors"
              style={{
                background: isSel ? 'rgba(74,222,128,0.07)' : CARD,
                outline: isSel ? `1.5px solid ${GREEN}` : isToday ? `1.5px solid ${YELLOW}` : 'none',
                opacity: inMonth ? 1 : 0.22,
              }}
            >
              <span
                className="text-[11px] font-bold block mb-0.5"
                style={{ color: isToday ? YELLOW : isSel ? GREEN : WHITE }}
              >
                {format(day, 'd')}
              </span>
              <div className="space-y-0.5">
                {visible.slice(0, 2).map((j: any) => {
                  const color  = propColorMap[j.property_id] || GREEN;
                  const isDone = DONE.includes(j.status);
                  const isAttn = NEEDS_ATTN.includes(j.status);
                  const prop   = properties.find((p: any) => p.id === j.property_id);
                  const label  = (prop?.property_name || '·').replace(/Alloggio /, 'A');
                  return (
                    <div
                      key={j.id}
                      className="text-[8px] font-bold px-1 py-0.5 rounded truncate leading-tight"
                      style={{
                        background: isDone ? 'rgba(255,255,255,0.05)' : `${color}1A`,
                        color: isDone ? 'rgba(255,255,255,0.28)' : isAttn ? '#F59E0B' : color,
                      }}
                    >
                      {label}
                    </div>
                  );
                })}
                {visible.length > 2 && (
                  <div className="text-[8px]" style={{ color: MUTED }}>+{visible.length - 2}</div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Status legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
        {[
          { color: GREEN,                     label: 'Scheduled' },
          { color: '#F59E0B',                 label: 'Needs Cleaner' },
          { color: '#60A5FA',                 label: 'In Progress' },
          { color: 'rgba(255,255,255,0.25)',  label: 'Completed' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: l.color }} />
            <span className="text-[10px]" style={{ color: MUTED }}>{l.label}</span>
          </div>
        ))}
      </div>

      {/* Property colour key */}
      {properties.length > 1 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
          {properties.map((p: any, i: number) => (
            <div key={p.id} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded" style={{ background: PROP_COLORS[i % PROP_COLORS.length] }} />
              <span className="text-[10px] font-semibold" style={{ color: MUTED }}>{p.property_name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Selected day panel */}
      <div
        className="mt-4 rounded-2xl overflow-hidden"
        style={{ background: CARD, border: `1px solid ${BORDER}` }}
      >
        <div className="px-4 py-3 border-b" style={{ borderColor: BORDER }}>
          <p className="text-sm font-extrabold" style={{ color: WHITE }}>
            {format(parseISO(selectedDate), 'EEEE, d MMMM')}
          </p>
        </div>

        {selectedJobs.length === 0 ? (
          <p className="px-4 py-5 text-sm text-center" style={{ color: MUTED }}>
            No cleans on this day.
          </p>
        ) : (
          <div className="divide-y" style={{ borderColor: BORDER }}>
            {selectedJobs.map((j: any) => {
              const prop      = properties.find((p: any) => p.id === j.property_id);
              const si        = jobStatus(j.status);
              const pColor    = propColorMap[j.property_id] || GREEN;
              const canChange = ACTIVE.includes(j.status);

              return (
                <div key={j.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <div
                        className="w-2.5 h-2.5 rounded-full mt-1 shrink-0"
                        style={{ background: pColor }}
                      />
                      <div>
                        <p className="text-sm font-bold" style={{ color: WHITE }}>
                          {prop?.property_name || 'Property'}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                          {j.scheduled_time ? j.scheduled_time.slice(0, 5) : 'Time TBC'}
                          {j.estimated_duration ? ` · ${(j.estimated_duration / 60).toFixed(1)}hr` : ''}
                        </p>
                      </div>
                    </div>
                    <span
                      className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0"
                      style={{ background: `${si.color}18`, color: si.color }}
                    >
                      {si.label}
                    </span>
                  </div>

                  {/* Request a change */}
                  {canChange && (
                    <div className="mt-2 ml-5">
                      {requestJobId === j.id ? (
                        requestSent ? (
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" style={{ color: GREEN }} />
                            <p className="text-xs font-bold" style={{ color: GREEN }}>
                              Request sent to Brightly
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <textarea
                              value={requestText}
                              onChange={e => setRequestText(e.target.value)}
                              placeholder="Describe the change you need…"
                              rows={2}
                              className="w-full text-xs rounded-lg px-3 py-2 resize-none outline-none"
                              style={{
                                background: CARD2,
                                border: `1px solid ${BORDER}`,
                                color: WHITE,
                              }}
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={handleSendRequest}
                                disabled={!requestText.trim() || sending}
                                className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-40"
                                style={{ background: GREEN, color: '#000' }}
                              >
                                <Send className="w-3 h-3" />
                                {sending ? 'Sending…' : 'Send Request'}
                              </button>
                              <button
                                onClick={() => { setRequestJobId(null); setRequestText(''); }}
                                className="text-xs px-3 py-1.5 rounded-lg"
                                style={{ background: CARD2, color: MUTED }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )
                      ) : (
                        <button
                          onClick={() => setRequestJobId(j.id)}
                          className="text-xs px-2.5 py-1 rounded-lg"
                          style={{ background: CARD2, color: MUTED, border: `1px solid ${BORDER}` }}
                        >
                          Request a change →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Properties tab ─────────────────────────────────────────────── */
function PropertiesTab({
  properties, jobs, token, navigate,
}: { properties: any[]; jobs: any[]; token: string; navigate: (to: string) => void }) {
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="space-y-3">
      {properties.map((prop: any, i: number) => {
        const propJobs  = jobs.filter((j: any) => j.property_id === prop.id);
        const upcoming  = propJobs.find((j: any) => j.scheduled_date >= todayStr && ACTIVE.includes(j.status));
        const lastDone  = propJobs.filter((j: any) => DONE.includes(j.status))
          .sort((a: any, b: any) => b.scheduled_date.localeCompare(a.scheduled_date))[0];
        const needsAttn = upcoming && NEEDS_ATTN.includes(upcoming.status);
        const color     = PROP_COLORS[i % PROP_COLORS.length];

        return (
          <button
            key={prop.id}
            onClick={() => navigate(`/client/${token}/property/${prop.id}`)}
            className="w-full text-left rounded-2xl p-4 transition-colors"
            style={{
              background: CARD,
              border: `1px solid ${needsAttn ? 'rgba(245,158,11,0.35)' : BORDER}`,
            }}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-1 self-stretch rounded-full shrink-0"
                style={{ background: color, minHeight: '3.5rem' }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-extrabold text-sm" style={{ color: WHITE }}>
                    {prop.property_name}
                  </p>
                  {needsAttn && (
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                      style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}
                    >
                      Needs Cleaner
                    </span>
                  )}
                </div>
                <p className="text-xs mt-0.5 truncate" style={{ color: MUTED }}>
                  {[prop.address, prop.suburb].filter(Boolean).join(', ') || 'Address not set'}
                </p>
                <p className="text-xs" style={{ color: MUTED }}>
                  {prop.bedrooms || 0} bed · {prop.bathrooms || 0} bath
                </p>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                      Next Clean
                    </p>
                    <p className="text-xs font-bold mt-0.5" style={{ color: upcoming ? GREEN : WHITE }}>
                      {upcoming ? format(parseISO(upcoming.scheduled_date), 'd MMM') : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
                      Last Clean
                    </p>
                    <p className="text-xs font-bold mt-0.5" style={{ color: WHITE }}>
                      {lastDone ? format(parseISO(lastDone.scheduled_date), 'd MMM yyyy') : '—'}
                    </p>
                  </div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 shrink-0 mt-1" style={{ color: MUTED }} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────────── */
export default function MagicLinkPortalPage() {
  const { token }  = useParams<{ token: string }>();
  const navigate   = useNavigate();
  const [tab, setTab] = useState<'calendar' | 'properties'>('calendar');

  /* ── Token → client lookup ─────────────────────────────────────── */
  const { data: clientProp, isLoading: loadingToken, error: tokenError } = useQuery({
    queryKey: ['magic-link', token],
    queryFn: async () => {
      const { data: tokenRow, error: tokenErr } = await supabase
        .from('client_properties' as any)
        .select('client_id')
        .eq('portal_token', token!)
        .eq('portal_active', true)
        .maybeSingle();
      if (tokenErr) throw tokenErr;
      if (!tokenRow) return [];

      const { data, error } = await supabase
        .from('client_properties' as any)
        .select('*')
        .eq('client_id', (tokenRow as any).client_id)
        .eq('portal_active', true);
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!token,
  });

  const propertyIds = (clientProp || []).map((cp: any) => cp.property_id);
  const clientId    = clientProp?.[0]?.client_id;

  /* ── Data queries ──────────────────────────────────────────────── */
  const { data: properties = [], isLoading: loadingProps } = useQuery({
    queryKey: ['magic-properties', propertyIds],
    queryFn: async () => {
      if (!propertyIds.length) return [];
      const { data, error } = await supabase.from('properties').select('*').in('id', propertyIds);
      if (error) throw error;
      return data || [];
    },
    enabled: propertyIds.length > 0,
  });

  const { data: profile } = useQuery({
    queryKey: ['magic-profile', clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const { data } = await supabase
        .from('profiles')
        .select('full_name, logo_url')
        .eq('id', clientId)
        .single();
      return data;
    },
    enabled: !!clientId,
  });

  const { data: jobs = [] } = useQuery({
    queryKey: ['magic-jobs', propertyIds],
    queryFn: async () => {
      if (!propertyIds.length) return [];
      const { data } = await supabase
        .from('jobs')
        .select('*')
        .in('property_id', propertyIds)
        .order('scheduled_date', { ascending: true });
      return data || [];
    },
    enabled: propertyIds.length > 0,
  });

  const { data: feedback = [] } = useQuery({
    queryKey: ['magic-feedback', propertyIds],
    queryFn: async () => {
      if (!propertyIds.length) return [];
      const { data } = await supabase
        .from('job_feedback')
        .select('property_id, score')
        .in('property_id', propertyIds)
        .not('score', 'is', null);
      return data || [];
    },
    enabled: propertyIds.length > 0,
  });

  /* ── Derived stats ─────────────────────────────────────────────── */
  const todayStr      = format(new Date(), 'yyyy-MM-dd');
  const upcomingCount = jobs.filter((j: any) => j.scheduled_date >= todayStr && ACTIVE.includes(j.status)).length;
  const lastCompleted = jobs.filter((j: any) => DONE.includes(j.status))
    .sort((a: any, b: any) => b.scheduled_date.localeCompare(a.scheduled_date))[0];
  const allScores = (feedback as any[]).map((f: any) => f.score).filter(Boolean);
  const avgScore  = allScores.length > 0
    ? Math.round(allScores.reduce((s: number, v: number) => s + v, 0) / allScores.length)
    : null;

  const isLoading  = loadingToken || loadingProps;
  const clientName = profile?.full_name || 'there';
  const logoUrl    = (profile as any)?.logo_url || null;
  const hour       = new Date().getHours();
  const greeting   = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  /* ── Loading ─────────────────────────────────────────────────── */
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
        <div className="text-center space-y-3">
          <div className="text-2xl font-extrabold" style={{ color: WHITE }}>
            Brightly<span style={{ color: YELLOW }}>.</span>
          </div>
          <Loader2 className="w-6 h-6 animate-spin mx-auto" style={{ color: YELLOW }} />
        </div>
      </div>
    );
  }

  if (!clientProp?.length || tokenError) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-4 text-center"
        style={{ background: BG }}
      >
        <p className="text-4xl mb-3">🔒</p>
        <p className="text-lg font-bold" style={{ color: WHITE }}>
          Invalid or inactive portal link
        </p>
        <p className="text-sm mt-1" style={{ color: MUTED }}>
          Contact Brightly for a new link.
        </p>
      </div>
    );
  }

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen" style={{ background: BG }}>

      {/* Sticky header */}
      <header
        className="sticky top-0 z-40 px-5 py-3.5 flex items-center justify-between"
        style={{
          background: 'rgba(11,15,23,0.92)',
          backdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${BORDER}`,
        }}
      >
        <span className="text-xl font-extrabold" style={{ color: WHITE }}>
          Brightly<span style={{ color: YELLOW }}>.</span>
        </span>
        <span
          className="text-xs font-semibold px-2.5 py-1 rounded-full"
          style={{ background: 'rgba(255,255,255,0.07)', color: MUTED }}
        >
          Client Portal
        </span>
      </header>

      <main className="max-w-2xl mx-auto px-5 py-7 space-y-6">

        {/* Greeting + client logo */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-widest uppercase" style={{ color: YELLOW }}>
              Welcome back
            </p>
            <h1 className="text-2xl font-extrabold leading-tight mt-0.5" style={{ color: WHITE }}>
              {greeting}, {clientName}.
            </h1>
            <p className="text-sm mt-1.5" style={{ color: MUTED }}>
              {properties.length === 1 ? '1 property' : `${properties.length} properties`} managed by Brightly.
            </p>
          </div>
          {logoUrl && (
            <img
              src={logoUrl}
              alt="Client logo"
              className="h-12 w-auto object-contain shrink-0 mt-1"
            />
          )}
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              value: upcomingCount > 0 ? upcomingCount : '—',
              label: 'Upcoming',
              color: GREEN,
            },
            {
              value: lastCompleted ? format(parseISO(lastCompleted.scheduled_date), 'd MMM') : '—',
              label: 'Last clean',
              color: WHITE,
            },
            {
              value: avgScore ? `${avgScore}%` : '—',
              label: 'Avg quality',
              color: avgScore && avgScore >= 90 ? GREEN : avgScore ? YELLOW : WHITE,
            },
          ].map(s => (
            <div
              key={s.label}
              className="rounded-2xl p-3.5 text-center"
              style={{ background: CARD, border: `1px solid ${BORDER}` }}
            >
              <p className="text-xl font-extrabold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-[11px] mt-0.5" style={{ color: MUTED }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div
          className="flex gap-1 p-1 rounded-xl"
          style={{ background: CARD }}
        >
          {(['calendar', 'properties'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold transition-all"
              style={
                tab === t
                  ? { background: CARD2, color: WHITE, boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }
                  : { color: MUTED }
              }
            >
              {t === 'calendar'
                ? <Calendar className="w-3.5 h-3.5" />
                : <Home className="w-3.5 h-3.5" />
              }
              {t === 'calendar' ? 'Calendar' : 'Properties'}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'calendar' ? (
          <PortalMonthCalendar jobs={jobs} properties={properties} token={token!} />
        ) : (
          <PropertiesTab properties={properties} jobs={jobs} token={token!} navigate={navigate} />
        )}

        {/* Footer */}
        <div className="text-center pt-4 pb-6">
          <p className="text-xs font-extrabold" style={{ color: 'rgba(255,255,255,0.13)' }}>
            Brightly<span style={{ color: 'rgba(254,219,0,0.2)' }}>.</span>
          </p>
        </div>

      </main>
    </div>
  );
}
