import { useState, useMemo, useEffect, createContext, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
// Public client-facing page — always read as anon, never the admin's session.
import { supabasePublic as supabase } from '@/integrations/supabase/client';
import {
  Loader2, ChevronLeft, ChevronRight, ChevronRight as ArrowRight,
  Calendar, Home, Send, CheckCircle2, Building2, User, Phone, Mail,
  MapPin, Bed, Bath, KeyRound, Car, Wifi, FileText, Clock,
  AlertTriangle, Receipt, Sparkles, ShieldCheck, Users, Sun, Moon,
} from 'lucide-react';
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth,
  parseISO,
} from 'date-fns';

/* ── Theme — Brightly, light (Sea Glass) or dark. Client's choice. ──
   Both palettes use the SAME keys so every component just destructures
   the active one. WHITE = primary text (name kept to limit churn). */
type Palette = {
  BG: string; CARD: string; CARD2: string; BORDER: string;
  GREEN: string; YELLOW: string; WHITE: string; MUTED: string;
  DIM: string; FAINT: string; BARBG: string; HEADBG: string; SHADOW: string;
};

const LIGHT: Palette = {
  BG: '#F4F7F6', CARD: '#FFFFFF', CARD2: '#EEF3F2', BORDER: '#E4EBEA',
  GREEN: '#2E9AA0', YELLOW: '#C98A46', WHITE: '#243231', MUTED: '#8AA0A0',
  DIM: 'rgba(36,50,49,0.28)', FAINT: 'rgba(36,50,49,0.05)',
  BARBG: 'rgba(255,255,255,0.92)', HEADBG: 'rgba(244,247,246,0.85)',
  SHADOW: '0 1px 2px rgba(36,50,49,0.04), 0 8px 24px rgba(36,50,49,0.05)',
};

const DARK: Palette = {
  BG: '#0E1413', CARD: '#18211F', CARD2: '#212C2A', BORDER: 'rgba(255,255,255,0.09)',
  GREEN: '#45C2C8', YELLOW: '#E8B983', WHITE: '#F2F7F6', MUTED: 'rgba(242,247,246,0.55)',
  DIM: 'rgba(242,247,246,0.32)', FAINT: 'rgba(255,255,255,0.05)',
  BARBG: 'rgba(14,20,19,0.92)', HEADBG: 'rgba(14,20,19,0.85)',
  SHADOW: '0 1px 2px rgba(0,0,0,0.3), 0 12px 32px rgba(0,0,0,0.35)',
};

const PaletteCtx = createContext<Palette>(LIGHT);
const usePalette = () => useContext(PaletteCtx);
const THEME_KEY = 'brightly-portal-theme';


const ACTIVE     = ['confirmed', 'scheduled', 'pending_cleaner', 'awaiting_cleaner_acceptance', 'in_progress'];
const NEEDS_ATTN = ['pending_cleaner', 'awaiting_cleaner_acceptance'];
const DONE       = ['completed', 'complete'];

function jobStatus(s: string, P: Palette) {
  if (DONE.includes(s))       return { label: 'Completed',    color: P.DIM,    done: true };
  if (s === 'in_progress')    return { label: 'In Progress',  color: '#60A5FA', done: false };
  if (NEEDS_ATTN.includes(s)) return { label: 'Needs Cleaner', color: '#F59E0B', done: false };
  if (s === 'cancelled')      return { label: 'Cancelled',    color: '#EF4444', done: false };
  return { label: 'Scheduled', color: P.GREEN, done: false };
}

