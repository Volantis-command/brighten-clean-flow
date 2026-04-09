import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, CheckCircle } from 'lucide-react';

export default function EnquiryPage() {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [suburb, setSuburb] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [referralSource, setReferralSource] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName || !lastName || !phone || !email || !address || !suburb || !serviceType) {
      toast.error('Please fill in all required fields.');
      return;
    }
    setSubmitting(true);
    try {
      // Insert lead and return the id
      const { data: leadData, error: leadError } = await supabase
        .from('leads')
        .insert({
          first_name: firstName,
          last_name: lastName,
          phone,
          email,
          address,
          suburb,
          service_type: serviceType,
          bedrooms: bedrooms || null,
          bathrooms: bathrooms || null,
          preferred_time: preferredTime || null,
          referral_source: referralSource || null,
          notes: notes || null,
        })
        .select('id')
        .single();

      if (leadError) {
        console.error('Lead insert error:', leadError);
        throw leadError;
      }

      console.log('Lead created successfully:', leadData?.id);

      // Note: Admin notifications are handled by the Actions Inbox
      // which polls the leads table directly. No need for anon to
      // insert into notifications (would fail due to RLS).

      setSubmitted(true);
      toast.success(`Thanks ${firstName}! We'll be in touch within 24 hours.`);
    } catch (err: any) {
      console.error('Enquiry submission failed:', err);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#f8f9fa]">
        <header className="bg-[#0C463D] px-4 py-4 flex items-center justify-center">
          <h1 className="text-2xl font-extrabold text-white tracking-tight" style={{ fontFamily: 'Nunito, sans-serif' }}>
            Brightly<span className="text-accent">.</span>
          </h1>
        </header>
        <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
          <CheckCircle className="h-16 w-16 text-brightly mb-4" />
          <h2 className="text-2xl font-bold mb-2">Thanks {firstName}!</h2>
          <p className="text-muted-foreground max-w-md">
            We'll be in touch within 24 hours with your quote.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <header className="bg-[#0C463D] px-4 py-4 flex items-center justify-center">
        <h1 className="text-2xl font-extrabold text-white tracking-tight" style={{ fontFamily: 'Nunito, sans-serif' }}>
          Brightly<span className="text-accent">.</span>
        </h1>
      </header>

      <div className="max-w-lg mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold mb-1">Get a Free Quote</h2>
        <p className="text-muted-foreground mb-6">Fill out the form below and we'll get back to you within 24 hours.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="firstName">First Name *</Label>
              <Input id="firstName" value={firstName} onChange={e => setFirstName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="lastName">Last Name *</Label>
              <Input id="lastName" value={lastName} onChange={e => setLastName(e.target.value)} required />
            </div>
          </div>

          <div>
            <Label htmlFor="phone">Mobile Number *</Label>
            <Input id="phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} required />
          </div>

          <div>
            <Label htmlFor="email">Email *</Label>
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>

          <div>
            <Label htmlFor="address">Service Address *</Label>
            <Input id="address" value={address} onChange={e => setAddress(e.target.value)} required />
          </div>

          <div>
            <Label htmlFor="suburb">Suburb *</Label>
            <Input id="suburb" value={suburb} onChange={e => setSuburb(e.target.value)} required />
          </div>

          <div>
            <Label>Service Type *</Label>
            <RadioGroup value={serviceType} onValueChange={setServiceType} className="flex gap-4 mt-1">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="House Clean" id="house" />
                <Label htmlFor="house" className="font-normal cursor-pointer">House Clean</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="Airbnb Clean" id="airbnb" />
                <Label htmlFor="airbnb" className="font-normal cursor-pointer">Airbnb Clean</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Bedrooms</Label>
              <Select value={bedrooms} onValueChange={setBedrooms}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {['1','2','3','4','5','6+'].map(v => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Bathrooms</Label>
              <Select value={bathrooms} onValueChange={setBathrooms}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {['1','2','3','4+'].map(v => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="preferredTime">Preferred Day/Time</Label>
            <Input id="preferredTime" placeholder="e.g. Wednesday mornings" value={preferredTime} onChange={e => setPreferredTime(e.target.value)} />
          </div>

          <div>
            <Label>How did you hear about us?</Label>
            <Select value={referralSource} onValueChange={setReferralSource}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {['Google','Instagram','Facebook','Referral','Other'].map(v => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="notes">Message / Notes</Label>
            <Textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</> : 'Submit Enquiry'}
          </Button>
        </form>
      </div>
    </div>
  );
}
