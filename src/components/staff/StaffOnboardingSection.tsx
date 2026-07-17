/* eslint-disable @typescript-eslint/no-explicit-any, react-refresh/only-export-components -- JSON training records and exported query hooks intentionally share this module. */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ClipboardList, GraduationCap, Loader2, Save, ShieldCheck } from 'lucide-react';
import { differenceInDays, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { isRequirementComplete, PRESTART_REQUIREMENTS } from '@/lib/staffOnboarding';

interface Props { staffId: string; staffName: string }
type TrainingRecord = Record<string, any>;

function TrainingClean({ number, value, onChange }: { number: 1 | 2; value: Record<string, any>; onChange: (next: Record<string, any>) => void }) {
  return <div className="rounded-2xl border p-4"><h4 className="font-bold">Shadow Clean {number}</h4><div className="mt-4 grid gap-4 sm:grid-cols-2">
    <div><Label className="text-xs">Date</Label><Input type="date" className="mt-1 h-10 rounded-xl" value={value.date || ''} onChange={(e) => onChange({ ...value, date: e.target.value })} /></div>
    <div><Label className="text-xs">Supervisor</Label><Input className="mt-1 h-10 rounded-xl" value={value.supervisor || ''} onChange={(e) => onChange({ ...value, supervisor: e.target.value })} /></div>
    {number === 2 && <div><Label className="text-xs">QC score (%)</Label><Input type="number" min="0" max="100" className="mt-1 h-10 rounded-xl" value={value.qc_score ?? ''} onChange={(e) => onChange({ ...value, qc_score: e.target.value === '' ? '' : Number(e.target.value) })} /></div>}
    <div className={number === 1 ? 'sm:col-span-2' : ''}><Label className="text-xs">Debrief completed</Label><label className="mt-2 flex min-h-10 items-center gap-2"><Checkbox checked={Boolean(value.debrief_completed)} onCheckedChange={(checked) => onChange({ ...value, debrief_completed: checked === true })} /><span className="text-sm">Yes</span></label></div>
    <div className="sm:col-span-2"><Label className="text-xs">Coach notes / improvement actions</Label><Textarea className="mt-1 min-h-20 rounded-xl" value={value.notes || ''} onChange={(e) => onChange({ ...value, notes: e.target.value })} /></div>
  </div></div>;
}

export function StaffOnboardingSection({ staffId, staffName }: Props) {
  const queryClient = useQueryClient();
  const [training, setTraining] = useState<TrainingRecord>({});
  const { data, isLoading } = useQuery({
    queryKey: ['staff-onboarding', staffId],
    queryFn: async () => {
      const { data, error } = await supabase.from('staff_onboarding').select('*').eq('user_id', staffId).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  useEffect(() => { setTraining(data?.training_record ?? {}); }, [data?.training_record]);

  const adminUpdate = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data: result, error } = await supabase.functions.invoke('staff-onboarding', { body: { action: 'admin_update', staff_id: staffId, ...body } });
      if (error || result?.error) throw new Error(result?.error || error?.message);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-onboarding', staffId] });
      queryClient.invalidateQueries({ queryKey: ['staff-onboarding-data', staffId] });
      queryClient.invalidateQueries({ queryKey: ['staff-onboarding-statuses'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const requirements = (data?.prestart_requirements ?? {}) as Record<string, unknown>;
  const completedCount = PRESTART_REQUIREMENTS.filter((item) => isRequirementComplete(requirements[item.key])).length;
  const completion = Math.round((completedCount / PRESTART_REQUIREMENTS.length) * 100);
  const alerts = useMemo(() => {
    if (!data) return [] as { label: string; days: number }[];
    return [
      ['Public liability', data.public_liability_expiry],
      ['Driver licence', data.drivers_licence_expiry],
      ['Annual SOP re-sign', data.sops_resign_due],
    ].flatMap(([label, date]) => {
      if (!date) return [];
      const days = differenceInDays(parseISO(String(date)), new Date());
      return days <= 30 ? [{ label: String(label), days }] : [];
    });
  }, [data]);

  if (isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading induction record…</div>;
  if (!data) return <p className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">No onboarding record exists. Send {staffName} a fresh onboarding link.</p>;

  return <div className="space-y-4">
    {alerts.map((alert) => <div key={alert.label} className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${alert.days <= 0 ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-amber-300 bg-amber-50 text-amber-900'}`}><AlertTriangle className="h-4 w-4" />{alert.label}: {alert.days <= 0 ? 'expired' : `expires in ${alert.days} days`}</div>)}

    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-bold"><ClipboardList className="h-5 w-5 text-primary" />Pre-start control centre</h2><p className="mt-1 text-sm text-muted-foreground">Every item must be complete before Director approval.</p></div><Badge className={completion === 100 ? 'bg-primary/10 text-primary' : 'bg-amber-100 text-amber-800'}>{completedCount}/{PRESTART_REQUIREMENTS.length} complete</Badge></div>
      <Progress value={completion} className="my-4 h-2" />
      <div className="grid gap-2 sm:grid-cols-2">
        {PRESTART_REQUIREMENTS.map((item) => {
          const checked = isRequirementComplete(requirements[item.key]);
          const adminControlled = item.owner === 'admin';
          return <label key={item.key} className={`flex min-h-14 items-start gap-3 rounded-xl border p-3 ${checked ? 'border-primary/30 bg-primary/5' : 'border-border'} ${adminControlled ? 'cursor-pointer' : 'cursor-default'}`}><Checkbox checked={checked} disabled={!adminControlled || adminUpdate.isPending} onCheckedChange={(value) => adminUpdate.mutate({ prestart_requirements: { [item.key]: { completed: value === true } } })} className="mt-0.5 h-5 w-5" /><span className="min-w-0"><span className="block text-sm font-semibold">{item.label}</span><span className="text-[11px] text-muted-foreground">{adminControlled ? 'Verified by Brightly' : 'From cleaner submission'}</span></span></label>;
        })}
      </div>
    </section>

    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="mb-5 flex items-start gap-2"><GraduationCap className="mt-0.5 h-5 w-5 text-primary" /><div><h2 className="text-lg font-bold">Induction & training record</h2><p className="text-sm text-muted-foreground">Record the evidence behind the admin-controlled checklist.</p></div></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label className="text-xs">Welcome induction date</Label><Input type="date" className="mt-1 h-10 rounded-xl" value={training.welcome_induction_date || ''} onChange={(e) => setTraining({ ...training, welcome_induction_date: e.target.value })} /></div>
        <div><Label className="text-xs">Induction facilitator</Label><Input className="mt-1 h-10 rounded-xl" value={training.induction_facilitator || ''} onChange={(e) => setTraining({ ...training, induction_facilitator: e.target.value })} /></div>
        <div><Label className="text-xs">Verbal knowledge check date</Label><Input type="date" className="mt-1 h-10 rounded-xl" value={training.verbal_check_date || ''} onChange={(e) => setTraining({ ...training, verbal_check_date: e.target.value })} /></div>
        <div><Label className="text-xs">Brightly test-job date</Label><Input type="date" className="mt-1 h-10 rounded-xl" value={training.brightly_test_date || ''} onChange={(e) => setTraining({ ...training, brightly_test_date: e.target.value })} /></div>
        <div><Label className="text-xs">Kit issued date</Label><Input type="date" className="mt-1 h-10 rounded-xl" value={training.kit_issued_date || ''} onChange={(e) => setTraining({ ...training, kit_issued_date: e.target.value })} /></div>
      </div>
      <div className="mt-5 space-y-4">
        <TrainingClean number={1} value={training.shadow_clean_1 ?? {}} onChange={(next) => setTraining({ ...training, shadow_clean_1: next })} />
        <TrainingClean number={2} value={training.shadow_clean_2 ?? {}} onChange={(next) => setTraining({ ...training, shadow_clean_2: next })} />
      </div>
      <Button className="mt-5 h-11 w-full rounded-xl sm:w-auto" disabled={adminUpdate.isPending} onClick={() => adminUpdate.mutate({ training_record: training })}>{adminUpdate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save training record</Button>
    </section>

    <section className="rounded-2xl border bg-card p-5 shadow-sm"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-primary" /><div><h3 className="font-bold">Deployment gate</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">Current status: <strong className="text-foreground">{data.deployment_status || 'onboarding'}</strong>. A 100% pre-start checklist and Shadow Clean 2 QC score of 80% or higher are enforced again when the Director approves deployment.</p>{data.director_approved && <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-primary"><CheckCircle2 className="h-4 w-4" />Approved {data.director_approved_at ? new Date(data.director_approved_at).toLocaleString('en-AU') : ''}</p>}</div></div></section>
  </div>;
}

export function useStaffOnboardingStatuses(staffIds: string[]) {
  return useQuery({
    queryKey: ['staff-onboarding-statuses', staffIds],
    enabled: staffIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('staff_onboarding').select('user_id, status, submitted_at, admin_reviewed_at, onboarding_token, director_approved, deployment_status').in('user_id', staffIds);
      if (error) throw error;
      const map: Record<string, { status: string; submitted: boolean; reviewed: boolean; token: string; directorApproved: boolean; deploymentStatus: string }> = {};
      (data || []).forEach((record: any) => { map[record.user_id] = { status: record.status, submitted: Boolean(record.submitted_at), reviewed: Boolean(record.admin_reviewed_at), token: record.onboarding_token, directorApproved: Boolean(record.director_approved), deploymentStatus: record.deployment_status }; });
      return map;
    },
  });
}

export function useCleanerActiveStatus(staffId: string) {
  return useQuery({
    queryKey: ['cleaner-active-status', staffId],
    queryFn: async () => {
      const { data } = await supabase.from('staff_onboarding').select('submitted_at, director_approved, deployment_status, prestart_requirements, public_liability_expiry, drivers_licence_expiry, sops_resign_due').eq('user_id', staffId).maybeSingle();
      if (!data) return { active: false, reason: 'No onboarding record' };
      const record = data as any;
      const reasons: string[] = [];
      if (!record.submitted_at) reasons.push('Onboarding incomplete');
      if (!record.director_approved || record.deployment_status !== 'approved') reasons.push('Director approval required');
      PRESTART_REQUIREMENTS.forEach((item) => { if (!isRequirementComplete(record.prestart_requirements?.[item.key])) reasons.push(item.label); });
      const today = new Date();
      if (record.public_liability_expiry && parseISO(record.public_liability_expiry) < today) reasons.push('Public liability expired');
      if (record.drivers_licence_expiry && parseISO(record.drivers_licence_expiry) < today) reasons.push('Licence expired');
      if (record.sops_resign_due && parseISO(record.sops_resign_due) < today) reasons.push('SOP re-sign overdue');
      return { active: reasons.length === 0, reason: reasons.join(', ') || 'All clear' };
    },
  });
}
