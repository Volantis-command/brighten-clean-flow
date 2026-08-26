/* eslint-disable @typescript-eslint/no-explicit-any -- The self-service RPC and canonical onboarding fields are newer than the generated client types. */
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import DeleteAccountButton from '@/components/DeleteAccountButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Bot,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  ExternalLink,
  FileText,
  Loader2,
  LogOut,
  Save,
  ShieldCheck,
  Sparkles,
  Star,
  UserRound,
  CalendarClock,
} from 'lucide-react';
import { toast } from 'sonner';
import { DAYS_OF_WEEK } from '@/lib/staffOnboarding';
import { SOP_DOCUMENTS } from '@/lib/sopLibrary';

type EditableDetails = {
  phone: string;
  address: string;
  suburb: string;
  postcode: string;
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelationship: string;
  availableDays: string[];
  availabilityNotes: string;
};

const EMPTY_DETAILS: EditableDetails = {
  phone: '',
  address: '',
  suburb: '',
  postcode: '',
  emergencyName: '',
  emergencyPhone: '',
  emergencyRelationship: '',
  availableDays: [],
  availabilityNotes: '',
};

function normaliseDays(value: unknown) {
  if (Array.isArray(value)) {
    return DAYS_OF_WEEK.filter((day) => value.some((saved) => String(saved).toLowerCase().slice(0, 3) === day.toLowerCase().slice(0, 3)));
  }
  if (value && typeof value === 'object') {
    return DAYS_OF_WEEK.filter((day) => {
      const shifts = (value as Record<string, unknown>)[day.toLowerCase().slice(0, 3)];
      return Array.isArray(shifts) && shifts.length > 0;
    });
  }
  return [];
}

