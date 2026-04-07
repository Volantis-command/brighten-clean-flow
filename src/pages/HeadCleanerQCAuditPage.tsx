import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft,
  Check,
  ClipboardCheck,
  Loader2,
  X,
  AlertTriangle,
  MapPin,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { createAdminNotification, createNotification } from '@/lib/notifications';

const DEFAULT_ROOMS = [
  'Kitchen',
  'Living / Dining',
  'Master Bedroom',
  'Bedroom 2',
  'Bedroom 3',
  'Main Bathroom',
  'Ensuite',
  'Outdoor / BBQ',
  'Linen & Setup',
];

type Rating = 'pass' | 'pass_with_notes' | 'fail';

type RoomState = {
  room_name: string;
  rating: Rating | null;
  notes: string;
};

export default function HeadCleanerQCAuditPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [overallNotes, setOverallNotes] = useState('');
  const [positiveFeedback, setPositiveFeedback] = useState('');
  const [improvementFeedback, setImprovementFeedback] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: job, isLoading } = useQuery({
    queryKey: ['qc-job', jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select(
          'id, scheduled_date, scheduled_time, status, cleaner_1_id, cleaner_2_id, property_id, properties(property_name, address, bedrooms, bathrooms)'
        )
        .eq('id', jobId!)
        .maybeSingle();
      return data as any;
    },
  });

  const { data: existingAudit } = useQuery({
    queryKey: ['qc-existing-audit', jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data } = await supabase
        .from('qc_audits')
        .select('*')
        .eq('job_id', jobId!)
        .maybeSingle();
      return data as any;
    },
  });

  const { data: existingRooms } = useQuery({
    queryKey: ['qc-existing-rooms', existingAudit?.id],
    enabled: !!existingAudit?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('qc_audit_rooms')
        .select('*')
        .eq('audit_id', existingAudit!.id);
      return (data ?? []) as any[];
    },
  });

  const [rooms, setRooms] = useState<RoomState[]>([]);
  const initialised = useMemo(() => rooms.length > 0, [rooms]);

  useEffect(() => {
    if (initialised) return;
    // Build room list from property bedrooms/bathrooms or fall back to defaults
    let list = DEFAULT_ROOMS;
    if (job?.properties) {
      const beds = Number(job.properties.bedrooms) || 0;
      const baths = Number(job.properties.bathrooms) || 0;
      const dynamic = ['Kitchen', 'Living / Dining'];
      for (let i = 1; i <= beds; i++) dynamic.push(`Bedroom ${i}`);
      for (let i = 1; i <= baths; i++) dynamic.push(`Bathroom ${i}`);
      dynamic.push('Outdoor / BBQ', 'Linen & Setup');
      list = dynamic;
    }

    if (existingRooms && existingRooms.length > 0) {
      setRooms(
        existingRooms.map((r: any) => ({
          room_name: r.room_name,
          rating: r.rating as Rating,
          notes: r.notes || '',
        }))
      );
      if (existingAudit) {
        setOverallNotes(existingAudit.issues_text || '');
        setPositiveFeedback(existingAudit.positive_feedback || '');
        setImprovementFeedback(existingAudit.improvement_feedback || '');
      }
    } else {
      setRooms(list.map((r) => ({ room_name: r, rating: null, notes: '' })));
    }
  }, [job, existingRooms, existingAudit, initialised]);

  const setRoomRating = (idx: number, rating: Rating) => {
    setRooms((prev) => prev.map((r, i) => (i === idx ? { ...r, rating } : r)));
  };

  const setRoomNotes = (idx: number, notes: string) => {
    setRooms((prev) => prev.map((r, i) => (i === idx ? { ...r, notes } : r)));
  };

  const submit = async () => {
    if (!user || !job) return;
    if (rooms.some((r) => !r.rating)) {
      toast.error('Please rate every room before submitting.');
      return;
    }

    setBusy(true);
    try {
      const passes = rooms.filter((r) => r.rating === 'pass').length;
      const passWithNotes = rooms.filter((r) => r.rating === 'pass_with_notes').length;
      const fails = rooms.filter((r) => r.rating === 'fail').length;
      const totalScore = passes * 10 + passWithNotes * 7;
      const maxScore = rooms.length * 10;
      const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 10000) / 100 : 0;
      const result: 'pass' | 'fail' = fails > 0 ? 'fail' : 'pass';

      // Insert or update audit
      let auditId = existingAudit?.id as string | undefined;
      if (auditId) {
        await supabase
          .from('qc_audits')
          .update({
            inspector_id: user.id,
            audit_date: new Date().toISOString().slice(0, 10),
            total_score: totalScore,
            max_score: maxScore,
            percentage,
            result,
            issues_text: overallNotes || null,
            positive_feedback: positiveFeedback || null,
            improvement_feedback: improvementFeedback || null,
            action_required: fails > 0,
            cleaner_notified: true,
          })
          .eq('id', auditId);

        // Replace rooms
        await supabase.from('qc_audit_rooms').delete().eq('audit_id', auditId);
      } else {
        const { data: created, error: cErr } = await supabase
          .from('qc_audits')
          .insert({
            job_id: job.id,
            property_id: job.property_id,
            inspector_id: user.id,
            audit_date: new Date().toISOString().slice(0, 10),
            total_score: totalScore,
            max_score: maxScore,
            percentage,
            result,
            issues_text: overallNotes || null,
            positive_feedback: positiveFeedback || null,
            improvement_feedback: improvementFeedback || null,
            action_required: fails > 0,
            cleaner_notified: true,
          })
          .select('id')
          .single();
        if (cErr) throw cErr;
        auditId = created.id;
      }

      // Insert per-room rows
      const rows = rooms.map((r) => ({
        audit_id: auditId,
        room_name: r.room_name,
        rating: r.rating,
        notes: r.notes || null,
      }));
      await supabase.from('qc_audit_rooms').insert(rows);

      // On fail: create revisit job
      if (fails > 0) {
        const failedRoomNames = rooms
          .filter((r) => r.rating === 'fail')
          .map((r) => r.room_name)
          .join(', ');

        await supabase.from('jobs').insert({
          property_id: job.property_id,
          scheduled_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
          status: 'scheduled',
          notes: `QC REVISIT — failed rooms: ${failedRoomNames}. ${overallNotes ? `Notes: ${overallNotes}` : ''}`,
          cleaner_1_id: job.cleaner_1_id,
          cleaner_2_id: job.cleaner_2_id,
        });

        // Notify admin
        await createAdminNotification({
          type: 'qc_fail',
          title: 'QC Failed — Revisit Created',
          message: `${job.properties?.property_name || 'Property'} failed QC. Failed rooms: ${failedRoomNames}.`,
          link: `/qc/${job.id}`,
        });

        // Notify the assigned cleaners
        const cleanerIds = [job.cleaner_1_id, job.cleaner_2_id].filter(Boolean);
        for (const cId of cleanerIds) {
          await createNotification({
            userId: cId,
            type: 'qc_fail',
            title: 'QC Audit — Action Needed',
            message: `Your clean at ${job.properties?.property_name || 'a property'} needs a revisit. Failed rooms: ${failedRoomNames}.`,
            link: `/jobs/${job.id}`,
          });
        }

        // Notify the client via SMS
        if (job.property_id) {
          try {
            const { data: cpRows } = await supabase
              .from('client_properties')
              .select('client_id')
              .eq('property_id', job.property_id)
              .limit(1);
            // QC fail: internal only — no client SMS notification
            // Revisit is handled silently by admin
          } catch (e) {
            console.error('QC fail processing error:', e);
          }
        }

        toast.success('QC submitted — revisit job created.');
      } else {
        // On pass: notify cleaners with positive feedback
        const cleanerIds = [job.cleaner_1_id, job.cleaner_2_id].filter(Boolean);
        for (const cId of cleanerIds) {
          await createNotification({
            userId: cId,
            type: 'qc_pass',
            title: 'QC Audit — Passed ✓',
            message: `Great work on ${job.properties?.property_name || 'the property'}! ${percentage}% score.`,
            link: `/my-score`,
          });
        }
        toast.success('QC submitted — passed!');
      }

      navigate('/qc');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (isLoading || !job) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto pb-12">
      <button
        onClick={() => navigate('/qc')}
        className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
      >
        <ArrowLeft className="h-4 w-4" /> Back to QC list
      </button>

      <div>
        <h1 className="text-2xl font-extrabold text-foreground flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6 text-primary" /> QC Audit
        </h1>
        <p className="text-base font-bold text-foreground mt-2">
          {job.properties?.property_name || 'Property'}
        </p>
        {job.properties?.address && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <MapPin className="h-3 w-3" /> {job.properties.address}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          {job.scheduled_date ? format(new Date(job.scheduled_date), 'EEE d MMM yyyy') : ''}
        </p>
      </div>

      <div className="space-y-3">
        {rooms.map((r, idx) => (
          <div
            key={r.room_name}
            className="bg-card rounded-2xl border-2 border-border p-4 space-y-3"
          >
            <p className="font-bold text-foreground">{r.room_name}</p>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setRoomRating(idx, 'pass')}
                className={`rounded-xl border-2 py-3 text-xs font-bold flex items-center justify-center gap-1 ${
                  r.rating === 'pass'
                    ? 'bg-emerald-500 border-emerald-600 text-white'
                    : 'bg-card border-border text-foreground'
                }`}
              >
                <Check className="h-4 w-4" /> Pass
              </button>
              <button
                onClick={() => setRoomRating(idx, 'pass_with_notes')}
                className={`rounded-xl border-2 py-3 text-xs font-bold flex items-center justify-center gap-1 ${
                  r.rating === 'pass_with_notes'
                    ? 'bg-amber-400 border-amber-500 text-amber-900'
                    : 'bg-card border-border text-foreground'
                }`}
              >
                <AlertTriangle className="h-4 w-4" /> Notes
              </button>
              <button
                onClick={() => setRoomRating(idx, 'fail')}
                className={`rounded-xl border-2 py-3 text-xs font-bold flex items-center justify-center gap-1 ${
                  r.rating === 'fail'
                    ? 'bg-destructive border-destructive text-destructive-foreground'
                    : 'bg-card border-border text-foreground'
                }`}
              >
                <X className="h-4 w-4" /> Fail
              </button>
            </div>
            {(r.rating === 'pass_with_notes' || r.rating === 'fail') && (
              <Textarea
                placeholder="Notes for this room…"
                value={r.notes}
                onChange={(e) => setRoomNotes(idx, e.target.value)}
                className="text-sm"
              />
            )}
          </div>
        ))}
      </div>

      <div className="space-y-3 bg-card rounded-2xl border-2 border-border p-4">
        <p className="font-bold text-foreground">Overall feedback</p>
        <div>
          <label className="text-xs font-bold text-muted-foreground uppercase">
            Issues / what to fix
          </label>
          <Textarea
            value={overallNotes}
            onChange={(e) => setOverallNotes(e.target.value)}
            placeholder="Anything noticed across the whole job…"
            className="text-sm mt-1"
          />
        </div>
        <div>
          <label className="text-xs font-bold text-muted-foreground uppercase">
            Positive feedback (visible to cleaner)
          </label>
          <Textarea
            value={positiveFeedback}
            onChange={(e) => setPositiveFeedback(e.target.value)}
            placeholder="What was done well…"
            className="text-sm mt-1"
          />
        </div>
        <div>
          <label className="text-xs font-bold text-muted-foreground uppercase">
            Areas to improve (visible to cleaner)
          </label>
          <Textarea
            value={improvementFeedback}
            onChange={(e) => setImprovementFeedback(e.target.value)}
            placeholder="Coaching notes for the cleaner…"
            className="text-sm mt-1"
          />
        </div>
      </div>

      <Button
        onClick={submit}
        disabled={busy}
        className="w-full h-14 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-extrabold text-base"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Submit QC Audit'}
      </Button>
    </div>
  );
}
