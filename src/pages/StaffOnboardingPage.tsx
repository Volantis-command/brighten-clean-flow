import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle2, AlertCircle, Upload, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const STEPS = [
  'Personal Details',
  'Work Entitlements',
  'Identity Verification',
  'Your Availability',
  'WhatsApp + Policy Acknowledgements',
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const START_TIMES = ['7:00am', '8:00am', '9:00am', '10:00am'];
const MAX_JOBS = ['1', '2', '3', 'No limit'];
const DOB_MONTHS = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];
const DOB_YEARS = Array.from({ length: 2005 - 1950 + 1 }, (_, index) => String(2005 - index));

const POLICIES = [
  'I have read and understand the Cleaner Onboarding & Training SOP (B-ABNB-HR-002) and agree to comply with all standards and expectations.',
  'I understand I am engaged as an independent contractor. Work is offered as available — there are no guaranteed hours. I am responsible for my own tax obligations.',
  'I understand that no-show on an accepted job is a serious breach and may result in roster removal. Cancelling with less than 4 hours notice will result in a written warning.',
  'I will never share property access codes, entry details, or client information with any third party.',
  'I understand that all jobs must be completed to Brightly\'s hotel-standard SOP, before/after photos submitted, and the job marked complete before leaving the property.',
  'I understand that a minimum of two shadow cleans are required before solo deployment, and solo deployment is at the Director\'s discretion.',
  'Chemical safety: I will never mix chemicals, will wear rubber gloves at all times during cleaning, and will report any WHS incident to Brendan Parker immediately on 0418 878 707.',
  'I confirm all information provided in this form is accurate and complete.',
];

interface FormData {
  full_name: string;
  preferred_name: string;
  phone: string;
  email: string;
  date_of_birth: Date | undefined;
  address: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
  abn_status: string;
  abn: string;
  bank_account_name: string;
  bank_bsb: string;
  bank_account_number: string;
  id_confirmed: boolean;
  available_days: string[];
  preferred_start_time: string;
  max_jobs_per_day: string;
  availability_notes: string;
  has_whatsapp: boolean;
  policy_acks: boolean[];
}

const initialForm: FormData = {
  full_name: '', preferred_name: '', phone: '', email: '',
  date_of_birth: undefined, address: '',
  emergency_contact_name: '', emergency_contact_phone: '', emergency_contact_relationship: '',
  abn_status: '', abn: '',
  bank_account_name: '', bank_bsb: '', bank_account_number: '',
  id_confirmed: false,
  available_days: [], preferred_start_time: '', max_jobs_per_day: '',
  availability_notes: '', has_whatsapp: false,
  policy_acks: POLICIES.map(() => false),
};

