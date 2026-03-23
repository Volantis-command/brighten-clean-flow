import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, CheckCircle2, Sparkles } from 'lucide-react';
import { QuotePhotoUpload } from '@/components/quote/QuotePhotoUpload';
import { toast } from 'sonner';

const PROPERTY_TYPES = ['House', 'Apartment', 'Townhouse', 'Other'];
const CLEAN_TYPES = ['Standard Clean', 'Deep Clean', 'End of Lease', 'Post-Build Clean'];
const SIZES = [
  { value: 'small', label: 'Small (<100m²)' },
  { value: 'medium', label: 'Medium (100–200m²)' },
  { value: 'large', label: 'Large (200–300m²)' },
  { value: 'xl', label: 'Extra Large (300m²+)' },
];
const REFERRALS = ['Google', 'Referral', 'Social Media', 'Flyer', 'Other'];

export default function QuoteRequestFormPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [propertyType, setPropertyType] = useState('House');
  const [bedrooms, setBedrooms] = useState(2);
  const [bathrooms, setBathrooms] = useState(1);
  const [toilets, setToilets] = useState(1);
  const [hasGarage, setHasGarage] = useState(false);
  const [propertySize, setPropertySize] = useState('medium');
  const [cleanType, setCleanType] = useState('Standard Clean');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('Flexible');
  const [isOccupied, setIsOccupied] = useState(true);
  const [extraNotes, setExtraNotes] = useState('');
  const [referralSource, setReferralSource] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [photos, setPhotos] = useState<{ url: string; label: string }[]>([]);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('quote_requests')
        .select('*')
        .eq('token', token)
        .single();
      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      if (data.status !== 'pending_form') {
        setSubmitted(true);
        setFirstName(data.first_name || '');
      }
      setFirstName(data.first_name || '');
      setPhone(data.phone || '');
      setLoading(false);

      const { data: settings } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'company_phone')
        .single();
      if (settings?.value) setCompanyPhone(settings.value);
    }
    load();
  }, [token]);

  const handleSubmit = async () => {
    if (!firstName || !address || !cleanType) {
      toast.error('Please fill in all required fields');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('quote_requests')
        .update({
          first_name: firstName,
          last_name: lastName,
          email: email || null,
          address,
          property_type: propertyType,
          bedrooms,
          bathrooms,
          toilets,
          has_garage: hasGarage,
          property_size: propertySize,
          clean_type: cleanType,
          preferred_date: preferredDate || null,
          preferred_time: preferredTime,
          is_occupied: isOccupied,
          extra_notes: extraNotes || null,
          referral_source: referralSource || null,
          status: 'form_submitted',
          form_submitted_at: new Date().toISOString(),
        })
        .eq('token', token);
      if (error) throw error;

      // Notify admin via edge function
      try {
        await supabase.functions.invoke('send-quote-notification', {
          body: { token, first_name: firstName, last_name: lastName, bedrooms, bathrooms, clean_type: cleanType, address },
        });
      } catch { /* non-blocking */ }

      setSubmitted(true);
    } catch (e: any) {
      toast.error(e.message || 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8f9fa]">
      <Loader2 className="w-8 h-8 animate-spin text-[#0C463D]" />
    </div>
  );

  if (notFound) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8f9fa] p-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-[#0C463D] mb-2">Link Not Found</h1>
        <p className="text-gray-600">This quote request link is invalid or has expired.</p>
      </div>
    </div>
  );

  if (submitted) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8f9fa] p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center space-y-4">
        <CheckCircle2 className="w-16 h-16 text-[#0C463D] mx-auto" />
        <h1 className="text-2xl font-bold text-[#0C463D]">Thanks {firstName}!</h1>
        <p className="text-gray-600">We'll text you a quote shortly.</p>
        {companyPhone && <p className="text-gray-500 text-sm">Questions? Call us on {companyPhone}</p>}
        <p className="text-xs text-gray-400 mt-6">Powered by Brightly</p>
      </div>
    </div>
  );

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 bg-[#0C463D] text-white px-4 py-2 rounded-full text-sm font-bold">
            <Sparkles className="w-4 h-4 text-[#FEDB00]" /> Brightly Cleaning
          </div>
          <h1 className="text-2xl font-extrabold text-[#0C463D]">Get Your Cleaning Quote</h1>
          <p className="text-gray-500 text-sm">Fill this in and we'll text you a price within the hour.</p>
        </div>

        {/* Section 1 — About You */}
        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          <h2 className="font-bold text-[#0C463D] text-lg">About You</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold">First name *</Label>
              <Input value={firstName} onChange={e => setFirstName(e.target.value)} className="h-12 rounded-xl" />
            </div>
            <div>
              <Label className="text-xs font-semibold">Last name</Label>
              <Input value={lastName} onChange={e => setLastName(e.target.value)} className="h-12 rounded-xl" />
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold">Mobile number</Label>
            <Input value={phone} readOnly className="h-12 rounded-xl bg-muted" />
          </div>
          <div>
            <Label className="text-xs font-semibold">Email (optional)</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="h-12 rounded-xl" />
          </div>
        </div>

        {/* Section 2 — Property */}
        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          <h2 className="font-bold text-[#0C463D] text-lg">Your Property</h2>
          <div>
            <Label className="text-xs font-semibold">Full address *</Label>
            <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St, Suburb" className="h-12 rounded-xl" />
          </div>
          <div>
            <Label className="text-xs font-semibold">Property type</Label>
            <Select value={propertyType} onValueChange={setPropertyType}>
              <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROPERTY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs font-semibold">Bedrooms</Label>
              <Select value={String(bedrooms)} onValueChange={v => setBedrooms(Number(v))}>
                <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{[1,2,3,4,5,6].map(n => <SelectItem key={n} value={String(n)}>{n}{n===6?'+':''}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Bathrooms</Label>
              <Select value={String(bathrooms)} onValueChange={v => setBathrooms(Number(v))}>
                <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{[1,2,3,4].map(n => <SelectItem key={n} value={String(n)}>{n}{n===4?'+':''}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Toilets</Label>
              <Select value={String(toilets)} onValueChange={v => setToilets(Number(v))}>
                <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{[1,2,3,4].map(n => <SelectItem key={n} value={String(n)}>{n}{n===4?'+':''}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={hasGarage} onCheckedChange={setHasGarage} />
            <Label className="text-sm font-semibold">Has a garage?</Label>
          </div>
          <div>
            <Label className="text-xs font-semibold">Approximate home size</Label>
            <Select value={propertySize} onValueChange={setPropertySize}>
              <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>{SIZES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        {/* Section 3 — The Clean */}
        <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
          <h2 className="font-bold text-[#0C463D] text-lg">The Clean</h2>
          <div>
            <Label className="text-xs font-semibold">Type of clean *</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {CLEAN_TYPES.map(ct => (
                <button key={ct} type="button" onClick={() => setCleanType(ct)}
                  className={`px-3 py-3 rounded-xl text-sm font-bold transition-all border-2 ${cleanType === ct ? 'border-[#0C463D] bg-[#0C463D] text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'}`}>
                  {ct}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold">When do you need it?</Label>
            <Input type="date" min={today} value={preferredDate} onChange={e => setPreferredDate(e.target.value)} className="h-12 rounded-xl" />
          </div>
          <div>
            <Label className="text-xs font-semibold">Preferred time</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {['Morning (7am–12pm)', 'Afternoon (12pm–5pm)', 'Flexible'].map(t => (
                <button key={t} type="button" onClick={() => setPreferredTime(t)}
                  className={`px-2 py-3 rounded-xl text-xs font-bold transition-all border-2 ${preferredTime === t ? 'border-[#0C463D] bg-[#0C463D] text-white' : 'border-gray-200 bg-white text-gray-700'}`}>
                  {t.replace(' (7am–12pm)', '').replace(' (12pm–5pm)', '')}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={isOccupied} onCheckedChange={setIsOccupied} />
            <Label className="text-sm font-semibold">Property is currently occupied</Label>
          </div>
          <div>
            <Label className="text-xs font-semibold">Areas needing extra attention (optional)</Label>
            <Textarea value={extraNotes} onChange={e => setExtraNotes(e.target.value)} className="rounded-xl min-h-[80px]" placeholder="E.g. oven needs deep cleaning, stained grout..." />
          </div>
          <div>
            <Label className="text-xs font-semibold">How did you hear about us?</Label>
            <Select value={referralSource} onValueChange={setReferralSource}>
              <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>{REFERRALS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        {/* Note */}
        <div className="bg-[#FEDB00]/20 rounded-2xl p-4 text-center">
          <p className="text-sm font-semibold text-[#0C463D]">
            💡 We'll text you a firm quote within 1 hour based on your details.
          </p>
          <p className="text-xs text-gray-500 mt-1">No linen or consumables — this is an hourly-rate clean.</p>
        </div>

        <Button onClick={handleSubmit} disabled={submitting} className="w-full h-14 rounded-2xl text-lg font-bold bg-[#0C463D] hover:bg-[#0C463D]/90 text-white">
          {submitting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
          Request My Quote →
        </Button>

        <p className="text-center text-xs text-gray-400 pb-4">Powered by Brightly</p>
      </div>
    </div>
  );
}
