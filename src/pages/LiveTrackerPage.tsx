import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Phone, Star, CheckCircle2, Camera, CalendarDays, Car, Sparkles } from 'lucide-react';
import { Logo } from '@/components/Logo';

/* ─── Brightly brand (Quote-Dark) ─── */
const BG = '#0B0F17';
const CARD = 'rgba(19,25,32,0.85)';
const GREEN = '#4ADE80';
const YELLOW = '#FEDB00';
const BORDER = 'rgba(74,222,128,0.18)';
const FONT = "'Inter', ui-sans-serif, system-ui, sans-serif";

interface Tracker {
  property: { name: string; suburb: string };
  isAirbnb: boolean;
  status: string;
  stage: 'scheduled' | 'enroute' | 'in_progress' | 'guest_ready';
  scheduled_date: string | null;
  scheduled_time: string | null;
  cleaner: { firstName: string; rating: number | null; completedJobs: number } | null;
  timeline: { arrived_at: string | null; started_at: string | null; completed_at: string | null };
  progress: { roomsTotal: number; roomsDone: number; itemsTotal: number; itemsDone: number };
  photoCount: number;
  guestReady: boolean;
  reportUrl: string | null;
}

const STAGES = ['scheduled', 'enroute', 'in_progress', 'guest_ready'] as const;

