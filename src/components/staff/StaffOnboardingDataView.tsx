/* eslint-disable @typescript-eslint/no-explicit-any -- Canonical onboarding fields are introduced by the accompanying migration. */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, FileText, IdCard, Landmark, Loader2, ShieldCheck, User, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DOCUMENT_TYPES,
  formatStoredDateAustralian,
  isAcknowledgementAccepted,
  ONBOARDING_ACKNOWLEDGEMENTS,
  ONBOARDING_KNOWLEDGE_QUESTIONS,
} from '@/lib/staffOnboarding';

interface Props { staffId: string }

const value = (input: unknown) => input === null || input === undefined || input === '' ? '—' : String(input);
const yesNo = (input: unknown) => input ? 'Yes' : 'No';
const maskAccount = (input: unknown) => {
  const text = String(input ?? '');
  return text ? `•••• ${text.slice(-4)}` : '—';
};

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-foreground">{children}</dd></div>;
}

function Section({ icon: Icon, title, children }: { icon: typeof User; title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border bg-card p-5 shadow-sm"><h3 className="mb-4 flex items-center gap-2 font-bold"><Icon className="h-4 w-4 text-primary" />{title}</h3>{children}</section>;
}

export default function StaffOnboardingDataView({ staffId }: Props) {
  const [opening, setOpening] = useState<string | null>(null);
  const { data: onb, isLoading } = useQuery({
    queryKey: ['staff-onboarding-data', staffId],
    queryFn: async () => {
      const { data, error } = await supabase.from('staff_onboarding').select('*').eq('user_id', staffId).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const openDocument = async (documentKey: string) => {
    setOpening(documentKey);
    try {
      const { data, error } = await supabase.functions.invoke('staff-onboarding', { body: { action: 'document_url', staff_id: staffId, document_key: documentKey } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open document');
    } finally {
      setOpening(null);
    }
  };

  if (isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading complete staff file…</div>;
  if (!onb) return <p className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">No onboarding record exists for this staff member.</p>;

  const manifest = (onb.document_manifest ?? {}) as Record<string, any>;
  const acknowledgements = (onb.sop_acknowledgements ?? {}) as Record<string, any>;
  const questions = (onb.knowledge_check?.questions ?? {}) as Record<string, any>;
  const availableDays = Array.isArray(onb.available_days) ? onb.available_days.join(', ') : '—';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{onb.onboarding_version || 'Version unavailable'}</Badge>
        <Badge className={onb.submitted_at ? 'bg-primary/10 text-primary' : 'bg-amber-100 text-amber-800'}>{onb.submitted_at ? 'Submitted' : onb.status || 'Pending'}</Badge>
        {onb.submitted_at && <span className="text-xs text-muted-foreground">{new Date(onb.submitted_at).toLocaleString('en-AU')}</span>}
      </div>

      <Section icon={User} title="Personal & emergency details"><dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Detail label="Legal name">{value(onb.full_name)}</Detail><Detail label="Preferred name">{value(onb.preferred_name)}</Detail><Detail label="Email">{value(onb.email)}</Detail>
        <Detail label="Mobile">{value(onb.phone)}</Detail><Detail label="Date of birth">{formatStoredDateAustralian(onb.date_of_birth)}</Detail><Detail label="Address">{value(onb.address)}</Detail>
        <Detail label="Suburb">{value(onb.residential_suburb)}</Detail><Detail label="Postcode">{value(onb.postcode)}</Detail><Detail label="Emergency contact">{value(onb.emergency_contact_name)}</Detail>
        <Detail label="Relationship">{value(onb.emergency_contact_relationship)}</Detail><Detail label="Emergency phone">{value(onb.emergency_contact_phone)}</Detail>
      </dl></Section>

      <Section icon={Landmark} title="Contractor & payment"><dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Detail label="Contractor accepted">{yesNo(onb.is_contractor)}</Detail><Detail label="ABN status">{value(onb.abn_status)}</Detail><Detail label="ABN">{value(onb.abn)}</Detail>
        <Detail label="GST registered">{yesNo(onb.gst_registered)}</Detail><Detail label="Account name">{value(onb.bank_account_name)}</Detail><Detail label="BSB">{value(onb.bank_bsb)}</Detail>
        <Detail label="Account number">{maskAccount(onb.bank_account_number)}</Detail>
      </dl></Section>

      <Section icon={IdCard} title="Identity, compliance & documents">
        <dl className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="ID type">{value(onb.id_document_type)}</Detail><Detail label="ID ownership confirmed">{yesNo(onb.id_confirmed)}</Detail><Detail label="Public liability">{value(onb.public_liability_status)}</Detail>
          <Detail label="Insurance expiry">{formatStoredDateAustralian(onb.public_liability_expiry)}</Detail><Detail label="Licence expiry">{formatStoredDateAustralian(onb.drivers_licence_expiry)}</Detail><Detail label="Reliable transport">{yesNo(onb.transport_confirmed)}</Detail><Detail label="Vehicle rego">{value(onb.vehicle_rego)}</Detail>
        </dl>
        <div className="grid gap-3 sm:grid-cols-2">
          {DOCUMENT_TYPES.map((document) => {
            const entry = manifest[document.key];
            return <div key={document.key} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border p-3"><div className="min-w-0"><p className="text-sm font-semibold">{document.label}</p><p className="truncate text-xs text-muted-foreground">{entry?.original_name || (entry?.legacy_url ? 'Migrated document' : 'Not received')}</p></div>{entry ? <Button variant="outline" size="sm" className="shrink-0 rounded-xl" onClick={() => openDocument(document.key)} disabled={opening === document.key}>{opening === document.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}</Button> : <XCircle className="h-4 w-4 shrink-0 text-muted-foreground" />}</div>;
          })}
        </div>
      </Section>

      <Section icon={FileText} title="Availability & communication"><dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Detail label="Available days">{availableDays}</Detail><Detail label="Availability notes">{value(onb.availability_notes)}</Detail><Detail label="Brightly notifications">{yesNo(onb.brightly_notifications_enabled)}</Detail><Detail label="WhatsApp">{yesNo(onb.has_whatsapp)}</Detail>
        <Detail label="Scheduling rules accepted">{yesNo(onb.communication_acknowledged)}</Detail>
      </dl></Section>

      <Section icon={ShieldCheck} title="SOP & policy acknowledgements"><div className="space-y-3">{ONBOARDING_ACKNOWLEDGEMENTS.map((item) => {
        const entry = acknowledgements[item.key];
        const accepted = isAcknowledgementAccepted(acknowledgements, item);
        return <div key={item.key} className="flex items-start gap-3 rounded-xl border p-3">{accepted ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}<div><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{entry?.prompt || item.declaration}</p><p className="mt-1 text-[11px] text-muted-foreground">{entry?.acknowledged_at ? new Date(entry.acknowledged_at).toLocaleString('en-AU') : item.source}</p></div></div>;
      })}</div></Section>

      <Section icon={CheckCircle2} title={`Knowledge check · ${onb.knowledge_check?.score ?? 0}/${onb.knowledge_check?.total ?? ONBOARDING_KNOWLEDGE_QUESTIONS.length}`}><div className="space-y-3">{ONBOARDING_KNOWLEDGE_QUESTIONS.map((question, index) => {
        const result = questions[question.key];
        const selected = result?.selected_index;
        return <div key={question.key} className="rounded-xl border p-3"><p className="text-sm font-semibold">{index + 1}. {result?.prompt || question.prompt}</p><p className="mt-1 text-xs text-muted-foreground">Answer: {selected === undefined ? 'Not answered' : question.options[selected]}</p></div>;
      })}</div></Section>

      <Section icon={FileText} title="Declaration & audit trail"><dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Detail label="Information accurate">{yesNo(onb.cleaner_declaration?.accurate)}</Detail><Detail label="Compliance accepted">{yesNo(onb.cleaner_declaration?.compliance)}</Detail><Detail label="Digital signature">{value(onb.digital_signature)}</Detail>
        <Detail label="Signed at">{onb.signed_at ? new Date(onb.signed_at).toLocaleString('en-AU') : '—'}</Detail><Detail label="Annual re-sign due">{value(onb.sops_resign_due)}</Detail><Detail label="Deployment status">{value(onb.deployment_status)}</Detail>
      </dl></Section>
    </div>
  );
}
