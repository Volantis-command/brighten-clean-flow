import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, Star, Camera, Loader2, X, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { sendJobSms } from '@/lib/sendJobSms';

const AREA_OPTIONS = ['Bedrooms', 'Bathrooms', 'Kitchen', 'Living Areas', 'Laundry', 'Outdoor', 'General'];
const OUTCOMES = [
  { value: 'passed', label: 'Audit Passed — satisfied with standard', color: 'bg-brightly/10 text-brightly border-green-300' },
  { value: 'minor_fixes', label: 'Minor Fixes Completed on the Spot', color: 'bg-[rgba(251,191,36,0.15)] text-[#FCD34D] border-amber-300' },
  { value: 'return_required', label: 'Return Required — property needs re-clean', color: 'bg-[rgba(248,113,113,0.15)] text-[#F87171] border-red-300' },
];

export default function JobAuditPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [rating, setRating] = useState(0);
  const [areas, setAreas] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { data: job, isLoading } = useQuery({
    queryKey: ['audit-job', jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('*, properties(property_name, address)')
        .eq('id', jobId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !job) return;
    setUploading(true);
    const path = `jobs/${job.id}/audit_${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('job-photos').upload(path, file, { contentType: file.type });
    if (!error) {
      const { data } = supabase.storage.from('job-photos').getPublicUrl(path);
      setPhotos(prev => [...prev, data.publicUrl]);
    }
    setUploading(false);
    e.target.value = '';
  }

  async function handleSubmit() {
    if (!job || !user || !outcome || rating === 0) {
      toast.error('Please complete rating and outcome');
      return;
    }
    setSubmitting(true);

    const now = new Date().toISOString();

    // Save audit data to job
    await supabase.from('jobs').update({
      audited_by: user.id,
      audit_rating: rating,
      audit_notes: notes || null,
      audit_areas: areas.length > 0 ? areas : null,
      audit_outcome: outcome,
      audit_photos: photos.length > 0 ? photos : null,
      audit_completed_at: now,
    }).eq('id', job.id);

    // Append audit_rating to each assigned cleaner's audit_scores
    const cleanerIds = [job.cleaner_1_id, job.cleaner_2_id].filter(Boolean) as string[];
    for (const cId of cleanerIds) {
      const { data: profile } = await supabase.from('profiles').select('audit_scores').eq('id', cId).maybeSingle();
      const existing = (profile?.audit_scores as number[]) || [];
      await supabase.from('profiles').update({
        audit_scores: [...existing, rating],
      }).eq('id', cId);
    }

    // If return_required, SMS admin
    if (outcome === 'return_required') {
      try {
        const { data: auditorProfile } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
        const auditorName = auditorProfile?.full_name || 'An auditor';
        const addr = (job.properties as any)?.address || (job.properties as any)?.property_name || 'Unknown';
        await sendJobSms({
          to: 'ADMIN',
          message: `RE-CLEAN REQUIRED — ${addr} failed quality audit by ${auditorName}. Job: app.brightly.cleaning/jobs/${job.id}`,
        });
      } catch { /* non-blocking */ }

      await (await import('@/lib/alerts')).createAlert({
        event_type: 'qc_fail',
        title: 'Re-Clean Required',
        body: `${(job.properties as any)?.property_name} failed quality audit. Return required.`,
        link: `/jobs/${job.id}`,
      });
    }

    queryClient.invalidateQueries({ queryKey: ['job-detail', jobId] });
    toast.success('Audit submitted');
    setSubmitting(false);
    navigate(`/jobs/${job.id}`);
  }

  if (isLoading || !job) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const property = job.properties as any;

  return (
    <div className="space-y-6 max-w-lg mx-auto pb-8">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-extrabold text-foreground">Quality Audit</h1>
      </div>

      <div className="px-1">
        <p className="font-bold text-foreground">{property?.property_name}</p>
        <p className="text-sm text-muted-foreground">{property?.address}</p>
      </div>

      {/* Rating */}
      <Card className="border-border">
        <CardContent className="p-5 space-y-3">
          <h3 className="font-bold text-foreground">Overall Standard — Rate 1 to 5</h3>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                onClick={() => setRating(n)}
                className="p-1"
              >
                <Star
                  className={`h-8 w-8 transition-colors ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`}
                />
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Areas */}
      <Card className="border-border">
        <CardContent className="p-5 space-y-3">
          <h3 className="font-bold text-foreground">Areas Needing Attention (optional)</h3>
          <div className="flex flex-wrap gap-2">
            {AREA_OPTIONS.map(area => (
              <button
                key={area}
                onClick={() => setAreas(prev => prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area])}
                className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  areas.includes(area) ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border'
                }`}
              >
                {area}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card className="border-border">
        <CardContent className="p-5 space-y-3">
          <h3 className="font-bold text-foreground">Feedback for the team (optional)</h3>
          <Textarea
            placeholder="Notes..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="min-h-[80px] rounded-xl"
          />
        </CardContent>
      </Card>

      {/* Outcome */}
      <Card className="border-border">
        <CardContent className="p-5 space-y-3">
          <h3 className="font-bold text-foreground">Outcome</h3>
          <div className="space-y-2">
            {OUTCOMES.map(o => (
              <button
                key={o.value}
                onClick={() => setOutcome(o.value)}
                className={`w-full text-left p-4 rounded-xl border-2 font-medium text-sm transition-colors ${
                  outcome === o.value ? o.color : 'border-border bg-card text-foreground'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Photos */}
      <Card className="border-border">
        <CardContent className="p-5 space-y-3">
          <h3 className="font-bold text-foreground">Photo Evidence (optional)</h3>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
          <div className="grid grid-cols-3 gap-2">
            {photos.map((url, i) => (
              <div key={i} className="relative">
                <img src={url} alt="" className="w-full aspect-square object-cover rounded-xl" />
                <button
                  onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                  className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full aspect-square border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center text-muted-foreground"
            >
              {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
              <span className="text-[10px] font-bold mt-1">Add Photo</span>
            </button>
          </div>
        </CardContent>
      </Card>

      <Button
        size="lg"
        className="w-full h-16 rounded-2xl font-extrabold text-lg"
        onClick={handleSubmit}
        disabled={submitting || rating === 0 || !outcome}
      >
        {submitting ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : <CheckCircle2 className="h-6 w-6 mr-2" />}
        Submit Audit
      </Button>
    </div>
  );
}