export default function CleanerProfilePage() {
  const { profile, user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [details, setDetails] = useState<EditableDetails>(EMPTY_DETAILS);
  const [saving, setSaving] = useState(false);
  const userId = user?.id;

  const { data: onboarding, isLoading } = useQuery({
    queryKey: ['my-staff-hub', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_onboarding' as any)
        .select('phone, address, residential_suburb, postcode, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, available_days, availability_notes, submitted_at, director_approved, deployment_status')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  useEffect(() => {
    if (!profile && !onboarding) return;
    setDetails({
      phone: onboarding?.phone || (profile as any)?.phone || '',
      address: onboarding?.address || '',
      suburb: onboarding?.residential_suburb || '',
      postcode: onboarding?.postcode || '',
      emergencyName: onboarding?.emergency_contact_name || '',
      emergencyPhone: onboarding?.emergency_contact_phone || '',
      emergencyRelationship: onboarding?.emergency_contact_relationship || '',
      availableDays: normaliseDays(onboarding?.available_days ?? (profile as any)?.weekly_availability),
      availabilityNotes: onboarding?.availability_notes || '',
    });
  }, [onboarding, profile]);

  const { data: avgRating } = useQuery({
    queryKey: ['cleaner-avg-rating', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: jobs } = await supabase
        .from('jobs')
        .select('feedback_score')
        .or(`cleaner_1_id.eq.${userId},cleaner_2_id.eq.${userId}`)
        .not('feedback_score', 'is', null);
      const scores = (jobs || []).map((job) => job.feedback_score || 0).filter(Boolean);
      return scores.length ? (scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1) : null;
    },
  });

  const groupedSops = useMemo(() => {
    return SOP_DOCUMENTS.reduce<Record<string, typeof SOP_DOCUMENTS>>((groups, document) => {
      (groups[document.category] ||= []).push(document);
      return groups;
    }, {});
  }, []);

  const setField = <K extends keyof EditableDetails>(key: K, value: EditableDetails[K]) => {
    setDetails((current) => ({ ...current, [key]: value }));
  };

  const toggleDay = (day: string) => {
    setField('availableDays', details.availableDays.includes(day)
      ? details.availableDays.filter((saved) => saved !== day)
      : [...details.availableDays, day]);
  };

  const saveDetails = async () => {
    if (details.availableDays.length === 0) {
      toast.error('Select at least one day you are normally available.');
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).rpc('update_own_staff_details', {
      p_phone: details.phone,
      p_address: details.address,
      p_suburb: details.suburb,
      p_postcode: details.postcode,
      p_emergency_name: details.emergencyName,
      p_emergency_phone: details.emergencyPhone,
      p_emergency_relationship: details.emergencyRelationship,
      p_available_days: details.availableDays,
      p_availability_notes: details.availabilityNotes,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['my-staff-hub', userId] });
    await queryClient.invalidateQueries({ queryKey: ['all-cleaner-availability'] });
    toast.success('Your details and availability have been updated.');
  };

  const displayRole = role === 'head_cleaner' ? 'Head Cleaner' : 'Cleaner';

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <section className="overflow-hidden rounded-3xl border border-primary/20 bg-card shadow-sm">
        <div className="bg-gradient-to-br from-[#0C463D] via-[#126B5C] to-[#4A8B65] p-6 text-white sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-2xl font-extrabold ring-1 ring-white/20">
                {(profile?.full_name || '?')[0].toUpperCase()}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-100">My Brightly Hub</p>
                <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">{profile?.full_name || 'Brightly team member'}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold">
                  <span className="rounded-full bg-white/15 px-3 py-1">{displayRole}</span>
                  {avgRating && <span className="inline-flex items-center gap-1 rounded-full bg-[#FEDB00] px-3 py-1 text-[#0C463D]"><Star className="h-3 w-3 fill-current" /> {avgRating} average</span>}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={() => navigate('/my-score')} className="rounded-xl"><Sparkles className="mr-2 h-4 w-4" />My score</Button>
              <Button type="button" variant="secondary" onClick={() => navigate('/my-pay')} className="rounded-xl"><CircleDollarSign className="mr-2 h-4 w-4" />My pay</Button>
            </div>
          </div>
        </div>
      </section>

      {/* Availability sits above everything else on purpose. It is the one thing
          a cleaner must keep current, because clients are only offered times
          somebody is actually free for. */}
      <button
        onClick={() => navigate('/availability')}
        className="mb-5 flex w-full items-center gap-4 rounded-3xl border bg-card p-5 text-left shadow-sm transition-colors hover:border-primary sm:p-6"
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
          <CalendarClock className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold text-foreground">My availability</p>
          <p className="text-sm text-muted-foreground">
            Set the days and hours you can work, and mark any day you are off. Clients can only book times you are free.
          </p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      </button>

      <Tabs defaultValue="details" className="space-y-5">
        <TabsList className="grid h-auto grid-cols-2 gap-1 rounded-2xl bg-muted p-1 sm:grid-cols-4">
          <TabsTrigger value="details" className="min-h-11 rounded-xl gap-2"><UserRound className="h-4 w-4" />Details</TabsTrigger>
          <TabsTrigger value="availability" className="min-h-11 rounded-xl gap-2"><CalendarDays className="h-4 w-4" />Availability</TabsTrigger>
          <TabsTrigger value="sops" className="min-h-11 rounded-xl gap-2"><FileText className="h-4 w-4" />SOP Library</TabsTrigger>
          <TabsTrigger value="assistant" className="min-h-11 rounded-xl gap-2"><Bot className="h-4 w-4" />Ask Brightly</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-0">
          <section className="space-y-5 rounded-3xl border bg-card p-5 shadow-sm sm:p-7">
            <div><h2 className="text-xl font-extrabold">My details</h2><p className="mt-1 text-sm text-muted-foreground">Keep these current so Brightly can contact and support you.</p></div>
            {isLoading ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : (
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-1.5"><Label>Email</Label><Input value={profile?.email || ''} disabled className="h-12 rounded-xl" /><p className="text-xs text-muted-foreground">Ask an admin to change your login email.</p></div>
                <div className="space-y-1.5"><Label>Phone</Label><Input inputMode="tel" value={details.phone} onChange={(event) => setField('phone', event.target.value)} className="h-12 rounded-xl" /></div>
                <div className="space-y-1.5 sm:col-span-2"><Label>Home address</Label><Input value={details.address} onChange={(event) => setField('address', event.target.value)} className="h-12 rounded-xl" /></div>
                <div className="space-y-1.5"><Label>Suburb</Label><Input value={details.suburb} onChange={(event) => setField('suburb', event.target.value)} className="h-12 rounded-xl" /></div>
                <div className="space-y-1.5"><Label>Postcode</Label><Input inputMode="numeric" maxLength={4} value={details.postcode} onChange={(event) => setField('postcode', event.target.value.replace(/\D/g, '').slice(0, 4))} className="h-12 rounded-xl" /></div>
                <div className="space-y-1.5"><Label>Emergency contact</Label><Input value={details.emergencyName} onChange={(event) => setField('emergencyName', event.target.value)} className="h-12 rounded-xl" /></div>
                <div className="space-y-1.5"><Label>Emergency contact phone</Label><Input inputMode="tel" value={details.emergencyPhone} onChange={(event) => setField('emergencyPhone', event.target.value)} className="h-12 rounded-xl" /></div>
                <div className="space-y-1.5 sm:col-span-2"><Label>Relationship</Label><Input value={details.emergencyRelationship} onChange={(event) => setField('emergencyRelationship', event.target.value)} className="h-12 rounded-xl" /></div>
              </div>
            )}
            <Button onClick={saveDetails} disabled={saving || isLoading} size="lg" className="w-full rounded-xl sm:w-auto"><Save className="mr-2 h-4 w-4" />{saving ? 'Saving…' : 'Save my details'}</Button>
          </section>
        </TabsContent>

        <TabsContent value="availability" className="mt-0">
          <section className="space-y-6 rounded-3xl border bg-card p-5 shadow-sm sm:p-7">
            <div><h2 className="text-xl font-extrabold">When I can work</h2><p className="mt-1 text-sm text-muted-foreground">These recurring days control who can be selected when a clean is booked. Admin overrides are separately recorded.</p></div>
            <div>
              <Label>Usual available days</Label>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {DAYS_OF_WEEK.map((day) => (
                  <button type="button" key={day} onClick={() => toggleDay(day)} className={`min-h-12 rounded-xl border px-3 text-sm font-bold transition-colors ${details.availableDays.includes(day) ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground'}`}>
                    {day.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5"><Label>Recurring limits or notes</Label><Textarea value={details.availabilityNotes} onChange={(event) => setField('availabilityNotes', event.target.value)} placeholder="For example: school pickup at 3pm on Wednesdays" className="min-h-24 rounded-xl" /></div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button onClick={saveDetails} disabled={saving} size="lg" className="rounded-xl"><Save className="mr-2 h-4 w-4" />{saving ? 'Saving…' : 'Save availability'}</Button>
              <Button variant="outline" size="lg" onClick={() => navigate('/availability')} className="rounded-xl">Block specific dates <ChevronRight className="ml-2 h-4 w-4" /></Button>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="sops" className="mt-0 space-y-5">
          <div className="rounded-3xl border border-primary/20 bg-primary/5 p-5 sm:p-6"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-6 w-6 text-primary" /><div><h2 className="text-xl font-extrabold">Brightly SOP Library</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">The current controlled PDFs are always here. Open the document that applies before guessing or improvising on a clean.</p></div></div></div>
          {Object.entries(groupedSops).map(([category, documents]) => (
            <section key={category} className="rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
              <h3 className="font-extrabold text-primary">{category}</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {documents.map((document) => (
                  <a key={document.code} href={document.pdfUrl} target="_blank" rel="noreferrer" className="group flex min-h-24 items-center justify-between gap-4 rounded-2xl border bg-background p-4 transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-sm">
                    <span><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{document.code} · PDF</span><span className="mt-1 block text-sm font-bold leading-5">{document.title}</span></span>
                    <ExternalLink className="h-5 w-5 shrink-0 text-primary transition-transform group-hover:scale-110" />
                  </a>
                ))}
              </div>
            </section>
          ))}
        </TabsContent>

        <TabsContent value="assistant" className="mt-0">
          <section className="overflow-hidden rounded-3xl border border-primary/20 bg-card shadow-sm">
            <div className="bg-gradient-to-br from-[#0C463D] to-[#4A8B65] p-7 text-white sm:p-10">
              <Bot className="h-10 w-10 text-[#FEDB00]" />
              <h2 className="mt-5 text-2xl font-extrabold">Ask Brightly before you guess.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50">Get an instant answer grounded in the Brightly SOP library—linen, chemicals, room standards, photos, incidents, scheduling and what to do when something goes wrong.</p>
              <Button size="lg" variant="secondary" onClick={() => navigate('/ai-assistant')} className="mt-6 rounded-xl bg-[#FEDB00] font-extrabold text-[#0C463D] hover:bg-[#FFE95C]">Open Ask Brightly <ChevronRight className="ml-2 h-4 w-4" /></Button>
            </div>
          </section>
        </TabsContent>
      </Tabs>

      {!onboarding?.submitted_at && role === 'cleaner' && (
        <button onClick={() => navigate('/cleaner-onboarding')} className="w-full rounded-2xl border-2 border-accent bg-accent/10 p-4 text-left"><span className="font-bold">Complete your onboarding</span><span className="mt-1 block text-xs text-muted-foreground">Required before solo deployment.</span></button>
      )}

      <Button variant="outline" size="lg" onClick={signOut} className="w-full rounded-2xl"><LogOut className="mr-2 h-5 w-5" />Sign out</Button>

      {/* Account deletion — required in-app by the App Store. */}
      <div className="pt-2 flex justify-center">
        <DeleteAccountButton redirectTo="/login" />
      </div>
    </div>
  );
}
