import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Loader2, CheckCircle2, Upload, AlertCircle, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { createAdminNotification } from '@/lib/notifications';
import { cn } from '@/lib/utils';

const STEPS = [
  'Personal Details',
  'Documents & Compliance',
  'SOP Acknowledgements',
  'Chemical Safety Quiz',
  'Final Sign-Off',
];

const SOPS = [
  {
    key: 'sop_master_acknowledged_at' as const,
    title: 'Master Housekeeping SOP',
    code: 'B-ABNB-SOP-004',
    summary:
      'Hotel-quality presentation on every clean. Sequence: arrival → strip → kitchen → bathrooms → bedrooms → living → final check. Photos for every room before marking complete.',
    label:
      'I have read and understood the Master Housekeeping SOP (B-ABNB-SOP-004)',
  },
  {
    key: 'sop_linen_acknowledged_at' as const,
    title: 'Linen & Laundry SOP',
    code: 'B-ABNB-SOP-005',
    summary:
      'Brightly uses a rented linen model. Strip used linen into hire bags, tag stained items, never discard hire linen. If linen has not arrived: call the office — do not begin clean.',
    label:
      'I have read and understood the Linen & Laundry SOP (B-ABNB-SOP-005)',
  },
  {
    key: 'sop_consumables_acknowledged_at' as const,
    title: 'Consumables & Amenity Restocking SOP',
    code: 'B-ABNB-SOP-006',
    summary:
      'All consumables restocked to standard on every job: toilet paper, soap, shampoo, conditioner, dishwasher tablets, tea/coffee — per property amenity list.',
    label:
      'I have read and understood the Consumables & Amenity Restocking SOP (B-ABNB-SOP-006)',
  },
  {
    key: 'sop_chemical_acknowledged_at' as const,
    title: 'Chemical Safety',
    code: 'WHS',
    summary:
      'Never mix chemicals — never use bleach with ammonia. Mandatory PPE: rubber gloves; safety glasses when spraying overhead. SDS available from Brendan on request.',
    label: 'I have read and understood the Chemical Safety requirements',
  },
  {
    key: 'sop_conduct_acknowledged_at' as const,
    title: 'Code of Conduct & Performance Expectations',
    code: 'B-ABNB-HR-002',
    summary:
      'Arrive on time. Complete every checklist item. Submit photos for every job before marking complete. Professional conduct at all properties. No smoking, eating, or personal calls during cleans.',
    label:
      'I have read and understood the Code of Conduct and Performance Expectations',
  },
];

const QUIZ = [
  {
    q: 'What PPE is mandatory when cleaning bathrooms and kitchens?',
    options: [
      'Rubber gloves',
      'Safety glasses',
      'Apron',
      'Nothing required',
    ],
    correct: 0,
  },
  {
    q: 'What should you NEVER do with cleaning chemicals?',
    options: [
      'Mix bleach with ammonia-based products',
      'Use them in bathrooms',
      'Store them in labelled containers',
      'Rinse surfaces after applying',
    ],
    correct: 0,
  },
  {
    q: 'If chemical contacts your eyes, what do you do first?',
    options: [
      'Rinse immediately with running water for 15+ minutes',
      'Apply eye drops',
      'Call the office',
      'Continue working',
    ],
    correct: 0,
  },
];

type FormState = {
  full_name: string;
  mobile: string;
  email: string;
  date_of_birth: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  suburb: string;
  abn: string;
  abn_confirmed: boolean;
  bank_bsb: string;
  bank_account: string;
  bank_name: string;
  id_document_type: 'licence' | 'passport' | '';
  police_check_date: string;
  acks: Record<string, boolean>;
  digital_signature: string;
};

const initial: FormState = {
  full_name: '',
  mobile: '',
  email: '',
  date_of_birth: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  suburb: '',
  abn: '',
  abn_confirmed: false,
  bank_bsb: '',
  bank_account: '',
  bank_name: '',
  id_document_type: '',
  police_check_date: '',
  acks: {
    sop_master_acknowledged_at: false,
    sop_linen_acknowledged_at: false,
    sop_consumables_acknowledged_at: false,
    sop_chemical_acknowledged_at: false,
    sop_conduct_acknowledged_at: false,
  },
  digital_signature: '',
};