export default function StaffOnboardingPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [form, setForm] = useState<FormData>(initialForm);
  const [recordId, setRecordId] = useState('');
  const [userId, setUserId] = useState('');
  const [currentStep, setCurrentStep] = useState(1);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [uploadingId, setUploadingId] = useState(false);
  const [idFileUrl, setIdFileUrl] = useState('');
  const [dobDay, setDobDay] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobYear, setDobYear] = useState('');

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return; }
    supabase
      .from('staff_onboarding')
      .select('*')
      .eq('onboarding_token', token)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (error || !data) { setNotFound(true); setLoading(false); return; }
        if (data.submitted_at) { setAlreadySubmitted(true); setLoading(false); return; }
        setRecordId(data.id);
        setUserId(data.user_id);
        const d = data as any;

        // Also fetch phone from profiles table if not on staff_onboarding
        let phone = d.phone || '';
        if (!phone) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('phone')
            .eq('id', data.user_id)
            .maybeSingle();
          if (profile?.phone) phone = profile.phone;
        }

        setForm(prev => ({
          ...prev,
          full_name: d.full_name || '',
          preferred_name: d.preferred_name || '',
          phone,
          email: d.email || '',
          date_of_birth: d.date_of_birth ? new Date(d.date_of_birth) : undefined,
          address: d.address || '',
        }));
        if (d.date_of_birth) {
          const existingDob = new Date(d.date_of_birth);
          setDobDay(String(existingDob.getDate()));
          setDobMonth(String(existingDob.getMonth() + 1));
          setDobYear(String(existingDob.getFullYear()));
        }
        setLoading(false);
      });
  }, [token]);

  const update = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const toggleDay = (day: string) => {
    setForm(prev => ({
      ...prev,
      available_days: prev.available_days.includes(day)
        ? prev.available_days.filter(d => d !== day)
        : [...prev.available_days, day],
    }));
  };

  const togglePolicy = (idx: number) => {
    setForm(prev => {
      const newAcks = [...prev.policy_acks];
      newAcks[idx] = !newAcks[idx];
      return { ...prev, policy_acks: newAcks };
    });
  };

  const updateDateOfBirth = (part: 'day' | 'month' | 'year', value: string) => {
    const nextDay = part === 'day' ? value : dobDay;
    const nextMonth = part === 'month' ? value : dobMonth;
    const nextYear = part === 'year' ? value : dobYear;
    setDobDay(nextDay);
    setDobMonth(nextMonth);
    setDobYear(nextYear);
    if (!nextDay || !nextMonth || !nextYear) { update('date_of_birth', undefined); return; }
    const dayNumber = Number(nextDay);
    const monthNumber = Number(nextMonth);
    const yearNumber = Number(nextYear);
    const maxDay = new Date(yearNumber, monthNumber, 0).getDate();
    const safeDay = Math.min(dayNumber, maxDay);
    if (safeDay !== dayNumber) setDobDay(String(safeDay));
    update('date_of_birth', new Date(yearNumber, monthNumber - 1, safeDay));
  };

  const availableDobDays = (() => {
    if (!dobMonth || !dobYear) return Array.from({ length: 31 }, (_, i) => i + 1);
    const totalDays = new Date(Number(dobYear), Number(dobMonth), 0).getDate();
    return Array.from({ length: totalDays }, (_, i) => i + 1);
  })();

  const uploadFile = async (file: File, folder: string): Promise<string> => {
    const ext = file.name.split('.').pop();
    const path = `${folder}/${recordId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('staff-documents').upload(path, file);
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('staff-documents').getPublicUrl(path);
    return publicUrl;
  };

  const handleIdUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIdFile(file);
    setUploadingId(true);
    try {
      const url = await uploadFile(file, 'id-documents');
      setIdFileUrl(url);
      toast.success('ID uploaded successfully');
    } catch (err: any) {
      toast.error('Upload failed: ' + err.message);
      setIdFile(null);
    } finally {
      setUploadingId(false);
    }
  };

  const totalSteps = STEPS.length;

  const validateStep = (step: number): string | null => {
    switch (step) {
      case 1:
        if (!form.full_name) return 'Full legal name is required';
        if (!form.phone) return 'Mobile number is required';
        if (!form.email) return 'Email address is required';
        if (!form.date_of_birth) return 'Date of birth is required';
        if (!form.address) return 'Residential address is required';
        if (!form.emergency_contact_name) return 'Emergency contact name is required';
        if (!form.emergency_contact_phone) return 'Emergency contact phone is required';
        if (!form.emergency_contact_relationship) return 'Emergency contact relationship is required';
        return null;
      case 2:
        if (!form.abn_status) return 'Please select your ABN status';
        if (form.abn_status === 'yes' && !form.abn) return 'ABN number is required';
        if (!form.bank_account_name) return 'Bank account name is required';
        if (!form.bank_bsb) return 'BSB is required';
        if (!form.bank_account_number) return 'Account number is required';
        return null;
      case 3:
        if (!idFileUrl) return 'Please upload a photo of your ID';
        if (!form.id_confirmed) return 'Please confirm your ID is current and belongs to you';
        return null;
      case 4:
        if (form.available_days.length === 0) return 'Please select at least one available day';
        if (!form.preferred_start_time) return 'Please select a preferred start time';
        if (!form.max_jobs_per_day) return 'Please select maximum jobs per day';
        return null;
      case 5:
        if (!form.policy_acks.every(Boolean)) return 'All policy acknowledgements must be checked';
        return null;
      default:
        return null;
    }
  };

  const validateCurrentStep = () => validateStep(currentStep);

  const goToStep = (step: number) => {
    setCurrentStep(Math.max(1, Math.min(step, totalSteps)));
    window.scrollTo(0, 0);
  };

  const handleNext = () => {
    const err = validateCurrentStep();
    if (err) { toast.error(err); return; }
    if (currentStep < totalSteps) {
      setCurrentStep(prev => Math.min(prev + 1, totalSteps));
      window.scrollTo(0, 0);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => Math.max(prev - 1, 1));
      window.scrollTo(0, 0);
    }
  };

  const handleSubmit = async () => {
    for (let step = 1; step <= totalSteps; step += 1) {
      const err = validateStep(step);
      if (err) { goToStep(step); toast.error(err); return; }
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('staff_onboarding')
        .update({
          full_name: form.full_name,
          preferred_name: form.preferred_name || null,
          phone: form.phone,
          email: form.email,
          date_of_birth: form.date_of_birth ? format(form.date_of_birth, 'yyyy-MM-dd') : null,
          address: form.address,
          emergency_contact_name: form.emergency_contact_name,
          emergency_contact_phone: form.emergency_contact_phone,
          emergency_contact_relationship: form.emergency_contact_relationship,
          abn_status: form.abn_status,
          abn: form.abn_status === 'yes' ? form.abn : null,
          is_contractor: true,
          bank_account_name: form.bank_account_name,
          bank_bsb: form.bank_bsb,
          bank_account_number: form.bank_account_number,
          id_document_url: idFileUrl || null,
          id_confirmed: form.id_confirmed,
          available_days: form.available_days,
          preferred_start_time: form.preferred_start_time,
          max_jobs_per_day: form.max_jobs_per_day,
          availability_notes: form.availability_notes || null,
          has_whatsapp: form.has_whatsapp,
          policy_acknowledgements: form.policy_acks,
          submitted_at: new Date().toISOString(),
          status: 'submitted',
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', recordId);

      if (error) throw error;

      const dayMap: Record<string, string> = {
        Monday: 'mon', Tuesday: 'tue', Wednesday: 'wed', Thursday: 'thu',
        Friday: 'fri', Saturday: 'sat', Sunday: 'sun',
      };
      const weeklyAvailability = form.available_days.map(d => dayMap[d]).filter(Boolean);
      await supabase.from('profiles').update({
        full_name: form.full_name,
        phone: form.phone,
        email: form.email,
        weekly_availability: weeklyAvailability,
      } as any).eq('id', userId);

      const { data: admins } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');

      if (admins) {
        await (await import('@/lib/alerts')).createAlert({
          event_type: 'booking_confirmed',
          title: 'New Staff Onboarding',
          body: `${form.full_name} has completed their onboarding form. Review in the app.`,
          link: '/staff',
        });
      }

      try {
        await supabase.functions.invoke('send-job-sms', {
          body: {
            to: '0418878707',
            message: `New staff onboarding submitted — ${form.full_name}. Review in the app.`,
          },
        });
      } catch { /* SMS is best-effort */ }

      setSubmitted(true);
    } catch (err: any) {
      toast.error('Failed to submit: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const progress = (currentStep / totalSteps) * 100;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-secondary">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  if (notFound) return (
    <div className="min-h-screen flex items-center justify-center bg-secondary p-6">
      <div className="bg-card rounded-2xl shadow-lg p-8 text-center max-w-md">
        <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
        <h1 className="text-xl font-bold mb-2 text-foreground">Invalid or Expired Link</h1>
        <p className="text-muted-foreground">This onboarding link is invalid or has expired. Contact your manager for a new link.</p>
      </div>
    </div>
  );

  if (alreadySubmitted) return (
    <div className="min-h-screen flex items-center justify-center bg-secondary p-6">
      <div className="bg-card rounded-2xl shadow-lg p-8 text-center max-w-md">
        <CheckCircle2 className="w-12 h-12 text-primary mx-auto mb-4" />
        <h1 className="text-xl font-bold mb-2 text-foreground">Already Submitted</h1>
        <p className="text-muted-foreground">Your onboarding form has already been submitted. Contact Brendan if you need to make changes.</p>
      </div>
    </div>
  );

  if (submitted) return (
    <div className="min-h-screen flex items-center justify-center bg-secondary p-6">
      <div className="bg-card rounded-2xl shadow-lg p-8 text-center max-w-md">
        <CheckCircle2 className="w-16 h-16 text-primary mx-auto mb-4" />
        <h1 className="text-2xl font-extrabold mb-3 text-foreground">You're All Done!</h1>
        <p className="text-muted-foreground text-base">
          Brendan will be in touch shortly to schedule your induction and first shadow clean. Welcome to Brightly 🌿
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-secondary py-6 px-4">
      <div className="max-w-lg mx-auto space-y-5">
        {/* Header */}
        <div className="text-center mb-2">
          <h1 className="text-2xl font-extrabold text-primary">Brightly.</h1>
          <h2 className="text-lg font-bold text-foreground mt-2">Welcome to Brightly — Let's Get You Set Up</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Complete each step before your first job. This should take about 5 minutes.
          </p>
        </div>

        {/* Progress */}
        <div className="bg-card rounded-xl p-4 shadow-sm">
          <div className="flex justify-between text-xs font-semibold text-muted-foreground mb-2">
            <span>Section {currentStep} of {totalSteps}</span>
            <span>{STEPS[currentStep - 1]}</span>
          </div>
          <Progress value={progress} className="h-2" />
          <div className="flex gap-1 mt-3">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={cn(
                  'flex-1 h-1.5 rounded-full transition-colors',
                  i + 1 <= currentStep ? 'bg-primary' : 'bg-border'
                )}
              />
            ))}
          </div>
        </div>

        {/* Section 1: Personal Details */}
        {currentStep === 1 && (
          <div className="bg-card rounded-2xl shadow-md p-5 space-y-4">
            <h2 className="text-base font-bold text-primary">1. Personal Details</h2>
            <div className="space-y-3">
              <div>
                <Label className="text-sm">Full Legal Name *</Label>
                <Input value={form.full_name} onChange={e => update('full_name', e.target.value)} placeholder="Jane Doe" />
              </div>
              <div>
                <Label className="text-sm">Preferred Name</Label>
                <Input value={form.preferred_name} onChange={e => update('preferred_name', e.target.value)} placeholder="Jane" />
              </div>
              <div>
                <Label className="text-sm">Mobile Number *</Label>
                <Input value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="0412 345 678" />
              </div>
              <div>
                <Label className="text-sm">Email Address *</Label>
                <Input type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="jane@email.com" />
              </div>
              <div>
                <Label className="text-sm">Date of Birth *</Label>
                <div className="grid grid-cols-3 gap-3">
                  <Select value={dobDay} onValueChange={(value) => updateDateOfBirth('day', value)}>
                    <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Day" /></SelectTrigger>
                    <SelectContent>
                      {availableDobDays.map((day) => (
                        <SelectItem key={day} value={String(day)}>{day}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={dobMonth} onValueChange={(value) => updateDateOfBirth('month', value)}>
                    <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Month" /></SelectTrigger>
                    <SelectContent>
                      {DOB_MONTHS.map((month) => (
                        <SelectItem key={month.value} value={month.value}>{month.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={dobYear} onValueChange={(value) => updateDateOfBirth('year', value)}>
                    <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Year" /></SelectTrigger>
                    <SelectContent>
                      {DOB_YEARS.map((year) => (
                        <SelectItem key={year} value={year}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-sm">Residential Address *</Label>
                <Input value={form.address} onChange={e => update('address', e.target.value)} placeholder="123 Main St, Suburb VIC 3000" />
              </div>
              <div className="pt-2 border-t border-border">
                <p className="text-sm font-semibold text-foreground mb-2">Emergency Contact</p>
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm">Name *</Label>
                    <Input value={form.emergency_contact_name} onChange={e => update('emergency_contact_name', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-sm">Phone *</Label>
                    <Input value={form.emergency_contact_phone} onChange={e => update('emergency_contact_phone', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-sm">Relationship *</Label>
                    <Input value={form.emergency_contact_relationship} onChange={e => update('emergency_contact_relationship', e.target.value)} placeholder="Partner, Parent, etc." />
                  </div>
                </div>
              </div>
            </div>
            <Button onClick={handleNext} className="w-full bg-primary text-primary-foreground font-bold rounded-xl">
              Next →
            </Button>
          </div>
        )}

        {/* Section 2: Work Entitlements */}
        {currentStep === 2 && (
          <div className="bg-card rounded-2xl shadow-md p-5 space-y-4">
            <h2 className="text-base font-bold text-primary">2. Work Entitlements</h2>
            <div className="space-y-3">
              <div>
                <Label className="text-sm">Do you have a valid ABN? *</Label>
                <Select value={form.abn_status} onValueChange={v => update('abn_status', v)}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="need_to_register">I need to register one</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.abn_status === 'yes' && (
                <div>
                  <Label className="text-sm">ABN Number *</Label>
                  <Input value={form.abn} onChange={e => update('abn', e.target.value)} placeholder="12 345 678 901" />
                </div>
              )}
              {(form.abn_status === 'no' || form.abn_status === 'need_to_register') && (
                <div className="bg-accent/20 border border-accent rounded-lg p-3 text-sm">
                  <p className="font-semibold text-foreground">ABN Required</p>
                  <p className="text-muted-foreground mt-1">
                    You must have a valid ABN before your first job. Register free at{' '}
                    <a href="https://www.abr.gov.au" target="_blank" rel="noopener noreferrer" className="text-primary underline font-semibold">
                      abr.gov.au
                    </a>
                  </p>
                </div>
              )}
              <div className="pt-2 border-t border-border">
                <p className="text-sm font-semibold text-foreground mb-2">Bank Details</p>
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm">Account Name *</Label>
                    <Input value={form.bank_account_name} onChange={e => update('bank_account_name', e.target.value)} placeholder="Jane Doe" />
                  </div>
                  <div>
                    <Label className="text-sm">BSB *</Label>
                    <Input value={form.bank_bsb} onChange={e => update('bank_bsb', e.target.value)} placeholder="062-000" />
                  </div>
                  <div>
                    <Label className="text-sm">Account Number *</Label>
                    <Input value={form.bank_account_number} onChange={e => update('bank_account_number', e.target.value)} placeholder="1234 5678" />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleBack} className="flex-1 rounded-xl gap-1">
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
              <Button onClick={handleNext} className="flex-1 bg-primary text-primary-foreground font-bold rounded-xl">
                Next →
              </Button>
            </div>
          </div>
        )}

        {/* Section 3: Identity Verification */}
        {currentStep === 3 && (
          <div className="bg-card rounded-2xl shadow-md p-5 space-y-4">
            <h2 className="text-base font-bold text-primary">3. Identity Verification</h2>
            <div className="space-y-3">
              <div>
                <Label className="text-sm">Upload a photo of your ID (driver's licence or passport) *</Label>
                <div className="mt-1">
                  <label className={cn(
                    "flex items-center gap-2 border-2 border-dashed rounded-xl p-4 cursor-pointer transition-colors",
                    idFile ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  )}>
                    {uploadingId ? <Loader2 className="w-5 h-5 animate-spin text-primary" /> : <Upload className="w-5 h-5 text-muted-foreground" />}
                    <span className="text-sm text-muted-foreground">
                      {idFile ? idFile.name : 'Tap to upload image or PDF'}
                    </span>
                    <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleIdUpload} />
                  </label>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={form.id_confirmed}
                  onCheckedChange={v => update('id_confirmed', !!v)}
                  className="mt-0.5"
                />
                <Label className="text-sm leading-tight cursor-pointer" onClick={() => update('id_confirmed', !form.id_confirmed)}>
                  I confirm the ID uploaded is current and belongs to me *
                </Label>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleBack} className="flex-1 rounded-xl gap-1">
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
              <Button onClick={handleNext} className="flex-1 bg-primary text-primary-foreground font-bold rounded-xl">
                Next →
              </Button>
            </div>
          </div>
        )}

        {/* Section 4: Availability */}
        {currentStep === 4 && (
          <div className="bg-card rounded-2xl shadow-md p-5 space-y-4">
            <h2 className="text-base font-bold text-primary">4. Your Availability</h2>
            <div className="space-y-3">
              <div>
                <Label className="text-sm mb-2 block">Available Days *</Label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map(day => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-sm font-semibold transition-colors border",
                        form.available_days.includes(day)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-card text-muted-foreground border-border hover:border-primary/50"
                      )}
                    >
                      {day.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-sm">Preferred Start Time *</Label>
                <Select value={form.preferred_start_time} onValueChange={v => update('preferred_start_time', v)}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {START_TIMES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Maximum Jobs Per Day *</Label>
                <Select value={form.max_jobs_per_day} onValueChange={v => update('max_jobs_per_day', v)}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {MAX_JOBS.map(j => <SelectItem key={j} value={j}>{j}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm">Any recurring unavailability or notes</Label>
                <Textarea
                  value={form.availability_notes}
                  onChange={e => update('availability_notes', e.target.value)}
                  placeholder="e.g. I pick up kids at 3pm on Wednesdays"
                  rows={3}
                />
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={handleBack} className="flex-1 rounded-xl gap-1">
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
              <Button onClick={handleNext} className="flex-1 bg-primary text-primary-foreground font-bold rounded-xl">
                Next →
              </Button>
            </div>
          </div>
        )}

        {/* Section 5: WhatsApp + Policy Acknowledgements */}
        {currentStep === 5 && (
          <div className="bg-card rounded-2xl shadow-md p-5 space-y-4">
            <h2 className="text-base font-bold text-primary">5. WhatsApp + Policy Acknowledgements</h2>

            <div className="space-y-4">
              <div>
                <Label className="text-sm mb-2 block">Have you added the Brightly WhatsApp group?</Label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => update('has_whatsapp', true)}
                    className={cn(
                      "flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors",
                      form.has_whatsapp ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"
                    )}
                  >Yes</button>
                  <button
                    type="button"
                    onClick={() => update('has_whatsapp', false)}
                    className={cn(
                      "flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors",
                      !form.has_whatsapp ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"
                    )}
                  >Not yet — I'll wait for the link</button>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-border space-y-3">
              <h3 className="text-sm font-bold text-foreground">Policy Acknowledgements</h3>
              <p className="text-xs text-muted-foreground">All must be checked before you can submit.</p>
              {POLICIES.map((policy, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Checkbox
                    checked={form.policy_acks[i]}
                    onCheckedChange={() => togglePolicy(i)}
                    className="mt-0.5"
                  />
                  <p
                    className="text-sm text-foreground leading-tight cursor-pointer"
                    onClick={() => togglePolicy(i)}
                  >
                    {policy}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={handleBack} className="flex-1 rounded-xl gap-1">
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting || !form.policy_acks.every(Boolean)}
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 font-bold rounded-xl gap-2"
              >
                {submitting && <Loader2 className="w-5 h-5 animate-spin" />}
                Complete Onboarding
              </Button>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground pb-6">
          Your information is stored securely and only accessible by Brightly management.
        </p>
      </div>
    </div>
  );
}
