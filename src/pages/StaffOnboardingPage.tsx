/* eslint-disable @typescript-eslint/no-explicit-any -- Edge-function responses include the newly migrated JSON contract until Supabase types are regenerated. */
import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileCheck2,
  ExternalLink,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import brightlyLogo from '@/assets/brightly-logo.png';
import {
  DAYS_OF_WEEK,
  DOCUMENT_TYPES,
  EMPTY_STAFF_ONBOARDING_DRAFT,
  formatAustralianDateInput,
  getKnowledgeScore,
  INDEPENDENT_CONTRACTOR_TERMS,
  isAcknowledgementAccepted,
  isValidAbn,
  isValidAustralianDate,
  normaliseDigits,
  ONBOARDING_ACKNOWLEDGEMENTS,
  ONBOARDING_KNOWLEDGE_QUESTIONS,
  STAFF_ONBOARDING_STEPS,
  type StaffOnboardingDraft,
} from '@/lib/staffOnboarding';
import { getSopsForAcknowledgement } from '@/lib/sopLibrary';

type DocumentManifest = Record<string, {
  path?: string;
  legacy_url?: string;
  original_name?: string;
  uploaded_at?: string;
}>;

type ApiRecord = Partial<StaffOnboardingDraft> & {
  email?: string;
  current_step?: number;
  submitted_at?: string | null;
  last_saved_at?: string | null;
  document_manifest?: DocumentManifest;
  sop_acknowledgements?: Record<string, boolean | { acknowledged?: boolean }>;
  knowledge_check?: {
    answers?: Record<string, number>;
    questions?: Record<string, { selected_index?: number }>;
  };
  cleaner_declaration?: { accurate?: boolean; compliance?: boolean };
};

const selectClass = 'flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-base ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2';

