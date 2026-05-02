import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ChevronRight, Star, Calendar } from 'lucide-react';
import { format, addDays, parseISO } from 'date-fns';
import PropertyCard from '@/components/client-portal/PropertyCard';

/* ── Brand tokens ──────────────────────────────────────────────── */
const BG     = '#173A27';
const CARD   = '#1F4A32';
const BORDER = 'rgba(255,255,255,0.10)';
const YELLOW = '#FEDB00';
const WHITE  = '#FFFFFF';
const MUTED  = 'rgba(255,255,255,0.55)';

const ACTIVE_STATUSES = ['confirmed', 'scheduled', 'pending_cleaner', 'awaiting_cleaner_acceptance', 'in_progress'];

function statusLabel(s: string) {
  if (s === 'confirmed' || s === 'scheduled') return 'Confirmed';
  if (s === 'in_progress') return 'In Progress';
  return 'Scheduled';
}
function statusColor(s: string) {
  if (s === 'in_progress') return '#60A5FA';
  return '#4ADE80';
}

/* ── Interactive 28-day calendar strip ─────────────────────────── */
function UpcomingCalendar({ jobs, properties }: { jobs: any[]; properties: any[] }) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const today = new Date();
  const days = Array.from({ length: 28 }, (_, i) => addDays(today, i));

  const upcomingJobs = jobs.filter(j =>
    j.scheduled_date >= format(today, 'yyyy-MM-dd') &&
    ACTIVE_STATUSES.includes(j.status)
  );

  const jobsByDate: Record<string, any[]> = {};
  upcomingJobs.forEach(j => {
    if (!jobsByDate[j.scheduled_date]) jobsByDate[j.scheduled_date] = [];
    jobsByDate[j.scheduled_date].push(j);
  });

  const selectedJobs = selectedDate ? (jobsByDate[selectedDate] || []) : [];

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-center gap-2.5">
        <Calendar className="w-4 h-4" style={{ color: YELLOW }} />
        <span className="text-xs font-bold tracking-widest uppercase" style={{ color: YELLOW }}>
          Upcoming Cleans
        </span>
        {upcomingJobs.length > 0 && (
          <span
            className="ml-auto text-xs font-bold px-2.5 py-0.5 rounded-full"
            style={{ background: 'rgba(74,222,128,0.15)', color: '#4ADE80' }}
          >
            {upcomingJobs.length} scheduled
          </span>
        )}
      </div>

      {/* Day strip — horizontal scroll */}
      <div className="px-4 pb-4 overflow-x-auto">
        <div className="flex gap-2" style={{ minWidth: 'max-content' }}>
          {days.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const isToday = dateStr === format(today, 'yyyy-MM-dd');
            const hasClean = !!jobsByDate[dateStr]?.length;
            const isSelected = selectedDate === dateStr;

            let bg = 'rgba(0,0,0,0.20)';
            let numColor = WHITE;
            let ring = 'none';

            if (isSelected) {
              bg = YELLOW;
              numColor = '#111';
            } else if (hasClean) {
              bg = 'rgba(74,222,128,0.18)';
              numColor = '#4ADE80';
            } else if (isToday) {
              ring = `2px solid ${YELLOW}`;
            }

            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                className="flex flex-col items-center rounded-xl transition-all duration-150 cursor-pointer"
                style={{
                  width: 48,
                  paddingTop: 8,
                  paddingBottom: 10,
                  background: bg,
                  outline: ring,
                }}
              >
                <span className="text-[10px] font-semibold mb-1" style={{ color: isSelected ? 'rgba(0,0,0,0.55)' : MUTED }}>
                  {format(day, 'EEE')}
                </span>
                <span className="text-base font-extrabold leading-none" style={{ color: numColor }}>
                  {format(day, 'd')}
                </span>
                {hasClean && !isSelected && (
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5" style={{ background: '#4ADE80' }} />
                )}
                {isSelected && (
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5" style={{ background: 'rgba(0,0,0,0.3)' }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day details */}
      {selectedDate && (
        <div
          className="mx-4 mb-4 rounded-xl p-4 space-y-3"
          style={{ background: 'rgba(0,0,0,0.20)', border: `1px solid ${BORDER}` }}
        >
          <p className="text-xs font-bold" style={{ color: MUTED }}>
            {format(parseISO(selectedDate), 'EEEE, d MMMM')}
          </p>
          {selectedJobs.length === 0 ? (
            <p className="text-sm" style={{ color: MUTED }}>No cleans scheduled this day.</p>
          ) : (
            selectedJobs.map((j: any) => {
              const prop = properties.find(p => p.id === j.property_id);
              return (
                <div key={j.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: WHITE }}>
                      {prop?.property_name || prop?.address || 'Your property'}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                      {j.scheduled_time ? format(parseISO(`${j.scheduled_date}T${j.scheduled_time}`), 'h:mm a') : 'Time TBC'}
                    </p>
                  </div>
                  <span
                    className="text-xs font-bold px-2.5 py-1 rounded-full"
                    style={{ background: 'rgba(74,222,128,0.15)', color: statusColor(j.status) }}
                  >
                    {statusLabel(j.status)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}

      {upcomingJobs.length === 0 && (
        <div className="px-5 pb-5 text-center">
          <p className="text-sm" style={{ color: MUTED }}>No upcoming cleans in the next 28 days.</p>
        </div>
      )}
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────────── */
export default function MagicLinkPortalPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

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
  const clientId = clientProp?.[0]?.client_id;

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
      const { data } = await supabase.from('profiles').select('full_name').eq('id', clientId).single();
      return data;
    },
    enabled: !!clientId,
  });

  const { data: jobs = [] } = useQuery({
    queryKey: ['magic-jobs', propertyIds],
    queryFn: async () => {
      if (!propertyIds.length) return [];
      const { data } = await supabase
        .from('jobs').select('*').in('property_id', propertyIds).order('scheduled_date', { ascending: false });
      return data || [];
    },
    enabled: propertyIds.length > 0,
  });

  const cleanerIds = [...new Set(jobs.flatMap((j: any) => [j.cleaner_1_id, j.cleaner_2_id]).filter(Boolean))];
  const { data: cleanerProfiles = [] } = useQuery({
    queryKey: ['magic-cleaners', cleanerIds],
    queryFn: async () => {
      if (!cleanerIds.length) return [];
      const { data } = await supabase.from('profiles').select('id, full_name').in('id', cleanerIds);
      return data || [];
    },
    enabled: cleanerIds.length > 0,
  });

  const { data: audits = [] } = useQuery({
    queryKey: ['magic-audits', propertyIds],
    queryFn: async () => {
      if (!propertyIds.length) return [];
      const { data } = await supabase
        .from('qc_audits').select('property_id, percentage, audit_date')
        .in('property_id', propertyIds).order('audit_date', { ascending: false });
      return data || [];
    },
    enabled: propertyIds.length > 0,
  });

  const { data: feedback = [] } = useQuery({
    queryKey: ['magic-feedback', propertyIds],
    queryFn: async () => {
      if (!propertyIds.length) return [];
      const { data } = await supabase
        .from('job_feedback').select('property_id, score').in('property_id', propertyIds).not('score', 'is', null);
      return data || [];
    },
    enabled: propertyIds.length > 0,
  });

  const { data: photos = [] } = useQuery({
    queryKey: ['magic-hero-photos', propertyIds],
    queryFn: async () => {
      if (!propertyIds.length) return [];
      const { data } = await supabase
        .from('job_photos').select('public_url, uploaded_at, jobs!inner(property_id)')
        .in('jobs.property_id', propertyIds).order('uploaded_at', { ascending: false });
      return (data || []).map((row: any) => ({
        property_id: row.jobs?.property_id,
        file_url: row.public_url,
        taken_at: row.uploaded_at,
      }));
    },
    enabled: propertyIds.length > 0,
  });

  /* ── Derived values ─────────────────────────────────────────── */
  const scoresByProperty: Record<string, number[]> = {};
  (feedback as any[]).forEach((f: any) => {
    if (!scoresByProperty[f.property_id]) scoresByProperty[f.property_id] = [];
    scoresByProperty[f.property_id].push(f.score);
  });

  const heroByProperty: Record<string, string | null> = {};
  (photos as any[]).forEach((p: any) => {
    if (!heroByProperty[p.property_id] && p.file_url) heroByProperty[p.property_id] = p.file_url;
  });

  const today = format(new Date(), 'yyyy-MM-dd');
  const upcomingCount = jobs.filter((j: any) =>
    j.scheduled_date >= today && ACTIVE_STATUSES.includes(j.status)
  ).length;

  const lastCompleted = jobs
    .filter((j: any) => j.status === 'completed')
    .sort((a: any, b: any) => b.scheduled_date.localeCompare(a.scheduled_date))[0];

  const allScores = (feedback as any[]).map((f: any) => f.score).filter(Boolean);
  const avgScore = allScores.length > 0 ? Math.round(allScores.reduce((s: number, v: number) => s + v, 0) / allScores.length) : null;

  const isLoading = loadingToken || loadingProps;
  const firstName = profile?.full_name?.split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

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
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center" style={{ background: BG }}>
        <p className="text-4xl mb-3">🔒</p>
        <p className="text-lg font-bold" style={{ color: WHITE }}>Invalid or inactive portal link</p>
        <p className="text-sm mt-1" style={{ color: MUTED }}>Contact Brightly for a new link.</p>
      </div>
    );
  }

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen" style={{ background: BG }}>

      {/* ── Sticky header ────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40 px-5 py-3 flex items-center justify-between"
        style={{ background: BG, borderBottom: `1px solid ${BORDER}` }}
      >
        <span className="text-xl font-extrabold" style={{ color: WHITE }}>
          Brightly<span style={{ color: YELLOW }}>.</span>
        </span>
        <span
          className="text-xs font-semibold px-2.5 py-1 rounded-full"
          style={{ background: 'rgba(255,255,255,0.10)', color: MUTED }}
        >
          Client Portal
        </span>
      </header>

      <main className="max-w-2xl mx-auto px-5 py-8 space-y-8">

        {/* ── Hero greeting ─────────────────────────────────── */}
        <div className="space-y-1">
          <p className="text-xs font-bold tracking-widest uppercase" style={{ color: YELLOW }}>
            Welcome back
          </p>
          <h1 className="text-3xl font-extrabold leading-tight" style={{ color: WHITE }}>
            {greeting},<br />{firstName}.
          </h1>
          <p className="text-base mt-2" style={{ color: MUTED }}>
            Your {properties.length === 1 ? 'property is' : 'properties are'} in good hands.
          </p>
        </div>

        {/* ── Stats strip ───────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              value: upcomingCount > 0 ? upcomingCount : '—',
              label: 'Upcoming cleans',
              color: '#4ADE80',
            },
            {
              value: lastCompleted
                ? format(parseISO(lastCompleted.scheduled_date), 'd MMM')
                : '—',
              label: 'Last cleaned',
              color: WHITE,
            },
            {
              value: avgScore ? `${avgScore}%` : '—',
              label: 'Avg quality score',
              color: avgScore && avgScore >= 90 ? '#4ADE80' : avgScore ? YELLOW : WHITE,
            },
          ].map(stat => (
            <div
              key={stat.label}
              className="rounded-2xl p-4 text-center"
              style={{ background: CARD, border: `1px solid ${BORDER}` }}
            >
              <p className="text-xl font-extrabold leading-tight" style={{ color: stat.color }}>
                {stat.value}
              </p>
              <p className="text-[11px] mt-1 leading-tight" style={{ color: MUTED }}>
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        {/* ── Interactive calendar ───────────────────────────── */}
        <UpcomingCalendar jobs={jobs} properties={properties} />

        {/* ── Properties ────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-bold tracking-widest uppercase" style={{ color: YELLOW }}>
              {properties.length === 1 ? 'Your Property' : 'Your Properties'}
            </span>
            <div className="flex-1 h-px" style={{ background: BORDER }} />
          </div>

          <div className="grid grid-cols-1 gap-4">
            {properties.map((prop: any) => {
              const propJobs = jobs.filter((j: any) => j.property_id === prop.id);
              const latestAudit = audits.find((a: any) => a.property_id === prop.id);
              return (
                <PropertyCard
                  key={prop.id}
                  property={prop}
                  jobs={propJobs}
                  cleanerProfiles={cleanerProfiles}
                  latestAuditPct={latestAudit?.percentage}
                  onClick={() => navigate(`/client/${token}/property/${prop.id}`)}
                  rebookHref={`/client/${token}/property/${prop.id}/rebook`}
                  feedbackScores={scoresByProperty[prop.id] || []}
                  heroImageUrl={prop.hero_image_url || heroByProperty[prop.id] || null}
                />
              );
            })}
          </div>
        </div>

        {/* ── Footer ────────────────────────────────────────── */}
        <div className="text-center pt-6 pb-4 space-y-1">
          <p className="text-sm font-extrabold" style={{ color: 'rgba(255,255,255,0.20)' }}>
            Brightly<span style={{ color: 'rgba(254,219,0,0.3)' }}>.</span>
          </p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.20)' }}>
            Powered by Brightly Cleaning
          </p>
        </div>

      </main>
    </div>
  );
}