const STEP_META: Record<string, { icon: any; label: string; sub: (t: Tracker) => string }> = {
  scheduled: {
    icon: CalendarDays,
    label: 'Scheduled',
    sub: (t) => {
      if (!t.scheduled_date) return 'Booked in';
      const d = new Date(t.scheduled_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
      const time = t.scheduled_time ? ` · ${t.scheduled_time.slice(0, 5)}` : '';
      return `${d}${time}`;
    },
  },
  enroute: {
    icon: Car,
    label: 'Cleaner on the way',
    sub: (t) => (t.cleaner ? `${t.cleaner.firstName} is heading over` : 'Cleaner assigned'),
  },
  in_progress: {
    icon: Sparkles,
    label: 'Clean in progress',
    sub: (t) => (t.progress.roomsTotal > 0 ? `${t.progress.roomsDone} of ${t.progress.roomsTotal} rooms done` : 'Working through the property'),
  },
  guest_ready: {
    icon: CheckCircle2,
    label: 'Guest Ready',
    sub: (t) => (t.photoCount > 0 ? `${t.photoCount} photos · tap to view proof` : 'Spotless and ready for your guest'),
  },
};

export default function LiveTrackerPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [data, setData] = useState<Tracker | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const fetchData = useCallback(async () => {
    if (!jobId) { setNotFound(true); setLoading(false); return; }
    try {
      const { data: res, error } = await supabase.functions.invoke('turnover-tracker-data', {
        body: { job_id: jobId },
      });
      if (error || !res?.ok) { setNotFound(true); }
      else { setData(res as Tracker); setNotFound(false); }
    } catch {
      setNotFound(true);
    }
    setLoading(false);
  }, [jobId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Live polling — refresh every 20s while the page is open, and whenever the
  // host refocuses the tab, so the status feels live without a websocket.
  useEffect(() => {
    const id = setInterval(fetchData, 20000);
    const onFocus = () => fetchData();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [fetchData]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: GREEN }} />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: BG, fontFamily: FONT }}>
        <p className="text-2xl font-extrabold" style={{ color: YELLOW }}><Logo variant="cream" className="h-9 w-auto inline-block" /></p>
        <h1 className="text-xl font-bold text-white mt-6">Tracker not available</h1>
        <p className="text-white/50 mt-2 text-sm">This link may be invalid or the clean isn't scheduled yet.</p>
        <a href="tel:0418878707" className="inline-flex items-center gap-2 mt-6 text-sm font-bold" style={{ color: YELLOW }}>
          <Phone className="w-4 h-4" /> 0418 878 707
        </a>
      </div>
    );
  }

  const currentIdx = STAGES.indexOf(data.stage);
  const t = data;

  return (
    <div className="min-h-screen" style={{ background: BG, color: '#F8FAFC', fontFamily: FONT }}>
      <div className="max-w-md mx-auto px-5 pb-16">
        {/* Header */}
        <header className="pt-8 pb-2 text-center">
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: YELLOW }}>
            <Logo variant="cream" className="h-9 w-auto inline-block" />
          </h1>
          <p className="text-white/40 text-xs font-bold uppercase tracking-widest mt-5">Live Turnover Tracker</p>
          <p className="text-white text-lg font-extrabold mt-1">{t.property.name}</p>
          {t.property.suburb && <p className="text-white/50 text-sm">{t.property.suburb}</p>}
        </header>

        {/* Hero — current stage */}
        <div className="rounded-3xl p-6 mt-6 text-center relative overflow-hidden" style={{ background: CARD, border: `1px solid ${BORDER}`, backdropFilter: 'blur(16px)' }}>
          {(() => {
            const meta = STEP_META[t.stage];
            const Icon = meta.icon;
            const done = t.stage === 'guest_ready';
            return (
              <>
                <div className="mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-4"
                  style={{ background: done ? 'rgba(74,222,128,0.15)' : 'rgba(254,219,0,0.12)', border: `1px solid ${done ? BORDER : 'rgba(254,219,0,0.3)'}` }}>
                  <Icon className="w-9 h-9" style={{ color: done ? GREEN : YELLOW }} />
                </div>
                <h2 className="text-2xl font-extrabold text-white">{meta.label}</h2>
                <p className="text-white/60 text-sm mt-1">{meta.sub(t)}</p>

                {/* In-progress bar */}
                {t.stage === 'in_progress' && t.progress.roomsTotal > 0 && (
                  <div className="mt-4">
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.round((t.progress.roomsDone / t.progress.roomsTotal) * 100)}%`, background: GREEN }} />
                    </div>
                  </div>
                )}

                {/* Guest-ready CTA */}
                {t.guestReady && t.reportUrl && (
                  <a href={t.reportUrl}
                    className="inline-flex items-center justify-center gap-2 mt-5 w-full py-3.5 rounded-2xl font-extrabold"
                    style={{ background: GREEN, color: '#0B0F17' }}>
                    <Camera className="w-5 h-5" /> View Photo Report
                  </a>
                )}
              </>
            );
          })()}
        </div>

        {/* Stepper */}
        <div className="mt-6 space-y-1">
          {STAGES.map((s, i) => {
            const meta = STEP_META[s];
            const Icon = meta.icon;
            const isDone = i < currentIdx;
            const isCurrent = i === currentIdx;
            const color = isDone ? GREEN : isCurrent ? YELLOW : 'rgba(255,255,255,0.25)';
            return (
              <div key={s} className="flex items-start gap-4">
                {/* Rail */}
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
                    style={{
                      background: isDone ? 'rgba(74,222,128,0.15)' : isCurrent ? 'rgba(254,219,0,0.12)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${isDone ? BORDER : isCurrent ? 'rgba(254,219,0,0.3)' : 'rgba(255,255,255,0.08)'}`,
                    }}>
                    {isDone ? <CheckCircle2 className="w-5 h-5" style={{ color: GREEN }} /> : <Icon className="w-4 h-4" style={{ color }} />}
                  </div>
                  {i < STAGES.length - 1 && (
                    <div className="w-0.5 flex-1 min-h-[28px]" style={{ background: isDone ? BORDER : 'rgba(255,255,255,0.08)' }} />
                  )}
                </div>
                {/* Label */}
                <div className={`pb-4 pt-1 ${isCurrent ? '' : 'opacity-80'}`}>
                  <p className="font-bold text-sm" style={{ color: isCurrent ? '#FFFFFF' : isDone ? '#FFFFFF' : 'rgba(255,255,255,0.4)' }}>
                    {meta.label}
                  </p>
                  {(isCurrent || isDone) && <p className="text-white/45 text-xs mt-0.5">{meta.sub(t)}</p>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Cleaner card */}
        {t.cleaner && (
          <div className="rounded-2xl p-4 mt-4 flex items-center gap-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center font-extrabold text-lg flex-shrink-0"
              style={{ background: 'rgba(74,222,128,0.15)', color: GREEN }}>
              {t.cleaner.firstName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold">{t.cleaner.firstName}</p>
              <div className="flex items-center gap-3 text-xs text-white/50 mt-0.5">
                {t.cleaner.rating != null && (
                  <span className="inline-flex items-center gap-1">
                    <Star className="w-3.5 h-3.5" style={{ color: YELLOW, fill: YELLOW }} /> {t.cleaner.rating.toFixed(1)}
                  </span>
                )}
                {t.cleaner.completedJobs > 0 && <span>{t.cleaner.completedJobs} cleans completed</span>}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center pt-8 space-y-2">
          <a href="tel:0418878707" className="inline-flex items-center gap-2 text-sm font-bold" style={{ color: YELLOW }}>
            <Phone className="w-4 h-4" /> Questions? 0418 878 707
          </a>
          <p className="text-white/20 text-xs">Brightly Cleaning — live turnover tracking</p>
        </div>
      </div>
    </div>
  );
}