function Field({ label, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label className="text-sm font-semibold text-foreground">
        {label}{required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs leading-5 text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ChoiceCard({ checked, onChange, title, description }: { checked: boolean; onChange: (checked: boolean) => void; title: string; description?: string }) {
  return (
    <label className={cn(
      'flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors',
      checked ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/40',
    )}>
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} className="mt-0.5 h-5 w-5 shrink-0" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-5 text-foreground">{title}</span>
        {description && <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>}
      </span>
    </label>
  );
}

function AustralianDateField({ label, value, onChange, required, autoComplete }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <Field label={label} required={required} hint="DD/MM/YYYY">
      <Input
        className="h-11 rounded-xl"
        type="text"
        inputMode="numeric"
        autoComplete={autoComplete}
        placeholder="DD/MM/YYYY"
        maxLength={10}
        value={value}
        onChange={(event) => onChange(formatAustralianDateInput(event.target.value))}
      />
    </Field>
  );
}

export default function StaffOnboardingPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<StaffOnboardingDraft>({ ...EMPTY_STAFF_ONBOARDING_DRAFT });
  const [documents, setDocuments] = useState<DocumentManifest>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [contractorTermsOpen, setContractorTermsOpen] = useState(false);
  const [openAcknowledgement, setOpenAcknowledgement] = useState<string | null>(null);
  const [openedSopCodes, setOpenedSopCodes] = useState<string[]>([]);

  const invoke = async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error: invokeError } = await supabase.functions.invoke('staff-onboarding', {
      body: { action, token, ...extra },
    });
    if (invokeError) {
      let message = (data as any)?.error || invokeError.message;
      const context = (invokeError as { context?: Response }).context;
      if (context) {
        try {
          const responseBody = await context.clone().json() as { error?: string };
          if (responseBody.error) message = responseBody.error;
        } catch {
          // Keep the transport message when the function did not return JSON.
        }
      }
      throw new Error(message);
    }
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as any;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setError('This onboarding link is invalid. Ask Brightly for a new link.');
        setLoading(false);
        return;
      }
      try {
        const { record } = await invoke('load');
        if (cancelled) return;
        const saved = record as ApiRecord;
        const acks = saved.sop_acknowledgements ?? {};
        const acknowledgementValues = Object.fromEntries(ONBOARDING_ACKNOWLEDGEMENTS.map((acknowledgement) => [
          acknowledgement.key,
          isAcknowledgementAccepted(acks, acknowledgement),
        ]));
        const savedQuestions = saved.knowledge_check?.questions;
        const questionValues = saved.knowledge_check?.answers ?? Object.fromEntries(
          Object.entries(savedQuestions ?? {}).map(([key, value]) => [key, value.selected_index]),
        );
        setDraft({
          ...EMPTY_STAFF_ONBOARDING_DRAFT,
          ...Object.fromEntries(Object.entries(saved).filter(([, value]) => value !== null)),
          email: saved.email ?? '',
          date_of_birth: formatAustralianDateInput(saved.date_of_birth ?? ''),
          public_liability_expiry: formatAustralianDateInput(saved.public_liability_expiry ?? ''),
          drivers_licence_expiry: formatAustralianDateInput(saved.drivers_licence_expiry ?? ''),
          available_days: Array.isArray(saved.available_days) ? saved.available_days : [],
          sop_acknowledgements: acknowledgementValues,
          knowledge_answers: questionValues as Record<string, number>,
          declaration_accurate: Boolean(saved.cleaner_declaration?.accurate),
          declaration_compliance: Boolean(saved.cleaner_declaration?.compliance),
        });
        setDocuments(saved.document_manifest ?? {});
        setStep(Math.max(0, Math.min(7, Number(saved.current_step ?? 0))));
        setLastSaved(saved.last_saved_at ?? null);
        setSubmitted(Boolean(saved.submitted_at));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'We could not open this onboarding link.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // The invitation token is the identity for this intentionally public route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const set = <K extends keyof StaffOnboardingDraft>(key: K, value: StaffOnboardingDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const payload = (currentStep = step) => ({ ...draft, current_step: currentStep });

  const save = async (currentStep: number) => {
    setSaving(true);
    try {
      const result = await invoke('save', { payload: payload(currentStep) });
      setLastSaved(result.saved_at ?? new Date().toISOString());
    } finally {
      setSaving(false);
    }
  };

  const validate = (currentStep: number) => {
    const required = (value: unknown) => Boolean(String(value ?? '').trim());
    if (currentStep === 0) {
      if (![draft.full_name, draft.phone, draft.email, draft.date_of_birth, draft.address, draft.residential_suburb, draft.postcode, draft.emergency_contact_name, draft.emergency_contact_phone, draft.emergency_contact_relationship].every(required)) return 'Complete every required personal and emergency-contact field.';
      if (!isValidAustralianDate(draft.date_of_birth)) return 'Enter your date of birth as DD/MM/YYYY.';
    }
    if (currentStep === 1) {
      if (!draft.is_contractor) return 'You must acknowledge the independent-contractor arrangement.';
      if (draft.abn_status !== 'yes') return 'An active ABN is required before onboarding can be completed.';
      if (!isValidAbn(draft.abn)) return 'Enter a valid active ABN.';
      if (!draft.bank_account_name || normaliseDigits(draft.bank_bsb).length !== 6 || normaliseDigits(draft.bank_account_number).length < 6) return 'Complete the account name, 6-digit BSB and account number.';
    }
    if (currentStep === 2) {
      if (!draft.id_document_type || !draft.id_confirmed) return 'Complete the photo ID details.';
      if (!draft.public_liability_status) return 'Answer the public-liability question.';
      if (draft.id_document_type === 'drivers_licence' && !isValidAustralianDate(draft.drivers_licence_expiry)) return 'Enter the licence expiry as DD/MM/YYYY.';
      for (const key of ['profile_photo', 'photo_id']) if (!documents[key]) return `Upload your ${key.split('_').join(' ')}.`;
      if (draft.public_liability_status === 'yes' && (!documents.public_liability || !isValidAustralianDate(draft.public_liability_expiry))) return 'Upload your public-liability certificate and enter its expiry as DD/MM/YYYY.';
    }
    if (currentStep === 3) {
      if (!draft.available_days.length) return 'Select at least one day you can usually work.';
      if (!draft.transport_confirmed) return 'Reliable transport is required for this role.';
    }
    if (currentStep === 4 && (!draft.brightly_notifications_enabled || !draft.communication_acknowledged)) return 'Enable Brightly notifications and accept the communication requirements.';
    if (currentStep === 5 && ONBOARDING_ACKNOWLEDGEMENTS.some(({ key }) => !draft.sop_acknowledgements[key])) return 'Open, read and accept all three Brightly standards sections.';
    if (currentStep === 6) {
      if (Object.keys(draft.knowledge_answers).length !== ONBOARDING_KNOWLEDGE_QUESTIONS.length) return 'Answer every knowledge-check question.';
      if (getKnowledgeScore(draft.knowledge_answers) !== ONBOARDING_KNOWLEDGE_QUESTIONS.length) return 'Review the highlighted answers. A perfect score is required before continuing.';
    }
    if (currentStep === 7) {
      if (!draft.declaration_accurate || !draft.declaration_compliance) return 'Accept both final declarations.';
      if (draft.digital_signature.trim().toLowerCase() !== draft.full_name.trim().toLowerCase()) return 'Your digital signature must match your full legal name.';
      if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Use a password of 8+ characters with at least one letter and number.';
      if (password !== passwordConfirm) return 'The passwords do not match.';
    }
    return null;
  };

  const next = async () => {
    const validationError = validate(step);
    if (validationError) { toast.error(validationError); return; }
    const nextStep = Math.min(7, step + 1);
    try {
      await save(nextStep);
      setStep(nextStep);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : 'Could not save your progress.');
    }
  };

  const back = () => {
    setStep((current) => Math.max(0, current - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const uploadDocument = async (documentType: string, file: File) => {
    setUploading(documentType);
    try {
      const definition = DOCUMENT_TYPES.find((item) => item.key === documentType);
      const upload = await invoke('create_upload_url', {
        document_type: documentType,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
      });
      const { error: uploadError } = await supabase.storage
        .from('staff-documents')
        .uploadToSignedUrl(upload.path, upload.upload_token, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const recorded = await invoke('record_upload', {
        document_type: documentType,
        path: upload.path,
        label: definition?.label ?? documentType,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
      });
      setDocuments((current) => ({ ...current, [documentType]: recorded.document }));
      toast.success(`${definition?.label ?? 'Document'} uploaded`);
    } catch (uploadError) {
      toast.error(uploadError instanceof Error ? uploadError.message : 'Upload failed');
    } finally {
      setUploading(null);
    }
  };

  const handleFile = (documentType: string) => (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void uploadDocument(documentType, file);
    event.target.value = '';
  };

  const submit = async () => {
    const validationError = validate(7);
    if (validationError) { toast.error(validationError); return; }
    setSubmitting(true);
    try {
      const result = await invoke('submit', { payload: payload(7), password });
      setSubmitted(true);
      if (result.email) await supabase.auth.signInWithPassword({ email: result.email, password });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const score = useMemo(() => getKnowledgeScore(draft.knowledge_answers), [draft.knowledge_answers]);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-muted/30"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  if (error) return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-5">
      <div className="w-full max-w-md rounded-3xl border bg-card p-7 text-center shadow-xl">
        <img src={brightlyLogo} alt="Brightly Cleaning" className="mx-auto mb-6 h-12 w-auto" />
        <ShieldCheck className="mx-auto mb-4 h-11 w-11 text-destructive" />
        <h1 className="text-xl font-bold">We can’t open this link</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{error}</p>
      </div>
    </main>
  );

  if (submitted) return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-5">
      <div className="w-full max-w-lg rounded-3xl border bg-card p-7 text-center shadow-xl sm:p-10">
        <img src={brightlyLogo} alt="Brightly Cleaning" className="mx-auto mb-7 h-12 w-auto" />
        <CheckCircle2 className="mx-auto h-14 w-14 text-primary" />
        <h1 className="mt-5 text-2xl font-extrabold">You’re officially in the Brightly pipeline</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Your details, documents, acknowledgements and knowledge check are safely on file. The Brightly team will verify your documents and arrange your induction and two shadow cleans before solo work.</p>
        <Button className="mt-7 h-12 w-full rounded-xl" onClick={() => { window.location.href = '/'; }}>Open Brightly</Button>
      </div>
    </main>
  );

  return (
    <main className="min-h-screen overflow-x-hidden bg-gradient-to-b from-primary/5 via-background to-muted/30 pb-28">
      <header className="border-b bg-background/95 px-4 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <img src={brightlyLogo} alt="Brightly Cleaning" className="h-9 w-auto max-w-[140px]" />
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><LockKeyhole className="h-3.5 w-3.5" /> Private & secure</div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-9">
        <div className="mb-6">
          <div className="mb-2 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Cleaner onboarding</p>
              <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{STAFF_ONBOARDING_STEPS[step]}</h1>
            </div>
            <span className="shrink-0 text-sm font-semibold text-muted-foreground">{step + 1} / {STAFF_ONBOARDING_STEPS.length}</span>
          </div>
          <Progress value={((step + 1) / STAFF_ONBOARDING_STEPS.length) * 100} className="h-2" />
          <div className="mt-2 flex min-h-5 items-center gap-1.5 text-xs text-muted-foreground">
            {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : lastSaved ? <><Check className="h-3.5 w-3.5 text-primary" /> Progress saved</> : <><Clock3 className="h-3.5 w-3.5" /> Your progress saves as you continue</>}
          </div>
        </div>

        <section className="rounded-3xl border bg-card p-5 shadow-lg shadow-primary/5 sm:p-8">
          {step === 0 && (
            <div className="space-y-5">
              <p className="text-sm leading-6 text-muted-foreground">Use your legal details. These become your Brightly staff record and emergency contact file.</p>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Full legal name" required><Input className="h-11 rounded-xl" autoComplete="name" value={draft.full_name} onChange={(e) => set('full_name', e.target.value)} /></Field>
                <Field label="Preferred name"><Input className="h-11 rounded-xl" value={draft.preferred_name} onChange={(e) => set('preferred_name', e.target.value)} /></Field>
                <Field label="Email" required><Input className="h-11 rounded-xl bg-muted" type="email" value={draft.email} readOnly /></Field>
                <Field label="Mobile" required><Input className="h-11 rounded-xl" type="tel" autoComplete="tel" value={draft.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
                <AustralianDateField label="Date of birth" required autoComplete="bday" value={draft.date_of_birth} onChange={(value) => set('date_of_birth', value)} />
                <div className="hidden sm:block" />
                <div className="sm:col-span-2"><Field label="Residential address" required><Input className="h-11 rounded-xl" autoComplete="street-address" value={draft.address} onChange={(e) => set('address', e.target.value)} /></Field></div>
                <Field label="Suburb" required><Input className="h-11 rounded-xl" value={draft.residential_suburb} onChange={(e) => set('residential_suburb', e.target.value)} /></Field>
                <Field label="Postcode" required><Input className="h-11 rounded-xl" inputMode="numeric" maxLength={4} value={draft.postcode} onChange={(e) => set('postcode', normaliseDigits(e.target.value).slice(0, 4))} /></Field>
              </div>
              <div className="border-t pt-5">
                <h2 className="font-bold">Emergency contact</h2>
                <div className="mt-4 grid gap-5 sm:grid-cols-2">
                  <Field label="Contact name" required><Input className="h-11 rounded-xl" value={draft.emergency_contact_name} onChange={(e) => set('emergency_contact_name', e.target.value)} /></Field>
                  <Field label="Relationship" required><Input className="h-11 rounded-xl" value={draft.emergency_contact_relationship} onChange={(e) => set('emergency_contact_relationship', e.target.value)} /></Field>
                  <Field label="Contact phone" required><Input className="h-11 rounded-xl" type="tel" value={draft.emergency_contact_phone} onChange={(e) => set('emergency_contact_phone', e.target.value)} /></Field>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <div className="overflow-hidden rounded-2xl border border-primary/30 bg-primary/5">
                <div className="p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <h2 className="font-bold">Independent-contractor arrangement</h2>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">See exactly how work, payment, ABN obligations and Brightly standards apply before you accept.</p>
                    </div>
                  </div>
                  <Button type="button" variant="outline" className="mt-4 h-11 w-full justify-between rounded-xl bg-background" onClick={() => setContractorTermsOpen((open) => !open)} aria-expanded={contractorTermsOpen}>
                    <span>{contractorTermsOpen ? 'Close arrangement' : 'Read contractor arrangement'}</span>
                    <ChevronDown className={cn('h-4 w-4 transition-transform', contractorTermsOpen && 'rotate-180')} />
                  </Button>
                </div>
                {contractorTermsOpen && <div className="space-y-4 border-t bg-background p-4 sm:p-5">{INDEPENDENT_CONTRACTOR_TERMS.map((term) => <div key={term.title}><h3 className="text-sm font-bold">{term.title}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{term.body}</p></div>)}</div>}
              </div>
              <ChoiceCard checked={draft.is_contractor} onChange={(value) => set('is_contractor', value)} title="I have read and accept the independent-contractor arrangement" description="You can reopen the arrangement above at any time before submitting." />
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="ABN status" required><select className={selectClass} value={draft.abn_status} onChange={(e) => set('abn_status', e.target.value)}><option value="">Select…</option><option value="yes">I have an active ABN</option><option value="applying">I am applying for an ABN</option></select></Field>
                <Field label="ABN" required hint="11 digits"><Input className="h-11 rounded-xl" inputMode="numeric" value={draft.abn} onChange={(e) => set('abn', normaliseDigits(e.target.value).slice(0, 11))} /></Field>
              </div>
              <ChoiceCard checked={draft.gst_registered} onChange={(value) => set('gst_registered', value)} title="I am registered for GST" description="Leave unticked if you are not GST registered." />
              <div className="border-t pt-5">
                <div className="mb-4 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="font-bold">Payment details</h2></div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Account name" required><Input className="h-11 rounded-xl" autoComplete="name" value={draft.bank_account_name} onChange={(e) => set('bank_account_name', e.target.value)} /></Field>
                  <Field label="BSB" required><Input className="h-11 rounded-xl" inputMode="numeric" placeholder="000000" value={draft.bank_bsb} onChange={(e) => set('bank_bsb', normaliseDigits(e.target.value).slice(0, 6))} /></Field>
                  <Field label="Account number" required><Input className="h-11 rounded-xl" inputMode="numeric" value={draft.bank_account_number} onChange={(e) => set('bank_account_number', normaliseDigits(e.target.value).slice(0, 12))} /></Field>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <p className="text-sm leading-6 text-muted-foreground">Upload clear, current documents. Files are private and only authorised Brightly admins can open them.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {DOCUMENT_TYPES.map((document) => (
                  <label key={document.key} className={cn('relative flex min-h-32 cursor-pointer flex-col justify-between rounded-2xl border-2 border-dashed p-4 transition-colors', documents[document.key] ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50')}>
                    <input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={handleFile(document.key)} disabled={uploading === document.key} />
                    <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{document.label}{document.required && <span className="text-destructive"> *</span>}</p><p className="mt-1 break-all text-xs text-muted-foreground">{documents[document.key]?.original_name || 'JPG, PNG, WebP or PDF · max 10 MB'}</p></div>{documents[document.key] ? <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" /> : <Upload className="h-5 w-5 shrink-0 text-muted-foreground" />}</div>
                    <span className="mt-4 text-xs font-semibold text-primary">{uploading === document.key ? 'Uploading…' : documents[document.key] ? 'Replace file' : 'Choose file'}</span>
                  </label>
                ))}
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Photo ID type" required><select className={selectClass} value={draft.id_document_type} onChange={(e) => set('id_document_type', e.target.value)}><option value="">Select…</option><option value="drivers_licence">Driver’s licence</option><option value="passport">Passport</option><option value="proof_of_age">Proof-of-age card</option></select></Field>
                {draft.id_document_type === 'drivers_licence' && <AustralianDateField label="Licence expiry" required value={draft.drivers_licence_expiry} onChange={(value) => set('drivers_licence_expiry', value)} />}
                <Field label="Public liability"><select className={selectClass} value={draft.public_liability_status} onChange={(e) => set('public_liability_status', e.target.value)}><option value="">Select…</option><option value="yes">I hold a current policy</option><option value="no">I do not hold a policy</option><option value="in_progress">Application in progress</option></select></Field>
                {draft.public_liability_status === 'yes' && <AustralianDateField label="Policy expiry" required value={draft.public_liability_expiry} onChange={(value) => set('public_liability_expiry', value)} />}
              </div>
              <ChoiceCard checked={draft.id_confirmed} onChange={(value) => set('id_confirmed', value)} title="I confirm the uploaded ID is current, valid and belongs to me" />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div><h2 className="font-bold">Days you can usually work</h2><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{DAYS_OF_WEEK.map((day) => <button type="button" key={day} className={cn('min-h-11 rounded-xl border px-3 text-sm font-semibold', draft.available_days.includes(day) ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background')} onClick={() => set('available_days', draft.available_days.includes(day) ? draft.available_days.filter((value) => value !== day) : [...draft.available_days, day])}>{day}</button>)}</div></div>
              <Field label="Vehicle registration"><Input className="h-11 rounded-xl uppercase" value={draft.vehicle_rego} onChange={(e) => set('vehicle_rego', e.target.value.toUpperCase())} /></Field>
              <Field label="Availability notes"><Textarea className="min-h-24 rounded-xl" placeholder="School hours, recurring commitments or anything scheduling should know" value={draft.availability_notes} onChange={(e) => set('availability_notes', e.target.value)} /></Field>
              <ChoiceCard checked={draft.transport_confirmed} onChange={(value) => set('transport_confirmed', value)} title="I have reliable transport to reach Brightly properties across the Brisbane service area" />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <div className="rounded-2xl bg-primary/5 p-5"><h2 className="font-bold">Brightly is your source of truth</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Assignments, addresses, access details, checklists, clock-on/off, room photos and completion all belong in Brightly. WhatsApp may be used for team conversation, but it does not replace the job record.</p></div>
              <ChoiceCard checked={draft.brightly_notifications_enabled} onChange={(value) => set('brightly_notifications_enabled', value)} title="I will keep Brightly notifications enabled" description="Accept or decline new assignments within 2 hours and check the live job record before travel." />
              <ChoiceCard checked={draft.communication_acknowledged} onChange={(value) => set('communication_acknowledged', value)} title="I accept the communication and scheduling rules" description="Call for changes within 24 hours; notify the head cleaner before start time if 15+ minutes late; call Brendan immediately for urgent access, damage, safety or guest-ready risks." />
              <ChoiceCard checked={draft.has_whatsapp} onChange={(value) => set('has_whatsapp', value)} title="I have WhatsApp available on this phone" description="Optional, for secondary team communication." />
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-primary/5 p-4"><p className="font-bold">Three clear sections. Three acknowledgements.</p><p className="mt-1 text-sm leading-6 text-muted-foreground">Open each section, read the requirements and accept it. These replace the previous 14 separate ticks.</p></div>
              {ONBOARDING_ACKNOWLEDGEMENTS.map((item) => (
                <article key={item.key} className={cn('overflow-hidden rounded-2xl border', draft.sop_acknowledgements[item.key] ? 'border-primary bg-primary/5' : 'border-border bg-card')}>
                  <div className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold">{item.title}</h2><span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">{item.source}</span></div><p className="mt-2 text-sm leading-6 text-muted-foreground">{item.summary}</p></div></div>
                    <Button type="button" variant="outline" className="mt-4 h-11 w-full justify-between rounded-xl bg-background" onClick={() => setOpenAcknowledgement((open) => open === item.key ? null : item.key)} aria-expanded={openAcknowledgement === item.key}>
                      <span className="flex items-center gap-2"><BookOpen className="h-4 w-4" />{openAcknowledgement === item.key ? 'Close section' : 'Open & read section'}</span>
                      <ChevronDown className={cn('h-4 w-4 transition-transform', openAcknowledgement === item.key && 'rotate-180')} />
                    </Button>
                  </div>
                  {openAcknowledgement === item.key && (
                    <div className="space-y-5 border-y bg-background p-4 sm:p-5">
                      <div>
                        <h3 className="text-sm font-bold">Required documents</h3>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">Open every PDF in this section. Each one stays available later in your Brightly staff hub.</p>
                        <div className="mt-3 grid gap-2">
                          {getSopsForAcknowledgement(item.key).map((document) => {
                            const opened = openedSopCodes.includes(document.code);
                            return (
                              <a
                                key={document.code}
                                href={document.pdfUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={() => setOpenedSopCodes((codes) => codes.includes(document.code) ? codes : [...codes, document.code])}
                                className={cn('flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors', opened ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary/50')}
                              >
                                <span className="min-w-0"><span className="block text-[10px] text-muted-foreground">{document.code}</span><span className="block truncate">{document.title}</span></span>
                                <ExternalLink className="h-4 w-4 shrink-0" />
                              </a>
                            );
                          })}
                        </div>
                      </div>
                      {item.details.map((detail) => <div key={detail.title}><h3 className="text-sm font-bold">{detail.title}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{detail.body}</p></div>)}
                    </div>
                  )}
                  {(() => {
                    const documentsForSection = getSopsForAcknowledgement(item.key);
                    const documentsOpened = documentsForSection.every((document) => openedSopCodes.includes(document.code));
                    const canAcknowledge = draft.sop_acknowledgements[item.key] || documentsOpened;
                    return (
                      <label className={cn('flex items-start gap-3 p-4 sm:p-5', canAcknowledge ? 'cursor-pointer' : 'cursor-not-allowed opacity-60')}>
                        <Checkbox
                          className="mt-0.5 h-5 w-5 shrink-0"
                          checked={draft.sop_acknowledgements[item.key]}
                          disabled={!canAcknowledge}
                          onCheckedChange={(value) => set('sop_acknowledgements', { ...draft.sop_acknowledgements, [item.key]: value === true })}
                        />
                        <span className="text-sm font-semibold leading-6 text-foreground">
                          {item.declaration}
                          {!canAcknowledge && <span className="mt-1 block text-xs font-normal text-muted-foreground">Open all {documentsForSection.length} PDF{documentsForSection.length === 1 ? '' : 's'} above to unlock this acknowledgement.</span>}
                        </span>
                      </label>
                    );
                  })()}
                </article>
              ))}
            </div>
          )}

          {step === 6 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between rounded-2xl bg-primary/5 p-4"><div><p className="font-bold">Knowledge check</p><p className="text-xs text-muted-foreground">10/10 is required</p></div><span className="text-xl font-extrabold text-primary">{score}/{ONBOARDING_KNOWLEDGE_QUESTIONS.length}</span></div>
              {ONBOARDING_KNOWLEDGE_QUESTIONS.map((question, index) => {
                const selected = draft.knowledge_answers[question.key];
                const wrong = selected !== undefined && selected !== question.correctIndex;
                return <fieldset key={question.key} className={cn('rounded-2xl border p-4 sm:p-5', wrong ? 'border-destructive/50 bg-destructive/5' : 'border-border')}><legend className="px-1 text-sm font-bold leading-6">{index + 1}. {question.prompt}</legend><div className="mt-3 space-y-2">{question.options.map((option, optionIndex) => <label key={option} className={cn('flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm', selected === optionIndex ? 'border-primary bg-primary/5 font-semibold' : 'border-border')}><input type="radio" className="h-4 w-4 accent-primary" name={question.key} checked={selected === optionIndex} onChange={() => set('knowledge_answers', { ...draft.knowledge_answers, [question.key]: optionIndex })} />{option}</label>)}</div>{wrong && <p className="mt-3 text-xs font-semibold text-destructive">Not quite — review the onboarding standard and try again.</p>}<p className="mt-3 text-[11px] text-muted-foreground">Source: {question.source}</p></fieldset>;
              })}
            </div>
          )}

          {step === 7 && (
            <div className="space-y-6">
              <div className="rounded-2xl border bg-muted/30 p-5"><div className="flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-primary" /><h2 className="font-bold">Final declaration</h2></div><p className="mt-3 text-sm leading-6 text-muted-foreground">Your typed name and timestamp create the record that you completed this version of Brightly onboarding. Solo deployment only happens after document verification, induction, app test, kit issue, two shadow cleans and Director approval.</p></div>
              <ChoiceCard checked={draft.declaration_accurate} onChange={(value) => set('declaration_accurate', value)} title="I confirm every detail and document I provided is accurate, current and belongs to me" />
              <ChoiceCard checked={draft.declaration_compliance} onChange={(value) => set('declaration_compliance', value)} title="I agree to follow the SOP, conduct, privacy, communication, WHS and ongoing-training requirements I acknowledged" />
              <Field label="Digital signature — type your full legal name" required><Input className="h-12 rounded-xl text-lg" value={draft.digital_signature} onChange={(e) => set('digital_signature', e.target.value)} /></Field>
              <div className="border-t pt-5"><h2 className="font-bold">Create your Brightly password</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">At least 8 characters with a letter and number.</p><div className="mt-4 grid gap-5 sm:grid-cols-2"><Field label="Password" required><Input className="h-11 rounded-xl" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field><Field label="Confirm password" required><Input className="h-11 rounded-xl" type="password" autoComplete="new-password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} /></Field></div></div>
            </div>
          )}
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl gap-3">
          {step > 0 && <Button variant="outline" className="h-12 rounded-xl px-4" onClick={back} disabled={saving || submitting}><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button>}
          {step < 7 ? <Button className="h-12 flex-1 rounded-xl text-base font-bold" onClick={next} disabled={saving}><span>Save & continue</span>{saving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <ArrowRight className="ml-2 h-4 w-4" />}</Button> : <Button className="h-12 flex-1 rounded-xl text-base font-bold" onClick={submit} disabled={submitting}>{submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting…</> : <><CheckCircle2 className="mr-2 h-4 w-4" />Submit onboarding</>}</Button>}
        </div>
      </div>
    </main>
  );
}
