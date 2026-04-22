/**
 * Airbnb / STR Cleaner Workflow — the canonical flow Brendan specified:
 *
 *   1. Clock On (big button, GPS geofence check)
 *   2. → Popup: "Any damage?" (1 of 2) — photo proof if yes, admin notified instantly
 *   3. → Popup: "Need more time?" (2 of 2) — photo evidence, admin approval
 *   4. → Active Clean: property SOPs + checklist + restocking + floating damage button
 *   5. → "Job Complete" button (NOT clock off yet)
 *   6. → Sequential photo reporting (room by room, one at a time)
 *   7. → Signatures (both cleaners if 2 assigned)
 *   8. → Clock off + SMS + invoice + redirect to next clean
 *
 * State machine drives the view — cleaner can only move FORWARD, never skip.
 */

import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { getCurrentPosition, haversineDistance } from '@/lib/geo';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { seedDefaultChecklist } from '@/components/clean-workflow/defaultChecklist';
import PreClockOnView from '@/components/clean-workflow/PreClockOnView';
import PreJobAssessmentModal from '@/components/clean-workflow/PreJobAssessmentModal';
import ClockedOnBanner from '@/components/clean-workflow/ClockedOnBanner';
import CleanerActiveView from '@/components/cleaner-portal/ActiveJobView';
import PhotoReportingWizard, { buildPhotoSections } from '@/components/clean-workflow/PhotoReportingWizard';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

type View =
  | 'pre_clock_on'   // Clock On button + property info
  | 'assessment'     // Damage + extra time popups (hard gate)
  | 'active'         // SOP checklist + timer + floating damage
  | 'photo_wizard'   // Sequential room-by-room photo reporting + signatures
  | 'done';          // Job completed — read-only

function resolveView(job: any): View {
  if (job.status === 'completed') return 'done';
  if (!job.clock_on) return 'pre_clock_on';
  // Hard gate: the assessment modal sets pre_clean_assessment_completed_at
  // only after BOTH damage + extra-time questions are answered. Using a
  // dedicated timestamp (vs. checking null on pre_clean_notes /
  // extra_time_requested) means defaults on those columns can't accidentally
  // skip the gate. (Brendan flagged 2026-04-22: Clock On was going straight
  // to active view.)
  if (!job.pre_clean_assessment_completed_at) return 'assessment';
  return 'active';
}