/* ── Month Calendar ─────────────────────────────────────────────── */
function PortalMonthCalendar({
  jobs, properties, token,
}: { jobs: any[]; properties: any[]; token: string }) {
  const P = usePalette();
  const { CARD, CARD2, BORDER, GREEN, YELLOW, WHITE, MUTED, DIM, FAINT } = P;
  const [viewDate,     setViewDate]     = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [requestJobId, setRequestJobId] = useState<string | null>(null);
  const [requestText,  setRequestText]  = useState('');
  const [requestSent,  setRequestSent]  = useState(false);
  const [sending,      setSending]      = useState(false);

  const calStart = startOfWeek(startOfMonth(viewDate), { weekStartsOn: 1 });
  const calEnd   = endOfWeek(endOfMonth(viewDate),   { weekStartsOn: 1 });
  const days     = eachDayOfInterval({ start: calStart, end: calEnd });


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
                background: isSel ? `${GREEN}1A` : CARD,
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
                  const isDone = DONE.includes(j.status);
                  const isAttn = NEEDS_ATTN.includes(j.status);
                  const dotColor = isDone ? DIM : isAttn ? '#F59E0B' : GREEN;
                  const prop = properties.find((p: any) => p.id === j.property_id);
                  const label = prop?.property_name || '·';
                  return (
                    <div
                      key={j.id}
                      className="text-[8px] font-bold px-1 py-0.5 rounded truncate leading-tight"
                      style={{
                        background: isDone ? FAINT : `${dotColor}1A`,
                        color: dotColor,
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
          { color: DIM, label: 'Completed' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: l.color }} />
            <span className="text-[10px]" style={{ color: MUTED }}>{l.label}</span>
          </div>
        ))}
      </div>


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
              const si        = jobStatus(j.status, P);
              const canChange = ACTIVE.includes(j.status);

              return (
                <div key={j.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <div
                        className="w-2.5 h-2.5 rounded-full mt-1 shrink-0"
                        style={{ background: si.done ? DIM : GREEN }}
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
  properties, jobs, onSelect,
}: { properties: any[]; jobs: any[]; onSelect: (id: string) => void }) {
  const { CARD, BORDER, GREEN, WHITE, MUTED } = usePalette();
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="grid grid-cols-2 gap-3">
      {properties.map((prop: any) => {
        const propJobs  = jobs.filter((j: any) => j.property_id === prop.id);
        const upcoming  = propJobs.find((j: any) => j.scheduled_date >= todayStr && ACTIVE.includes(j.status));
        const lastDone  = propJobs.filter((j: any) => DONE.includes(j.status))
          .sort((a: any, b: any) => b.scheduled_date.localeCompare(a.scheduled_date))[0];
        const needsAttn = upcoming && NEEDS_ATTN.includes(upcoming.status);

        return (
          <button
            key={prop.id}
            onClick={() => onSelect(prop.id)}
            className="w-full text-left rounded-2xl overflow-hidden transition-colors"
            style={{
              background: CARD,
              border: `1px solid ${needsAttn ? 'rgba(245,158,11,0.35)' : BORDER}`,
            }}
          >
            {prop.hero_image_url && (
              <img
                src={prop.hero_image_url}
                alt={prop.property_name}
                className="w-full h-28 object-cover"
              />
            )}
            <div className="p-3">
              <div className="flex items-start justify-between gap-1 mb-1">
                <p className="font-extrabold text-sm leading-tight" style={{ color: WHITE }}>
                  {prop.property_name}
                </p>
                <ArrowRight className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: MUTED }} />
              </div>
              <p className="text-[11px] truncate" style={{ color: MUTED }}>
                {prop.suburb || prop.address || ''}
              </p>
              <p className="text-[11px]" style={{ color: MUTED }}>
                {prop.bedrooms || 0}bd · {prop.bathrooms || 0}ba
              </p>
              {needsAttn && (
                <span className="inline-block mt-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B' }}>
                  Needs Cleaner
                </span>
              )}
              <div className="flex gap-3 mt-2">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>Next</p>
                  <p className="text-[11px] font-bold" style={{ color: upcoming ? GREEN : WHITE }}>
                    {upcoming ? format(parseISO(upcoming.scheduled_date), 'd MMM') : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>Last</p>
                  <p className="text-[11px] font-bold" style={{ color: WHITE }}>
                    {lastDone ? format(parseISO(lastDone.scheduled_date), 'd MMM') : '—'}
                  </p>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ── UI atoms ───────────────────────────────────────────────────── */
function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  const { MUTED } = usePalette();
  return (
    <div className="flex items-center justify-between mb-2.5 mt-1">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.12em]" style={{ color: MUTED }}>{children}</p>
      {action}
    </div>
  );
}

function Card({ children, className = '', accent }: { children: React.ReactNode; className?: string; accent?: string }) {
  const { CARD, BORDER, SHADOW } = usePalette();
  return (
    <div className={`rounded-2xl ${className}`}
      style={{ background: CARD, border: `1px solid ${accent || BORDER}`, boxShadow: SHADOW }}>
      {children}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value?: string | null }) {
  const { GREEN, WHITE, MUTED } = usePalette();
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${GREEN}14` }}>
        <Icon className="w-4 h-4" style={{ color: GREEN }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: MUTED }}>{label}</p>
        <p className="text-sm font-semibold break-words" style={{ color: WHITE }}>{value}</p>
      </div>
    </div>
  );
}

function Stat({ value, label, tone }: { value: React.ReactNode; label: string; tone?: string }) {
  const { WHITE, MUTED } = usePalette();
  return (
    <Card className="p-3.5 text-center">
      <p className="text-[19px] font-extrabold leading-none" style={{ color: tone || WHITE }}>{value}</p>
      <p className="text-[10.5px] mt-1.5 font-semibold" style={{ color: MUTED }}>{label}</p>
    </Card>
  );
}

/* ── HOME ───────────────────────────────────────────────────────── */
function HomeTab({
  greeting, clientName, logoUrl, properties, jobs, avgScore, goTo, openProperty,
}: any) {
  const P = usePalette();
  const { CARD2, BORDER, GREEN, YELLOW, WHITE, MUTED } = P;
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayJobs = jobs.filter((j: any) => j.scheduled_date === todayStr && !['cancelled'].includes(j.status));
  const upcoming = jobs
    .filter((j: any) => j.scheduled_date >= todayStr && ACTIVE.includes(j.status))
    .sort((a: any, b: any) => a.scheduled_date.localeCompare(b.scheduled_date));
  const lastDone = jobs.filter((j: any) => DONE.includes(j.status))
    .sort((a: any, b: any) => b.scheduled_date.localeCompare(a.scheduled_date))[0];
  const attention = upcoming.filter((j: any) => NEEDS_ATTN.includes(j.status));
  const propName = (id: string) => properties.find((p: any) => p.id === id)?.property_name || 'Property';
  const next = upcoming[0];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold tracking-[0.16em] uppercase" style={{ color: GREEN }}>Welcome back</p>
          <h1 className="text-[26px] font-extrabold leading-tight mt-1 tracking-tight" style={{ color: WHITE }}>
            {greeting}, {clientName}.
          </h1>
          <p className="text-sm mt-1.5" style={{ color: MUTED }}>
            {properties.length === 1 ? '1 property' : `${properties.length} properties`} managed by Brightly.
          </p>
        </div>
        {logoUrl && <img src={logoUrl} alt="" className="h-14 w-auto object-contain shrink-0 opacity-90" />}
      </div>

      {/* Today */}
      {todayJobs.length > 0 && (
        <div>
          <SectionTitle>Today</SectionTitle>
          <Card accent={`${GREEN}55`}>
            {todayJobs.map((j: any, idx: number) => {
              const si = jobStatus(j.status, P);
              return (
                <button key={j.id} onClick={() => openProperty(j.property_id)}
                  className="w-full text-left flex items-center gap-3 px-4 py-3.5"
                  style={{ borderTop: idx ? `1px solid ${BORDER}` : 'none' }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${GREEN}18` }}>
                    <Sparkles className="w-4 h-4" style={{ color: GREEN }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-extrabold truncate" style={{ color: WHITE }}>{propName(j.property_id)}</p>
                    <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                      {j.scheduled_time ? j.scheduled_time.slice(0, 5) : 'Time TBC'} · cleaning today
                    </p>
                  </div>
                  <span className="text-[10.5px] font-bold px-2 py-1 rounded-full shrink-0"
                    style={{ background: `${si.color}18`, color: si.color }}>{si.label}</span>
                </button>
              );
            })}
          </Card>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2.5">
        <Stat value={properties.length || '—'} label="Properties" />
        <Stat value={upcoming.length || '—'} label="Upcoming" tone={upcoming.length ? GREEN : undefined} />
        <Stat value={avgScore ? `${avgScore}%` : '—'} label="Avg quality"
          tone={avgScore && avgScore >= 90 ? GREEN : avgScore ? YELLOW : undefined} />
      </div>

      {/* Needs attention */}
      {attention.length > 0 && (
        <Card accent="rgba(245,158,11,0.4)" className="px-4 py-3.5 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#D68A18' }} />
          <div>
            <p className="text-sm font-extrabold" style={{ color: WHITE }}>
              {attention.length} clean{attention.length > 1 ? 's' : ''} awaiting a cleaner
            </p>
            <p className="text-xs mt-0.5" style={{ color: MUTED }}>We're allocating your team — we'll confirm shortly.</p>
          </div>
        </Card>
      )}

      {/* Next clean */}
      <div>
        <SectionTitle action={
          <button onClick={() => goTo('calendar')} className="text-[11px] font-bold" style={{ color: GREEN }}>View calendar →</button>
        }>Next clean</SectionTitle>
        {next ? (
          <Card className="px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl flex flex-col items-center justify-center shrink-0" style={{ background: `${GREEN}14` }}>
                <span className="text-[9px] font-bold uppercase leading-none" style={{ color: GREEN }}>
                  {format(parseISO(next.scheduled_date), 'MMM')}
                </span>
                <span className="text-base font-extrabold leading-none mt-0.5" style={{ color: GREEN }}>
                  {format(parseISO(next.scheduled_date), 'd')}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-extrabold truncate" style={{ color: WHITE }}>{propName(next.property_id)}</p>
                <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                  {format(parseISO(next.scheduled_date), 'EEEE d MMMM')}
                  {next.scheduled_time ? ` · ${next.scheduled_time.slice(0, 5)}` : ''}
                </p>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="px-4 py-5 text-center">
            <p className="text-sm" style={{ color: MUTED }}>No upcoming cleans booked.</p>
          </Card>
        )}
      </div>

      {/* Last clean */}
      {lastDone && (
        <div>
          <SectionTitle>Last clean</SectionTitle>
          <Card className="px-4 py-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${GREEN}14` }}>
              <CheckCircle2 className="w-4 h-4" style={{ color: GREEN }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-extrabold truncate" style={{ color: WHITE }}>{propName(lastDone.property_id)}</p>
              <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                Completed {format(parseISO(lastDone.scheduled_date), 'd MMMM')}
              </p>
            </div>
            {lastDone.report_token && (
              <a href={`/report/${lastDone.report_token}`} target="_blank" rel="noreferrer"
                className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg shrink-0"
                style={{ background: `${GREEN}14`, color: GREEN }}>Report</a>
            )}
          </Card>
        </div>
      )}

      {/* Quick nav */}
      <div className="grid grid-cols-2 gap-2.5">
        <button onClick={() => goTo('properties')}>
          <Card className="px-4 py-4 text-left">
            <Building2 className="w-4 h-4 mb-2" style={{ color: GREEN }} />
            <p className="text-sm font-extrabold" style={{ color: WHITE }}>My properties</p>
            <p className="text-[11px] mt-0.5" style={{ color: MUTED }}>Details, access & history</p>
          </Card>
        </button>
        <button onClick={() => goTo('calendar')}>
          <Card className="px-4 py-4 text-left">
            <Calendar className="w-4 h-4 mb-2" style={{ color: GREEN }} />
            <p className="text-sm font-extrabold" style={{ color: WHITE }}>Calendar</p>
            <p className="text-[11px] mt-0.5" style={{ color: MUTED }}>Past & upcoming cleans</p>
          </Card>
        </button>
      </div>
    </div>
  );
}