const COMMITMENT = `I, the undersigned, acknowledge and agree that:

• I have read, understood, and will comply with all Brightly Standard Operating Procedures referenced above.
• I will arrive on time for every accepted job and complete every checklist item before marking a job complete.
• I will submit before/after photos via the Brightly app for every job — no photos means no payment processed.
• I will never mix chemicals, will wear the required PPE at all times, and will report any WHS incident to Brendan Parker on 0418 878 707 immediately.
• I will never share property access codes, lockbox details, or guest information with any third party.
• I understand I am engaged as an independent contractor — work is offered as available, there are no guaranteed hours, and I am responsible for my own tax and GST obligations.
• I confirm all information I have provided in this onboarding is true and accurate.
• I understand I cannot be assigned solo jobs until the Director has confirmed deployment clearance.`;

export default function CleanerOnboardingPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(initial);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // File upload state
  const [idFileUrl, setIdFileUrl] = useState('');
  const [policeFileUrl, setPoliceFileUrl] = useState('');
  const [uploadingId, setUploadingId] = useState(false);
  const [uploadingPolice, setUploadingPolice] = useState(false);

  // Quiz state
  const [quizAnswers, setQuizAnswers] = useState<number[]>([-1, -1, -1]);
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  // Bootstrap: load existing onboarding row if present
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('cleaner_onboarding')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        if (data.onboarding_complete) {
          setSubmitted(true);
        }
        setForm((prev) => ({
          ...prev,
          full_name: data.full_name ?? profile?.full_name ?? '',
          mobile: data.mobile ?? '',
          email: data.email ?? profile?.email ?? '',
          date_of_birth: data.date_of_birth ?? '',
          emergency_contact_name: data.emergency_contact_name ?? '',
          emergency_contact_phone: data.emergency_contact_phone ?? '',
          suburb: data.suburb ?? '',
          abn: data.abn ?? '',
          abn_confirmed: data.abn_confirmed ?? false,
          bank_bsb: data.bank_bsb ?? '',
          bank_account: data.bank_account ?? '',
          bank_name: data.bank_name ?? '',
          id_document_type: (data.id_document_type as any) ?? '',
          police_check_date: data.police_check_date ?? '',
          digital_signature: data.digital_signature ?? '',
          acks: {
            sop_master_acknowledged_at: !!data.sop_master_acknowledged_at,
            sop_linen_acknowledged_at: !!data.sop_linen_acknowledged_at,
            sop_consumables_acknowledged_at: !!data.sop_consumables_acknowledged_at,
            sop_chemical_acknowledged_at: !!data.sop_chemical_acknowledged_at,
            sop_conduct_acknowledged_at: !!data.sop_conduct_acknowledged_at,
          },
        }));
        if (data.id_document_url) setIdFileUrl(data.id_document_url);
        if (data.police_check_url) setPoliceFileUrl(data.police_check_url);
        if (data.chemical_quiz_passed) setQuizSubmitted(true);
      } else {
        // Pre-fill from profile
        setForm((prev) => ({
          ...prev,
          full_name: profile?.full_name ?? '',
          email: profile?.email ?? '',
        }));
      }
      setLoading(false);
    })();
  }, [user, profile]);

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const upsertProgress = async (extra: Record<string, any> = {}) => {
    if (!user) return;
    const payload: any = {
      user_id: user.id,
      full_name: form.full_name || null,
      mobile: form.mobile || null,
      email: form.email || null,
      date_of_birth: form.date_of_birth || null,
      emergency_contact_name: form.emergency_contact_name || null,
      emergency_contact_phone: form.emergency_contact_phone || null,
      suburb: form.suburb || null,
      abn: form.abn || null,
      abn_confirmed: form.abn_confirmed,
      bank_bsb: form.bank_bsb || null,
      bank_account: form.bank_account || null,
      bank_name: form.bank_name || null,
      id_document_type: form.id_document_type || null,
      id_document_url: idFileUrl || null,
      police_check_url: policeFileUrl || null,
      police_check_date: form.police_check_date || null,
      ...extra,
    };
    await supabase
      .from('cleaner_onboarding')
      .upsert(payload, { onConflict: 'user_id' });
  };

  const handleUpload = async (
    file: File,
    folder: 'id-documents' | 'police-checks',
    setUrl: (u: string) => void,
    setLoadingFn: (b: boolean) => void
  ) => {
    if (!user) return;
    setLoadingFn(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${folder}/${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('staff-documents')
        .upload(path, file);
      if (error) throw error;
      const { data } = supabase.storage.from('staff-documents').getPublicUrl(path);
      setUrl(data.publicUrl);
      toast.success('Uploaded');
    } catch (e: any) {
      toast.error('Upload failed: ' + e.message);
    } finally {
      setLoadingFn(false);
    }
  };

  const validateStep = (idx: number): string | null => {
    if (idx === 0) {
      if (!form.full_name) return 'Full name is required';
      if (!form.mobile) return 'Mobile number is required';
      if (!form.email) return 'Email is required';
      if (!form.date_of_birth) return 'Date of birth is required';
      if (!form.emergency_contact_name) return 'Emergency contact name is required';
      if (!form.emergency_contact_phone) return 'Emergency contact phone is required';
      if (!form.suburb) return 'Suburb is required';
    }
    if (idx === 1) {
      if (!form.abn) return 'ABN is required';
      if (!form.abn_confirmed) return 'Please confirm you hold a valid ABN';
      if (!form.bank_bsb) return 'BSB is required';
      if (!form.bank_account) return 'Account number is required';
      if (!form.bank_name) return 'Account name is required';
      if (!form.id_document_type) return 'Please select an ID type';
      if (!idFileUrl) return 'Please upload your ID';
      if (!policeFileUrl) return 'Please upload your police check';
      if (!form.police_check_date) return 'Police check date is required';
    }
    if (idx === 2) {
      if (!Object.values(form.acks).every(Boolean)) {
        return 'Please acknowledge all SOPs';
      }
    }
    if (idx === 3) {
      if (!quizSubmitted) return 'You must pass the chemical safety quiz to continue';
    }
    if (idx === 4) {
      if (!form.digital_signature.trim())
        return 'Please type your name as your digital signature';
    }
    return null;
  };

  const handleNext = async () => {
    const err = validateStep(step);
    if (err) {
      toast.error(err);
      return;
    }

    // Persist progress and acknowledgement timestamps
    const extras: Record<string, any> = {};
    if (step === 2) {
      const now = new Date().toISOString();
      extras.sop_master_acknowledged_at = form.acks.sop_master_acknowledged_at ? now : null;
      extras.sop_linen_acknowledged_at = form.acks.sop_linen_acknowledged_at ? now : null;
      extras.sop_consumables_acknowledged_at = form.acks.sop_consumables_acknowledged_at ? now : null;
      extras.sop_chemical_acknowledged_at = form.acks.sop_chemical_acknowledged_at ? now : null;
      extras.sop_conduct_acknowledged_at = form.acks.sop_conduct_acknowledged_at ? now : null;
      extras.sop_acknowledged_at = now;
      // Set SOP re-sign due date to 365 days from now
      const resignDue = new Date();
      resignDue.setDate(resignDue.getDate() + 365);
      extras.sops_resign_due = resignDue.toISOString().split('T')[0];
    }

    await upsertProgress(extras);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submitQuiz = async () => {
    let score = 0;
    QUIZ.forEach((q, i) => {
      if (quizAnswers[i] === q.correct) score += 1;
    });

    if (!user) return;

    // Always log attempt
    const { data: existing } = await supabase
      .from('cleaner_onboarding')
      .select('chemical_quiz_attempts')
      .eq('user_id', user.id)
      .maybeSingle();

    const attempts = (existing?.chemical_quiz_attempts ?? 0) + 1;

    if (score === QUIZ.length) {
      await supabase
        .from('cleaner_onboarding')
        .upsert(
          {
            user_id: user.id,
            chemical_quiz_passed: true,
            chemical_quiz_score: score,
            chemical_quiz_attempts: attempts,
          },
          { onConflict: 'user_id' }
        );
      setQuizSubmitted(true);
      toast.success('Perfect score! You can continue.');
    } else {
      await supabase
        .from('cleaner_onboarding')
        .upsert(
          {
            user_id: user.id,
            chemical_quiz_passed: false,
            chemical_quiz_score: score,
            chemical_quiz_attempts: attempts,
          },
          { onConflict: 'user_id' }
        );
      toast.error(`You got ${score}/${QUIZ.length}. Review the highlighted answers and try again.`);
    }
  };

  const resetQuiz = () => {
    setQuizAnswers([-1, -1, -1]);
  };

  const handleSubmit = async () => {
    const err = validateStep(4);
    if (err) {
      toast.error(err);
      return;
    }
    if (!user) return;

    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      await supabase
        .from('cleaner_onboarding')
        .upsert(
          {
            user_id: user.id,
            full_name: form.full_name,
            mobile: form.mobile,
            email: form.email,
            date_of_birth: form.date_of_birth || null,
            emergency_contact_name: form.emergency_contact_name,
            emergency_contact_phone: form.emergency_contact_phone,
            suburb: form.suburb,
            abn: form.abn,
            abn_confirmed: form.abn_confirmed,
            bank_bsb: form.bank_bsb,
            bank_account: form.bank_account,
            bank_name: form.bank_name,
            id_document_type: form.id_document_type || null,
            id_document_url: idFileUrl,
            police_check_url: policeFileUrl,
            police_check_date: form.police_check_date || null,
            digital_signature: form.digital_signature,
            signed_at: now,
            onboarding_complete: true,
          },
          { onConflict: 'user_id' }
        );

      // Mirror to profile so the rest of the app sees the data
      await supabase
        .from('profiles')
        .update({
          full_name: form.full_name,
          phone: form.mobile,
          email: form.email,
        })
        .eq('id', user.id);

      // Notify admin
      await createAdminNotification({
        type: 'cleaner_onboarding_complete',
        title: 'New cleaner onboarding submitted',
        message: `${form.full_name} has completed onboarding — awaiting Director sign-off.`,
        link: '/staff',
      });

      // Best-effort SMS to Brendan
      supabase.functions
        .invoke('send-job-sms', {
          body: {
            to: '0418878707',
            message: `🧽 New cleaner ${form.full_name} has completed onboarding — awaiting your Director sign-off.`,
          },
        })
        .catch(() => undefined);

      setSubmitted(true);
    } catch (e: any) {
      toast.error('Submission failed: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const progress = useMemo(() => ((step + 1) / STEPS.length) * 100, [step]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: '#0A0F0E' }}>
        <h1 className="text-3xl font-extrabold mb-2" style={{ fontFamily: 'Nunito, sans-serif', color: '#F0FDF4' }}>
          Brightly<span style={{ color: '#FEDB00' }}>.</span>
        </h1>
        <div className="rounded-2xl shadow-md p-8 max-w-md text-center space-y-4 mt-6" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <ShieldCheck className="h-10 w-10 mx-auto" style={{ color: '#3A7560' }} />
          <h2 className="text-xl font-bold" style={{ color: '#F0FDF4' }}>Cleaner Onboarding</h2>
          <p style={{ color: 'rgba(240,253,244,0.5)' }}>
            Please use the onboarding link sent to you via SMS to access this form. Need help? Call <span className="font-bold">0418 878 707</span>.
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-card border-2 border-primary/20 rounded-2xl p-8 text-center space-y-6">
          <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-2xl font-extrabold text-foreground">Onboarding submitted!</h1>
          <p className="text-muted-foreground">
            Thanks {form.full_name?.split(' ')[0] || 'team'}. Brendan will review and confirm your
            deployment clearance. You'll get a notification once you're cleared for jobs.
          </p>
          <Button onClick={() => navigate('/dashboard')} className="rounded-xl h-12 px-8 font-bold">
            Back to dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            Cleaner Onboarding
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Complete every step. You'll be cleared for deployment once Brendan signs off.
        </p>
        <Progress value={progress} className="h-2" />
        <p className="text-xs font-bold text-muted-foreground">
          Step {step + 1} of {STEPS.length} — {STEPS[step]}
        </p>
      </div>

      {/* Step content */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
        {step === 0 && (
          <>
            <h2 className="text-lg font-bold text-foreground">Personal details</h2>
            <div className="grid gap-4">
              <Field label="Full legal name" required>
                <Input
                  className="rounded-xl h-12"
                  value={form.full_name}
                  onChange={(e) => update('full_name', e.target.value)}
                />
              </Field>
              <Field label="Mobile number" required>
                <Input
                  className="rounded-xl h-12"
                  value={form.mobile}
                  inputMode="tel"
                  onChange={(e) => update('mobile', e.target.value)}
                  placeholder="04xx xxx xxx"
                />
              </Field>
              <Field label="Email" required>
                <Input
                  className="rounded-xl h-12"
                  type="email"
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                />
              </Field>
              <Field label="Date of birth" required>
                <Input
                  className="rounded-xl h-12"
                  type="date"
                  value={form.date_of_birth}
                  onChange={(e) => update('date_of_birth', e.target.value)}
                />
              </Field>
              <Field label="Suburb you're based in" required>
                <Input
                  className="rounded-xl h-12"
                  value={form.suburb}
                  onChange={(e) => update('suburb', e.target.value)}
                />
              </Field>
              <Field label="Emergency contact name" required>
                <Input
                  className="rounded-xl h-12"
                  value={form.emergency_contact_name}
                  onChange={(e) => update('emergency_contact_name', e.target.value)}
                />
              </Field>
              <Field label="Emergency contact phone" required>
                <Input
                  className="rounded-xl h-12"
                  value={form.emergency_contact_phone}
                  inputMode="tel"
                  onChange={(e) => update('emergency_contact_phone', e.target.value)}
                />
              </Field>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="text-lg font-bold text-foreground">Documents & compliance</h2>
            <div className="grid gap-4">
              <Field label="ABN" required>
                <Input
                  className="rounded-xl h-12"
                  value={form.abn}
                  onChange={(e) => update('abn', e.target.value)}
                  placeholder="11 digit ABN"
                />
              </Field>
              <label className="flex items-start gap-3 p-3 rounded-xl border border-border bg-muted/30 cursor-pointer">
                <Checkbox
                  checked={form.abn_confirmed}
                  onCheckedChange={(v) => update('abn_confirmed', !!v)}
                />
                <span className="text-sm text-foreground">
                  I confirm I hold a valid ABN registered in my own name.
                </span>
              </label>

              <h3 className="text-sm font-bold pt-2">Bank details (for payment)</h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="BSB" required>
                  <Input
                    className="rounded-xl h-12"
                    value={form.bank_bsb}
                    inputMode="numeric"
                    onChange={(e) => update('bank_bsb', e.target.value)}
                    placeholder="000-000"
                  />
                </Field>
                <Field label="Account number" required>
                  <Input
                    className="rounded-xl h-12"
                    value={form.bank_account}
                    inputMode="numeric"
                    onChange={(e) => update('bank_account', e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Account name" required>
                <Input
                  className="rounded-xl h-12"
                  value={form.bank_name}
                  onChange={(e) => update('bank_name', e.target.value)}
                />
              </Field>

              <h3 className="text-sm font-bold pt-2">Photo ID</h3>
              <div className="flex gap-2">
                {(['licence', 'passport'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => update('id_document_type', type)}
                    className={cn(
                      'flex-1 rounded-xl border-2 p-3 text-sm font-bold capitalize transition-all',
                      form.id_document_type === type
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card text-foreground'
                    )}
                  >
                    {type === 'licence' ? "Driver's licence" : 'Passport'}
                  </button>
                ))}
              </div>
              <FileField
                label="Upload ID photo"
                fileUrl={idFileUrl}
                uploading={uploadingId}
                onChange={(file) => handleUpload(file, 'id-documents', setIdFileUrl, setUploadingId)}
              />

              <h3 className="text-sm font-bold pt-2">Police check</h3>
              <FileField
                label="Upload police check"
                fileUrl={policeFileUrl}
                uploading={uploadingPolice}
                onChange={(file) =>
                  handleUpload(file, 'police-checks', setPoliceFileUrl, setUploadingPolice)
                }
              />
              <Field label="Police check date" required>
                <Input
                  className="rounded-xl h-12"
                  type="date"
                  value={form.police_check_date}
                  onChange={(e) => update('police_check_date', e.target.value)}
                />
              </Field>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-lg font-bold text-foreground">SOP acknowledgements</h2>
            <p className="text-sm text-muted-foreground">
              Read each summary and tick to confirm you've read and understood the full SOP.
            </p>
            <div className="space-y-4">
              {SOPS.map((sop) => (
                <div
                  key={sop.key}
                  className="rounded-xl border-2 border-border p-4 space-y-3 bg-muted/20"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-extrabold text-foreground">{sop.title}</p>
                      <p className="text-[10px] font-bold text-muted-foreground tracking-wider">
                        {sop.code}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-foreground/80">{sop.summary}</p>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox
                      checked={form.acks[sop.key]}
                      onCheckedChange={(v) =>
                        update('acks', { ...form.acks, [sop.key]: !!v })
                      }
                    />
                    <span className="text-sm font-semibold text-foreground">{sop.label}</span>
                  </label>
                </div>
              ))}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="text-lg font-bold text-foreground">Chemical safety quiz</h2>
            <p className="text-sm text-muted-foreground">
              You must score 3/3 to continue. If you fail, review the answers and try again.
            </p>
            <div className="space-y-5">
              {QUIZ.map((q, qi) => (
                <div key={qi} className="space-y-2">
                  <p className="text-sm font-bold text-foreground">
                    Q{qi + 1}. {q.q}
                  </p>
                  <div className="grid gap-2">
                    {q.options.map((opt, oi) => {
                      const selected = quizAnswers[qi] === oi;
                      const showCorrect = quizSubmitted && oi === q.correct;
                      const showWrong =
                        !quizSubmitted &&
                        quizAnswers[qi] !== -1 &&
                        selected &&
                        oi !== q.correct &&
                        // Only highlight wrong AFTER they've submitted
                        false;
                      return (
                        <button
                          key={oi}
                          type="button"
                          disabled={quizSubmitted}
                          onClick={() => {
                            const next = [...quizAnswers];
                            next[qi] = oi;
                            setQuizAnswers(next);
                          }}
                          className={cn(
                            'w-full text-left rounded-xl border-2 px-4 py-3 text-sm font-medium transition-all',
                            selected
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border bg-card text-foreground',
                            showCorrect && 'border-emerald-500 bg-emerald-50 text-[#3A7560]',
                            showWrong && 'border-destructive bg-destructive/10'
                          )}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {!quizSubmitted ? (
                <Button
                  className="w-full rounded-xl h-12 font-bold"
                  disabled={quizAnswers.some((a) => a === -1)}
                  onClick={submitQuiz}
                >
                  Submit answers
                </Button>
              ) : (
                <div className="rounded-xl bg-emerald-50 border-2 border-emerald-500 p-4 text-center">
                  <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto mb-2" />
                  <p className="font-bold text-[#3A7560]">Perfect score — you can continue.</p>
                </div>
              )}

              {!quizSubmitted && quizAnswers.every((a) => a !== -1) &&
                quizAnswers.some((a, i) => a !== QUIZ[i].correct) && (
                  <button
                    type="button"
                    className="text-sm font-bold text-primary underline"
                    onClick={resetQuiz}
                  >
                    Reset and try again
                  </button>
                )}
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="text-lg font-bold text-foreground">Final sign-off</h2>
            <div className="rounded-xl bg-muted/30 border border-border p-4 max-h-72 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {COMMITMENT}
            </div>
            <Field label="Type your full name as your digital signature" required>
              <Input
                className="rounded-xl h-12 font-bold text-lg"
                value={form.digital_signature}
                onChange={(e) => update('digital_signature', e.target.value)}
                placeholder="Your full name"
              />
            </Field>
            {form.digital_signature && (
              <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                  Signed
                </p>
                <p
                  className="text-2xl text-primary"
                  style={{ fontFamily: 'cursive' }}
                >
                  {form.digital_signature}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {new Date().toLocaleString('en-AU', { timeZone: 'Australia/Brisbane' })} AEST
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer nav */}
      <div className="flex gap-2">
        {step > 0 && (
          <Button
            variant="outline"
            className="flex-1 rounded-xl h-12 font-bold"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Back
          </Button>
        )}
        {step < STEPS.length - 1 && (
          <Button className="flex-1 rounded-xl h-12 font-bold" onClick={handleNext}>
            Next
          </Button>
        )}
        {step === STEPS.length - 1 && (
          <Button
            className="flex-1 rounded-xl h-12 font-bold"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Submit & Complete Onboarding
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-bold">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

function FileField({
  label,
  fileUrl,
  uploading,
  onChange,
}: {
  label: string;
  fileUrl: string;
  uploading: boolean;
  onChange: (file: File) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="block">
        <input
          type="file"
          className="hidden"
          accept="image/*,application/pdf"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onChange(f);
          }}
        />
        <div
          className={cn(
            'rounded-xl border-2 border-dashed p-4 text-center cursor-pointer transition-colors',
            fileUrl ? 'border-emerald-500 bg-emerald-50' : 'border-border hover:border-primary/40'
          )}
        >
          {uploading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm font-bold">Uploading...</span>
            </div>
          ) : fileUrl ? (
            <div className="flex items-center justify-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm font-bold">Uploaded — tap to replace</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Upload className="h-5 w-5" />
              <span className="text-sm font-bold">{label}</span>
            </div>
          )}
        </div>
      </label>
    </div>
  );
}
