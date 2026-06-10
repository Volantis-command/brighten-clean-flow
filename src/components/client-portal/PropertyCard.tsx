import { format, differenceInHours } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CalendarPlus, Star, Wifi, WifiOff, Home, ChevronRight } from 'lucide-react';

interface PropertyCardProps {
  property: any;
  jobs: any[];
  cleanerProfiles: any[];
  latestAuditPct?: number | null;
  onClick?: () => void;
  rebookHref?: string;
  // 1–10 scores from job_feedback for cleans on this property.
  feedbackScores?: number[];
  // Most recent cleaner-uploaded photo of the property (any room) —
  // used as the hero image. No image set → gradient placeholder.
  heroImageUrl?: string | null;
}

// Stored 1–10 score → 1–5 star average (1 decimal).
function avgStars(scores: number[]): number | null {
  if (!scores.length) return null;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round((avg / 2) * 10) / 10;
}

type SyncBadge = { label: string; tone: 'good' | 'stale' | null };
function getSyncStatus(property: any): SyncBadge {
  // Hostaway takes priority — it's the richer integration.
  if (property.hostaway_listing_id) {
    return { label: 'Hostaway synced', tone: 'good' };
  }
  if (property.ical_url) {
    const last = property.ical_last_sync ? new Date(property.ical_last_sync) : null;
    if (!last) return { label: 'iCal pending', tone: 'stale' };
    const stale = differenceInHours(new Date(), last) > 24;
    return { label: stale ? 'iCal stale' : 'iCal synced', tone: stale ? 'stale' : 'good' };
  }
  return { label: '', tone: null };
}

// Deterministic hue per property name → consistent placeholder gradient
// even before any cleaning photos exist. Same name → same colors.
function gradientForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `linear-gradient(135deg, hsl(${hue} 45% 35%), hsl(${(hue + 40) % 360} 35% 25%))`;
}

// A job counts as "upcoming/active" for the client when it's been put on
// the schedule, regardless of whether the cleaner has accepted yet. The
// admin-side statuses we want surfaced to the client portal:
//   - scheduled / confirmed       → standard booked clean
//   - awaiting_cleaner /
//     awaiting_cleaner_acceptance → admin scheduled it, cleaner not yet
//                                   confirmed (still shows in portal as
//                                   "Scheduled" — client doesn't need to
//                                   know about the assignment dance)
//   - in_progress                 → cleaner is on site
const UPCOMING_STATUSES = [
  'scheduled',
  'confirmed',
  'awaiting_cleaner',
  'awaiting_cleaner_acceptance',
  'in_progress',
];

