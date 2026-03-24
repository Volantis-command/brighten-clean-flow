import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface OnboardingData {
  full_name: string;
  preferred_name: string;
  phone: string;
  email: string;
  address: string;
  date_of_birth: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
  tfn: string;
  super_fund_name: string;
  super_member_number: string;
  abn: string;
  is_contractor: boolean;
  bank_bsb: string;
  bank_account_number: string;
  bank_account_name: string;
}

const initial: OnboardingData = {
  full_name: '', preferred_name: '', phone: '', email: '', address: '',
  date_of_birth: '', emergency_contact_name: '', emergency_contact_phone: '',
  emergency_contact_relationship: '', tfn: '', super_fund_name: '',
  super_member_number: '', abn: '', is_contractor: false,
  bank_bsb: '', bank_account_number: '', bank_account_name: '',
};

export default function StaffOnboardingPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [form, setForm] = useState<OnboardingData>(initial);
  const [recordId, setRecordId] = useState<string>('');

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return; }
    supabase
      .from('staff_onboarding')
      .select('*')
      .eq('onboarding_token', token)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) { setNotFound(true); setLoading(false); return; }
        if (data.submitted_at) { setAlreadySubmitted(true); setLoading(false); return; }
        setRecordId(data.id);
        setForm({
          full_name: data.full_name || '',
          preferred_name: (data as any).preferred_name || '',
          phone: data.phone || '',
          email: data.email || '',
          address: (data as any).address || '',
          date_of_birth: (data as any).date_of_birth || '',
          emergency_contact_name: (data as any).emergency_contact_name || '',
          emergency_contact_phone: (data as any).emergency_contact_phone || '',
          emergency_contact_relationship: (data as any).emergency_contact_relationship || '',
          tfn: (data as any).tfn || '',
          super_fund_name: (data as any).super_fund_name || '',
          super_member_number: (data as any).super_member_number || '',
          abn: (data as any).abn || '',
          is_contractor: (data as any).is_contractor || false,
          bank_bsb: (data as any).bank_bsb || '',
          bank_account_number: (data as any).bank_account_number || '',
          bank_account_name: (data as any).bank_account_name || '',
        });
        setLoading(false);
      });
  }, [token]);

  const update = (key: keyof OnboardingData, value: string | boolean) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!form.full_name || !form.phone || !form.email) {
      toast.error('Please fill in all required fields (Name, Phone, Email)');
      return;
    }
    setSubmitting(true);
    const { error } = await supabase
      .from('staff_onboarding')
      .update({
        ...form,
        submitted_at: new Date().toISOString(),
        status: 'submitted',
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', recordId);

    if (error) {
      toast.error('Failed to submit: ' + error.message);
      setSubmitting(false);
      return;
    }

    // Create a notification for admins
    const { data: admins } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');

    if (admins) {
      const notifications = admins.map(a => ({
        user_id: a.user_id,
        title: 'Staff Onboarding Submitted',
        message: `${form.full_name} has completed their onboarding form. Review their details and update HR settings.`,
        type: 'staff_onboarding',
        link: '/staff',
      }));
      await supabase.from('notifications').insert(notifications);
    }

    setSubmitted(true);
    setSubmitting(false);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F0]">
      <Loader2 className="w-8 h-8 animate-spin text-[#0C463D]" />
    </div>
  );

  if (notFound) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F0] p-6">
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-md">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold mb-2">Link Not Found</h1>
        <p className="text-gray-500">This onboarding link is invalid or has expired.</p>
      </div>
    </div>
  );

  if (alreadySubmitted) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F0] p-6">
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-md">
        <CheckCircle2 className="w-12 h-12 text-[#0C463D] mx-auto mb-4" />
        <h1 className="text-xl font-bold mb-2">Already Submitted</h1>
        <p className="text-gray-500">Your onboarding form has already been submitted. Contact your manager if you need to make changes.</p>
      </div>
    </div>
  );

  if (submitted) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F0] p-6">
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-md">
        <CheckCircle2 className="w-12 h-12 text-[#0C463D] mx-auto mb-4" />
        <h1 className="text-xl font-bold mb-2">Thank You!</h1>
        <p className="text-gray-500">Your details have been submitted successfully. Your admin will review and set up your account shortly.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F5F5F0] py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-extrabold text-[#0C463D]">Staff Onboarding</h1>
          <p className="text-gray-500 mt-1">Please fill out your details below. Fields marked * are required.</p>
        </div>

        {/* Personal Details */}
        <div className="bg-white rounded-2xl shadow-md p-6 space-y-4">
          <h2 className="text-lg font-bold text-[#0C463D]">Personal Details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Full Name *</Label>
              <Input value={form.full_name} onChange={e => update('full_name', e.target.value)} placeholder="Jane Doe" />
            </div>
            <div>
              <Label>Preferred Name</Label>
              <Input value={form.preferred_name} onChange={e => update('preferred_name', e.target.value)} placeholder="Jane" />
            </div>
            <div>
              <Label>Email *</Label>
              <Input type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="jane@email.com" />
            </div>
            <div>
              <Label>Phone *</Label>
              <Input value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="0412 345 678" />
            </div>
            <div className="sm:col-span-2">
              <Label>Home Address</Label>
              <Input value={form.address} onChange={e => update('address', e.target.value)} placeholder="123 Main St, Suburb VIC 3000" />
            </div>
            <div>
              <Label>Date of Birth</Label>
              <Input type="date" value={form.date_of_birth} onChange={e => update('date_of_birth', e.target.value)} />
            </div>
          </div>

          <h3 className="text-sm font-semibold text-gray-700 pt-2">Emergency Contact</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label>Name</Label>
              <Input value={form.emergency_contact_name} onChange={e => update('emergency_contact_name', e.target.value)} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.emergency_contact_phone} onChange={e => update('emergency_contact_phone', e.target.value)} />
            </div>
            <div>
              <Label>Relationship</Label>
              <Input value={form.emergency_contact_relationship} onChange={e => update('emergency_contact_relationship', e.target.value)} placeholder="Partner, Parent, etc." />
            </div>
          </div>
        </div>

        {/* Tax & Super */}
        <div className="bg-white rounded-2xl shadow-md p-6 space-y-4">
          <h2 className="text-lg font-bold text-[#0C463D]">Tax & Superannuation</h2>
          
          <div className="flex items-center gap-3">
            <Switch checked={form.is_contractor} onCheckedChange={v => update('is_contractor', v)} />
            <Label>I am a contractor (ABN)</Label>
          </div>

          {form.is_contractor ? (
            <div>
              <Label>ABN</Label>
              <Input value={form.abn} onChange={e => update('abn', e.target.value)} placeholder="12 345 678 901" />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Tax File Number (TFN)</Label>
                <Input value={form.tfn} onChange={e => update('tfn', e.target.value)} placeholder="123 456 789" />
              </div>
              <div>
                <Label>Super Fund Name</Label>
                <Input value={form.super_fund_name} onChange={e => update('super_fund_name', e.target.value)} placeholder="Australian Super" />
              </div>
              <div>
                <Label>Super Member Number</Label>
                <Input value={form.super_member_number} onChange={e => update('super_member_number', e.target.value)} />
              </div>
            </div>
          )}
        </div>

        {/* Bank Details */}
        <div className="bg-white rounded-2xl shadow-md p-6 space-y-4">
          <h2 className="text-lg font-bold text-[#0C463D]">Bank Details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>BSB</Label>
              <Input value={form.bank_bsb} onChange={e => update('bank_bsb', e.target.value)} placeholder="062-000" />
            </div>
            <div>
              <Label>Account Number</Label>
              <Input value={form.bank_account_number} onChange={e => update('bank_account_number', e.target.value)} placeholder="1234 5678" />
            </div>
            <div className="sm:col-span-2">
              <Label>Account Name</Label>
              <Input value={form.bank_account_name} onChange={e => update('bank_account_name', e.target.value)} placeholder="Jane Doe" />
            </div>
          </div>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full bg-[#0C463D] text-white hover:bg-[#0C463D]/90 font-bold rounded-xl h-12 text-base gap-2"
        >
          {submitting && <Loader2 className="w-5 h-5 animate-spin" />}
          Submit My Details
        </Button>

        <p className="text-center text-xs text-gray-400">
          Your information is stored securely and only accessible by your admin team.
        </p>
      </div>
    </div>
  );
}