/* ── PROPERTY DETAIL ────────────────────────────────────────────── */
function PropertyDetail({ prop, jobs, onBack }: { prop: any; jobs: any[]; onBack: () => void }) {
  const P = usePalette();
  const { CARD2, BORDER, GREEN, WHITE, MUTED } = P;
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const mine = jobs.filter((j: any) => j.property_id === prop.id);
  const upcoming = mine.filter((j: any) => j.scheduled_date >= todayStr && ACTIVE.includes(j.status))
    .sort((a: any, b: any) => a.scheduled_date.localeCompare(b.scheduled_date));
  const past = mine.filter((j: any) => DONE.includes(j.status))
    .sort((a: any, b: any) => b.scheduled_date.localeCompare(a.scheduled_date));

  const fullAddress = [prop.address, prop.suburb, prop.state, prop.postcode].filter(Boolean).join(', ');
  const beds = prop.bed_config || prop.bed_types || null;
  const accessBits = [
    prop.access_method && `Method: ${prop.access_method}`,
    prop.access_code && `Code: ${prop.access_code}`,
    prop.lockbox_code && `Lockbox: ${prop.lockbox_code}`,
    prop.alarm_code && `Alarm: ${prop.alarm_code}`,
    prop.garage_code && `Garage: ${prop.garage_code}`,
  ].filter(Boolean).join(' · ');

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-bold" style={{ color: GREEN }}>
        <ChevronLeft className="w-4 h-4" /> All properties
      </button>

      <Card className="overflow-hidden">
        {prop.hero_image_url && <img src={prop.hero_image_url} alt="" className="w-full h-40 object-cover" />}
        <div className="p-4">
          <h2 className="text-xl font-extrabold tracking-tight" style={{ color: WHITE }}>{prop.property_name || 'Property'}</h2>
          {fullAddress && <p className="text-sm mt-1" style={{ color: MUTED }}>{fullAddress}</p>}
          <div className="flex flex-wrap gap-2 mt-3">
            {[
              prop.bedrooms != null && `${prop.bedrooms} bed`,
              prop.bathrooms != null && `${prop.bathrooms} bath`,
              prop.max_guests && `${prop.max_guests} guests`,
              prop.property_type,
              prop.platform,
            ].filter(Boolean).map((t: any) => (
              <span key={t} className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                style={{ background: CARD2, color: WHITE }}>{t}</span>
            ))}
          </div>
        </div>
      </Card>

      {/* Property info */}
      <div>
        <SectionTitle>Property details</SectionTitle>
        <Card className="divide-y overflow-hidden" >
          <InfoRow icon={MapPin} label="Address" value={fullAddress} />
          <InfoRow icon={Bed} label="Bed configuration" value={beds} />
          <InfoRow icon={Bath} label="Bathrooms" value={prop.bathrooms != null ? String(prop.bathrooms) : null} />
          <InfoRow icon={KeyRound} label="Entry & access" value={accessBits || prop.access_details || prop.access_notes} />
          <InfoRow icon={Car} label="Parking" value={prop.parking_instructions} />
          <InfoRow icon={Wifi} label="WiFi" value={prop.guest_wifi || prop.wifi_password} />
          <InfoRow icon={Clock} label="Check-in / out" value={
            prop.checkin_time || prop.checkout_time
              ? `${prop.checkout_time ? `Out ${prop.checkout_time}` : ''}${prop.checkout_time && prop.checkin_time ? ' · ' : ''}${prop.checkin_time ? `In ${prop.checkin_time}` : ''}`
              : null} />
          <InfoRow icon={FileText} label="Special instructions" value={prop.special_instructions || prop.property_notes} />
          <InfoRow icon={Users} label="Pets" value={prop.pet_notes} />
        </Card>
      </div>

      {/* Upcoming */}
      <div>
        <SectionTitle>Upcoming cleans</SectionTitle>
        <Card className="overflow-hidden">
          {upcoming.length === 0 ? (
            <p className="px-4 py-5 text-sm text-center" style={{ color: MUTED }}>No upcoming cleans.</p>
          ) : upcoming.map((j: any, i: number) => {
            const si = jobStatus(j.status, P);
            return (
              <div key={j.id} className="flex items-center justify-between gap-3 px-4 py-3.5"
                style={{ borderTop: i ? `1px solid ${BORDER}` : 'none' }}>
                <div>
                  <p className="text-sm font-bold" style={{ color: WHITE }}>
                    {format(parseISO(j.scheduled_date), 'EEE d MMM yyyy')}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                    {j.scheduled_time ? j.scheduled_time.slice(0, 5) : 'Time TBC'}
                  </p>
                </div>
                <span className="text-[10.5px] font-bold px-2 py-1 rounded-full"
                  style={{ background: `${si.color}18`, color: si.color }}>{si.label}</span>
              </div>
            );
          })}
        </Card>
      </div>

      {/* Past cleans + reports */}
      <div>
        <SectionTitle>Past cleans</SectionTitle>
        <Card className="overflow-hidden">
          {past.length === 0 ? (
            <p className="px-4 py-5 text-sm text-center" style={{ color: MUTED }}>No completed cleans yet.</p>
          ) : past.slice(0, 25).map((j: any, i: number) => (
            <div key={j.id} className="flex items-center justify-between gap-3 px-4 py-3.5"
              style={{ borderTop: i ? `1px solid ${BORDER}` : 'none' }}>
              <div className="min-w-0">
                <p className="text-sm font-bold" style={{ color: WHITE }}>
                  {format(parseISO(j.scheduled_date), 'EEE d MMM yyyy')}
                </p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs" style={{ color: MUTED }}>Completed</span>
                  {j.feedback_score != null && (
                    <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: `${GREEN}14`, color: GREEN }}>{j.feedback_score}%</span>
                  )}
                  {j.damage_reported && (
                    <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(214,138,24,0.14)', color: '#D68A18' }}>Damage reported</span>
                  )}
                </div>
              </div>
              {j.report_token && (
                <a href={`/report/${j.report_token}`} target="_blank" rel="noreferrer"
                  className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg shrink-0"
                  style={{ background: `${GREEN}14`, color: GREEN }}>View report</a>
              )}
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

/* ── ADMIN ──────────────────────────────────────────────────────── */
function AdminTab({ profile, properties }: { profile: any; properties: any[] }) {
  const { WHITE, MUTED } = usePalette();
  const p0 = properties[0] || {};
  const company = profile?.full_name || p0.business_name || p0.client_name || '—';
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[22px] font-extrabold tracking-tight" style={{ color: WHITE }}>Account</h2>
        <p className="text-sm mt-1" style={{ color: MUTED }}>Your company & billing details on file with Brightly.</p>
      </div>

      <div>
        <SectionTitle>Company</SectionTitle>
        <Card className="overflow-hidden">
          <InfoRow icon={Building2} label="Company name" value={company} />
          <InfoRow icon={FileText} label="ABN" value={p0.abn} />
          <InfoRow icon={Building2} label="Properties managed" value={String(properties.length)} />
        </Card>
      </div>

      <div>
        <SectionTitle>Contact</SectionTitle>
        <Card className="overflow-hidden">
          <InfoRow icon={User} label="Primary contact" value={profile?.full_name || p0.client_name} />
          <InfoRow icon={Phone} label="Phone" value={profile?.phone || p0.client_phone} />
          <InfoRow icon={Mail} label="Email" value={profile?.email || p0.client_email} />
          <InfoRow icon={Receipt} label="Accounts / billing email" value={p0.billing_email || p0.client_email} />
          <InfoRow icon={FileText} label="Payment terms" value={p0.payment_terms} />
        </Card>
      </div>

      <div>
        <SectionTitle>Your Brightly team</SectionTitle>
        <Card className="overflow-hidden">
          <a href="tel:0418878707"><InfoRow icon={Phone} label="Call us" value="0418 878 707" /></a>
          <a href="mailto:hello@brightly.cleaning"><InfoRow icon={Mail} label="Email us" value="hello@brightly.cleaning" /></a>
          <InfoRow icon={ShieldCheck} label="Fully insured" value="Public liability & workers cover" />
        </Card>
        <p className="text-[11px] mt-3 px-1 leading-relaxed" style={{ color: MUTED }}>
          Need something changed — a detail above, a clean time, or a new property added? Call or email us and we'll update it for you.
        </p>
      </div>
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────────── */
export default function MagicLinkPortalPage() {
  const { token }  = useParams<{ token: string }>();
  const navigate   = useNavigate();
  const [tab, setTab] = useState<'home' | 'calendar' | 'properties' | 'admin'>('home');
  const [selectedProp, setSelectedProp] = useState<string | null>(null);

  /* Light / dark — the client's own choice, remembered on their device. */
  const [dark, setDark] = useState<boolean>(() => {
    try { return localStorage.getItem(THEME_KEY) === 'dark'; } catch { return false; }
  });
  const P = dark ? DARK : LIGHT;
  const { BG, CARD, BORDER, GREEN, YELLOW, WHITE, MUTED, BARBG, HEADBG } = P;
  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch { /* ignore */ }
    document.body.style.background = P.BG;
  }, [dark, P.BG]);

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
        .select('full_name, logo_url, email, phone')
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
  const openProperty = (id: string) => { setSelectedProp(id); setTab('properties'); window.scrollTo(0, 0); };
  const goTo = (t: typeof tab) => { setTab(t); setSelectedProp(null); window.scrollTo(0, 0); };
  const detail = selectedProp ? properties.find((p: any) => p.id === selectedProp) : null;

  const TABS = [
    { key: 'home',       label: 'Home',       icon: Home },
    { key: 'calendar',   label: 'Calendar',   icon: Calendar },
    { key: 'properties', label: 'Properties', icon: Building2 },
    { key: 'admin',      label: 'Admin',      icon: User },
  ] as const;

  return (
    <PaletteCtx.Provider value={P}>
    <div className="min-h-screen" style={{
      background: BG,
      // Living canvas — soft teal corner glows + faint engraved hairlines.
      backgroundImage:
        `radial-gradient(ellipse 90% 60% at 100% -2%, ${GREEN}47, transparent 64%),`
        + `radial-gradient(ellipse 75% 52% at 0% 100%, ${GREEN}33, transparent 60%),`
        + `repeating-linear-gradient(135deg, ${GREEN}1c 0px, ${GREEN}1c 1px, transparent 1px, transparent 12px)`,
      backgroundAttachment: 'fixed',
    }}>

      {/* App bar */}
      <header
        className="sticky top-0 z-40 px-5 flex items-center justify-between"
        style={{
          background: HEADBG,
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderBottom: `1px solid ${BORDER}`,
        }}
      >
        <span className="text-[19px] font-extrabold py-3.5 tracking-tight" style={{ color: WHITE }}>
          Brightly<span style={{ color: GREEN }}>.</span>
        </span>
        <div className="flex items-center gap-2">
          <span
            className="text-[10.5px] font-bold px-2.5 py-1 rounded-full"
            style={{ background: `${GREEN}14`, color: GREEN }}
          >
            Client Portal
          </span>
          {/* Light / dark — client's choice */}
          <button
            onClick={() => setDark(v => !v)}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
            style={{ background: CARD, border: `1px solid ${BORDER}`, color: dark ? YELLOW : MUTED }}
          >
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Content — bottom padding clears the tab bar */}
      <main className="max-w-2xl mx-auto px-5 pt-6" style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom))' }}>
        {tab === 'home' && (
          <HomeTab
            greeting={greeting} clientName={clientName} logoUrl={logoUrl}
            properties={properties} jobs={jobs} avgScore={avgScore}
            goTo={goTo} openProperty={openProperty}
          />
        )}

        {tab === 'calendar' && (
          <PortalMonthCalendar jobs={jobs} properties={properties} token={token!} />
        )}

        {tab === 'properties' && (
          detail
            ? <PropertyDetail prop={detail} jobs={jobs} onBack={() => { setSelectedProp(null); window.scrollTo(0, 0); }} />
            : <PropertiesTab properties={properties} jobs={jobs} onSelect={openProperty} />
        )}

        {tab === 'admin' && <AdminTab profile={profile} properties={properties} />}
      </main>

      {/* Bottom tab bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50"
        style={{
          background: BARBG,
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderTop: `1px solid ${BORDER}`,
          paddingBottom: 'env(safe-area-inset-bottom)',
          boxShadow: '0 -6px 24px rgba(0,0,0,0.10)',
        }}
      >
        <div className="max-w-2xl mx-auto grid grid-cols-4">
          {TABS.map(({ key, label, icon: Icon }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => goTo(key as typeof tab)}
                className="flex flex-col items-center justify-center gap-1 py-2.5 transition-colors"
                style={{ color: active ? GREEN : MUTED }}
              >
                <Icon className="w-[21px] h-[21px]" strokeWidth={active ? 2.4 : 1.9} />
                <span className="text-[10.5px] font-bold tracking-tight">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
    </PaletteCtx.Provider>
  );
}