function getPropertyStatus(jobs: any[]) {
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  const todayJob = jobs.find(
    (j: any) => j.scheduled_date === todayStr && UPCOMING_STATUSES.includes(j.status)
  );
  if (todayJob) return { label: 'Clean Today', color: 'bg-primary/10 text-primary', dot: 'bg-primary' };

  const lastComplete = jobs.find((j: any) => j.status === 'complete' || j.status === 'completed');
  if (lastComplete) {
    const completedDate = new Date(lastComplete.scheduled_date + 'T00:00:00');
    const daysDiff = Math.floor((today.getTime() - completedDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff <= 2) return { label: 'Recently Cleaned', color: 'bg-primary/10 text-primary', dot: 'bg-primary' };
  }

  const nextScheduled = jobs.find(
    (j: any) => UPCOMING_STATUSES.includes(j.status) && j.scheduled_date >= todayStr
  );
  if (nextScheduled) return { label: 'Scheduled', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' };

  return { label: 'Awaiting Clean', color: 'bg-muted text-muted-foreground', dot: 'bg-gray-400' };
}

export default function PropertyCard({
  property,
  jobs,
  cleanerProfiles,
  latestAuditPct,
  onClick,
  rebookHref,
  feedbackScores = [],
  heroImageUrl,
}: PropertyCardProps) {
  const navigate = useNavigate();
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const statusInfo = getPropertyStatus(jobs);
  const lastCompleteJob = jobs.find((j: any) => j.status === 'complete' || j.status === 'completed');
  const nextScheduledJob = jobs.find(
    (j: any) => UPCOMING_STATUSES.includes(j.status) && j.scheduled_date >= todayStr
  );

  // Live "cleaning right now" — no realtime subscription needed at the
  // dashboard level, the in_progress flag is already in the jobs query
  // payload and refreshes on each portal load.
  const inProgressJob = jobs.find((j: any) => j.status === 'in_progress');
  const liveCleanerName = inProgressJob?.cleaner_1_id
    ? cleanerProfiles.find((p: any) => p.id === inProgressJob.cleaner_1_id)?.full_name?.split(' ')[0] || null
    : null;

  const getCleanerName = (id: string) => {
    const c = cleanerProfiles.find((p: any) => p.id === id);
    return c?.full_name?.split(' ')[0] || null;
  };

  const nextCleanerName = nextScheduledJob?.cleaner_1_id ? getCleanerName(nextScheduledJob.cleaner_1_id) : null;

  const ratingAvg = avgStars(feedbackScores);
  const sync = getSyncStatus(property);
  const hasMetaRow = ratingAvg !== null || sync.tone !== null;

  // Outer element is a div (not button) so we can nest a real button for
  // the rebook CTA — button-in-button is invalid HTML.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}
      className="bg-card rounded-2xl shadow-sm border border-border/50 text-left hover:shadow-md transition-shadow w-full cursor-pointer overflow-hidden"
    >
      {/* Hero — most recent cleaner photo, or a deterministic gradient. */}
      <div
        className="relative h-32 w-full"
        style={
          heroImageUrl
            ? { backgroundImage: `url(${heroImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : { background: gradientForName(property.property_name || 'Property') }
        }
      >
        {!heroImageUrl && (
          <Home className="absolute inset-0 m-auto w-10 h-10 text-white/30" />
        )}
        <div className={`absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold backdrop-blur-md ${statusInfo.color}`}>
          <div className={`w-2 h-2 rounded-full ${statusInfo.dot}`} />
          {statusInfo.label}
        </div>
      </div>

      <div className="p-5">
        {inProgressJob && (
          <div className="flex items-center gap-2 mb-3 -mt-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <span className="relative inline-flex">
              <span className="animate-ping absolute inline-flex h-2.5 w-2.5 rounded-full bg-amber-500 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
            </span>
            <span className="text-xs font-bold text-amber-700 dark:text-amber-200">
              {liveCleanerName ? `${liveCleanerName} is cleaning now` : 'Cleaning in progress'}
            </span>
          </div>
        )}

        <div className="mb-3">
          <h3 className="text-lg font-bold text-foreground">{property.property_name}</h3>
          <p className="text-sm text-muted-foreground">
            {[property.address, property.suburb].filter(Boolean).join(', ')}
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
          <span>{property.bedrooms || 0} bed / {property.bathrooms || 0} bath</span>
        </div>

        {hasMetaRow && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mb-3">
            {ratingAvg !== null && (
              <span className="inline-flex items-center gap-1 text-foreground">
                <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                <span className="font-bold">{ratingAvg.toFixed(1)}</span>
                <span className="text-muted-foreground">
                  ({feedbackScores.length} {feedbackScores.length === 1 ? 'review' : 'reviews'})
                </span>
              </span>
            )}
            {sync.tone && (
              <span
                className={`inline-flex items-center gap-1 ${
                  sync.tone === 'good' ? 'text-primary' : 'text-orange-500'
                }`}
              >
                {sync.tone === 'good' ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                {sync.label}
              </span>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">Next clean</span>
            <p className="font-semibold text-foreground">
              {nextScheduledJob
                ? format(new Date(nextScheduledJob.scheduled_date + 'T00:00:00'), 'EEE, d MMM') +
                  (nextScheduledJob.scheduled_time ? ' at ' + nextScheduledJob.scheduled_time.slice(0, 5) : '')
                : '—'}
            </p>
            {nextCleanerName && (
              <p className="text-xs text-muted-foreground mt-0.5">Your cleaner: {nextCleanerName}</p>
            )}
          </div>
          <div>
            <span className="text-muted-foreground">Last cleaned</span>
            <p className="font-semibold text-foreground">
              {lastCompleteJob
                ? format(new Date(lastCompleteJob.scheduled_date + 'T00:00:00'), 'dd MMM yyyy')
                : '—'}
            </p>
          </div>
          {latestAuditPct != null && (
            <div>
              <span className="text-muted-foreground">QC Score</span>
              <p className={`font-bold ${latestAuditPct >= 80 ? 'text-primary' : latestAuditPct >= 60 ? 'text-orange-500' : 'text-destructive'}`}>
                {latestAuditPct}%
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between">
          <span className="text-xs font-bold text-primary flex items-center gap-1">
            View clean history & reports <ChevronRight className="w-3.5 h-3.5" />
          </span>
          {rebookHref && (
            <Button
              size="sm"
              className="gap-1.5 font-bold"
              onClick={(e) => {
                e.stopPropagation();
                navigate(rebookHref);
              }}
            >
              <CalendarPlus className="w-4 h-4" />
              Book Clean
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
