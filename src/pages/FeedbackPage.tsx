import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Star, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const REASONS = [
  'Bathroom not cleaned properly', 'Kitchen missed', 'Floors not mopped/vacuumed',
  'Beds not made correctly', 'Linen not changed', 'Consumables not restocked',
  'Took too long', 'Cleaner was not professional', 'Other',
];

const ATTENTION_AREAS = [
  'Kitchen deep clean', 'Oven', 'Bathrooms', 'Windows', 'Balcony/outdoor',
  'Under furniture', 'Ceiling fans', 'Fridge', 'No specific areas',
];

export default function FeedbackPage() {
  const { token } = useParams<{ token: string }>();
  const [step, setStep] = useState(1);
  const [score, setScore] = useState<number | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);
  const [reasonComment, setReasonComment] = useState('');
  const [attentionAreas, setAttentionAreas] = useState<string[]>([]);
  const [attentionComment, setAttentionComment] = useState('');
  const [sameCleaner, setSameCleaner] = useState<string>('no_preference');
  const [nps, setNps] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Look up job by feedback token
  const { data: feedback, isLoading } = useQuery({
    queryKey: ['feedback-token', token],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_feedback' as any)
        .select('*')
        .eq('feedback_token', token!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!token,
  });

  // Fetch job details
  const { data: job } = useQuery({
    queryKey: ['feedback-job', feedback?.job_id],
    queryFn: async () => {
      const { data } = await supabase.from('jobs').select('*, properties(property_name, suburb)').eq('id', feedback.job_id).single();
      return data as any;
    },
    enabled: !!feedback?.job_id,
  });

  const toggleReason = (r: string) => setReasons(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  const toggleArea = (a: string) => setAttentionAreas(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!feedback?.id) return;
      const { error } = await supabase
        .from('job_feedback' as any)
        .update({
          score,
          reasons,
          attention_areas: attentionAreas,
          comments: [reasonComment, attentionComment].filter(Boolean).join(' | '),
          same_cleaner_preference: sameCleaner,
          nps_score: nps,
          submitted_at: new Date().toISOString(),
        } as any)
        .eq('id', feedback.id);
      if (error) throw error;

      // Update job feedback_score
      if (feedback.job_id && score) {
        await supabase.from('jobs').update({ feedback_score: score }).eq('id', feedback.job_id);
      }

      // Notify admin on all feedback
      if (score) {
        await (await import('@/lib/alerts')).createAlert({
          event_type: 'review_received',
          title: 'Feedback Received',
          body: `Feedback received for ${job?.properties?.property_name || 'property'} — ${score}/10${score < 8 ? ' ⚠ Review needed' : ''}`,
          link: `/clients/${feedback.client_id}`,
        });
      }
    },
    onSuccess: () => setSubmitted(true),
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-[#0B0F17]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  if (!feedback) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0B0F17] px-4">
        <p className="text-4xl mb-3">🔗</p>
        <p className="font-bold text-lg">Invalid feedback link</p>
        <p className="text-sm text-white/60">This link may have expired or already been used.</p>
      </div>
    );
  }

  if (feedback.submitted_at && feedback.score !== null && !submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0B0F17] px-4">
        <CheckCircle2 className="w-16 h-16 text-primary mb-4" />
        <p className="font-bold text-lg">Feedback already submitted</p>
        <p className="text-sm text-white/60">Thank you for your response!</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0B0F17] px-4 text-center">
        <CheckCircle2 className="w-16 h-16 text-primary mb-4" />
        <h2 className="text-2xl font-extrabold text-primary mb-2">
          {score && score >= 8 ? 'Thank you! We\'re glad you\'re happy 😊' : 'Thank you for your feedback'}
        </h2>
        <p className="text-white/60 max-w-sm">
          {score && score >= 8 ? 'We\'ll keep delivering the same standard.' : 'Our manager will review this and follow up with you shortly.'}
        </p>
      </div>
    );
  }

  const propName = job?.properties?.property_name || 'your property';

  return (
    <div className="min-h-screen bg-[#0B0F17]">
      <header className="bg-[#131920] border-b border-border/50 sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-4 py-3">
          <h1 className="text-2xl font-extrabold text-primary" style={{ fontFamily: 'Nunito, sans-serif' }}>Brightly<span className="text-accent">.</span></h1>
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 py-6 space-y-6 pb-20">
        {/* Progress */}
        <div className="flex gap-1">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? 'bg-primary' : 'bg-muted'}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-6 text-center">
            <h2 className="text-xl font-extrabold text-white">How would you rate your clean today?</h2>
            <p className="text-sm text-white/60">{propName}</p>
            <div className="flex justify-center gap-1 flex-wrap">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                <button
                  key={n}
                  onClick={() => setScore(n)}
                  className={`w-12 h-12 rounded-xl text-lg font-bold border-2 transition-all ${score === n ? 'border-primary bg-primary text-primary-foreground scale-110' : 'border-border hover:border-primary/50'}`}
                >
                  {n}
                </button>
              ))}
            </div>
            <Button onClick={() => setStep(score && score < 8 ? 2 : 3)} disabled={!score} className="w-full">
              Next
            </Button>
          </div>
        )}

        {step === 2 && score !== null && score < 8 && (
          <div className="space-y-4">
            <h2 className="text-xl font-extrabold">We're sorry to hear that.</h2>
            <p className="text-sm text-white/60">What didn't meet your expectations?</p>
            <div className="space-y-2">
              {REASONS.map(r => (
                <button key={r} onClick={() => toggleReason(r)} className={`w-full text-left p-3 rounded-xl border text-sm ${reasons.includes(r) ? 'border-primary bg-primary/5 font-semibold' : 'border-border'}`}>
                  {reasons.includes(r) ? '☑' : '☐'} {r}
                </button>
              ))}
            </div>
            <Textarea value={reasonComment} onChange={e => setReasonComment(e.target.value)} placeholder="Tell us more (optional)" className="rounded-xl" />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">Back</Button>
              <Button onClick={() => setStep(3)} className="flex-1">Next</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-xl font-extrabold">Any areas that need extra attention next time?</h2>
            <div className="flex flex-wrap gap-2">
              {ATTENTION_AREAS.map(a => (
                <button key={a} onClick={() => toggleArea(a)} className={`px-3 py-1.5 rounded-full text-sm border ${attentionAreas.includes(a) ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}`}>
                  {a}
                </button>
              ))}
            </div>
            <Textarea value={attentionComment} onChange={e => setAttentionComment(e.target.value)} placeholder="Anything else? (optional)" className="rounded-xl" />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(score && score < 8 ? 2 : 1)} className="flex-1">Back</Button>
              <Button onClick={() => setStep(4)} className="flex-1">Next</Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div className="space-y-4">
              <h2 className="text-xl font-extrabold">Almost done!</h2>
              <div>
                <p className="text-sm font-semibold mb-2">Would you like the same cleaner next time?</p>
                <div className="grid grid-cols-3 gap-2">
                  {['yes', 'no', 'no_preference'].map(opt => (
                    <button key={opt} onClick={() => setSameCleaner(opt)} className={`p-3 rounded-xl border text-sm font-semibold capitalize ${sameCleaner === opt ? 'border-primary bg-primary/5' : 'border-border'}`}>
                      {opt === 'no_preference' ? 'No pref' : opt === 'yes' ? 'Yes' : 'No'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold mb-2">How likely are you to recommend Brightly? (optional)</p>
                <div className="flex gap-1 flex-wrap justify-center">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                    <button key={n} onClick={() => setNps(n)} className={`w-9 h-9 rounded-lg text-sm font-bold border ${nps === n ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>
                      {n}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-xs text-white/60 mt-1 px-1">
                  <span>Not likely</span><span>Very likely</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(3)} className="flex-1">Back</Button>
              <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending} className="flex-1 bg-primary text-primary-foreground font-bold gap-2">
                {submitMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Submit Feedback
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