export default function CleanWorkflowPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [clockingOn, setClockingOn] = useState(false);
  const [geoDialog, setGeoDialog] = useState<{ type: 'failed' | 'far'; distance?: number } | null>(null);
  // Manual override: when cleaner taps "COMPLETE JOB" on the active view,
  // we transition to the photo wizard instead of immediately completing.
  const [showPhotoWizard, setShowPhotoWizard] = useState(false);

  const { data: job, isLoading, refetch } = useQuery({
    queryKey: ['clean-workflow-job', jobId],
    enabled: !!jobId && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('*, properties(*)')
        .eq('id', jobId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Fetch assigned cleaner profiles
  const cleanerIds = [job?.cleaner_1_id, job?.cleaner_2_id].filter(Boolean) as string[];
  const { data: profiles = [] } = useQuery({
    queryKey: ['clean-workflow-profiles', cleanerIds.join(',')],
    enabled: cleanerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name').in('id', cleanerIds);
      return (data ?? []).map((p: any) => ({ id: p.id, full_name: p.full_name || 'Unknown' }));
    },
  });

  // Client phone for click-to-call
  const { data: clientPhone } = useQuery({
    queryKey: ['clean-workflow-client-phone', job?.property_id],
    enabled: !!job?.property_id,
    queryFn: async () => {
      const { data: cpRows } = await supabase
        .from('client_properties')
        .select('client_id')
        .eq('property_id', job!.property_id)
        .limit(1);
      const clientId = (cpRows as any)?.[0]?.client_id;
      if (!clientId) return null;
      const { data: profile } = await supabase.from('profiles').select('phone').eq('id', clientId).maybeSingle();
      return profile?.phone || null;
    },
  });

  // Current cleaner's profile for the ActiveJobView
  const currentProfile = profiles.find(p => p.id === user?.id) || { id: user?.id || '', full_name: 'Cleaner' };

  const refreshJob = useCallback(async () => {
    await refetch();
    queryClient.invalidateQueries({ queryKey: ['my-cleans'] });
    queryClient.invalidateQueries({ queryKey: ['my-jobs-today'] });
    queryClient.invalidateQueries({ queryKey: ['today-jobs-widget'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-jobs'] });
    queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
  }, [refetch, queryClient]);

  async function performClockOn(lat: number | null, lng: number | null) {
    setClockingOn(true);
    const now = new Date().toISOString();

    const { error } = await supabase.from('jobs').update({
      clock_on: now,
      status: 'in_progress',
      clock_on_lat: lat,
      clock_on_lng: lng,
      arrived_at: now,
      arrived_lat: lat,
      arrived_lng: lng,
    }).eq('id', job!.id);

    if (error) {
      toast.error('Failed to clock on');
      setClockingOn(false);
      return;
    }

    // Removed seedDefaultChecklist — no auto-default checklist during clean.
    // Cleaner sees only property-specific SOPs (if any); Master Form at
    // clock-off covers everything. (Brendan 2026-04-22 directive.)

    await supabase.from('time_entries').insert({
      job_id: job!.id,
      user_id: user!.id,
      clock_in_time: now,
      clock_in_lat: lat,
      clock_in_lng: lng,
      geo_override: !lat,
    });

    // Record clock_in event
    supabase.from('clock_events').insert({
      user_id: user!.id,
      job_id: job!.id,
      event_type: 'clock_in',
      lat,
      lng,
    } as any).then(() => {}, () => {});

    // SMS to admin
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user!.id).maybeSingle();
    const cleanerName = profile?.full_name || 'A cleaner';
    const address = job!.properties?.address || job!.properties?.property_name || 'Unknown';
    const timeStr = format(new Date(), 'h:mm a');

    try {
      await supabase.functions.invoke('send-job-sms', {
        body: { to: 'ADMIN', message: `${cleanerName} clocked on at ${address} at ${timeStr}.` },
      });
    } catch { /* non-blocking */ }

    toast.success('Clocked on! Timer started.');
    setClockingOn(false);
    await refreshJob();
  }

  async function handleClockOn() {
    setGeoDialog(null);

    try {
      const pos = await getCurrentPosition();
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      const property = job!.properties as any;
      if (property?.lat && property?.lng) {
        const distance = haversineDistance(lat, lng, Number(property.lat), Number(property.lng));
        if (distance > 300) {
          setGeoDialog({ type: 'far', distance: Math.round(distance) });
          return;
        }
      }

      await performClockOn(lat, lng);
    } catch {
      setGeoDialog({ type: 'failed' });
    }
  }

  if (isLoading || !job) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const property = job.properties as any;
  const view = resolveView(job);

  // ── Done state ──
  if (view === 'done') {
    return (
      <PreClockOnView
        job={job}
        property={property}
        profiles={profiles}
        onClockOn={() => {}}
        clockingOn={false}
        clientPhone={clientPhone}
      />
    );
  }

  // ── Pre Clock On ──
  if (view === 'pre_clock_on') {
    return (
      <>
        <PreClockOnView
          job={job}
          property={property}
          profiles={profiles}
          onClockOn={handleClockOn}
          clockingOn={clockingOn}
          clientPhone={clientPhone}
        />
        {/* Geofence dialogs */}
        <AlertDialog open={geoDialog?.type === 'failed'} onOpenChange={() => setGeoDialog(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Location check failed</AlertDialogTitle>
              <AlertDialogDescription>
                You can still clock on — your location won't be verified.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => { setGeoDialog(null); performClockOn(null, null); }}>
                Clock On Anyway
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={geoDialog?.type === 'far'} onOpenChange={() => setGeoDialog(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you at the right property?</AlertDialogTitle>
              <AlertDialogDescription>
                You appear to be {geoDialog?.distance}m from {property?.address || 'the property'}.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={async () => {
                setGeoDialog(null);
                try {
                  const pos = await getCurrentPosition();
                  await performClockOn(pos.coords.latitude, pos.coords.longitude);
                } catch {
                  await performClockOn(null, null);
                }
              }}>
                Yes, I'm Here
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // ── Pre-Clean Assessment (hard gate — MUST answer both questions) ──
  if (view === 'assessment') {
    return (
      <>
        <ClockedOnBanner clockOn={job.clock_on} />
        <PreJobAssessmentModal
          job={job}
          property={property}
          userId={user!.id}
          onComplete={refreshJob}
        />
      </>
    );
  }

  // ── Photo Reporting Wizard (sequential room-by-room after COMPLETE JOB) ──
  if (showPhotoWizard) {
    const cleanType = (job as any)?.clean_type || property?.client_type || null;
    const photoSections = buildPhotoSections(property, cleanType);
    return (
      <PhotoReportingWizard
        job={job}
        property={property}
        sections={photoSections}
        cleanerProfiles={profiles}
        userId={user!.id}
        onComplete={() => {
          refreshJob();
          // Find next job for today and navigate, or go to /my-jobs
          navigate('/my-jobs');
        }}
      />
    );
  }

  // ── Active Clean — SOP checklist, restocking, floating damage, completion ──
  return (
    <div className="min-h-screen bg-background max-w-lg mx-auto">
      <ClockedOnBanner clockOn={job.clock_on} />
      {/* Header */}
      <div className="bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-extrabold truncate">
            {property?.property_name || job?.client_name || 'Active Clean'}
          </h1>
          <p className="text-xs text-primary-foreground/70 truncate">
            {property?.address || ''}
          </p>
        </div>
        <button
          onClick={() => navigate('/my-jobs')}
          className="text-xs text-primary-foreground/60 px-2 py-1 rounded-lg hover:bg-primary-foreground/10"
        >
          ← Back
        </button>
      </div>

      {/* Floating damage button — always visible */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border px-4 py-2 flex items-center justify-between">
        <button
          onClick={() => {
            navigate(`/clean/${job.id}/complete`);
          }}
          className="flex items-center gap-2 text-xs font-bold text-destructive hover:bg-destructive/10 px-3 py-2 rounded-xl transition-colors"
        >
          ⚠️ Report Damage / Issue
        </button>
        <span className="text-xs text-muted-foreground">
          {property?.bedrooms || '?'} bed · {property?.bathrooms || '?'} bath
        </span>
      </div>

      {/* The full SOP-driven active clean view */}
      <div className="px-4 py-4">
        <CleanerActiveView
          job={job}
          staff={currentProfile}
          property={property}
          onComplete={() => {
            // Don't immediately complete — transition to photo wizard
            setShowPhotoWizard(true);
          }}
        />
      </div>
    </div>
  );
}
