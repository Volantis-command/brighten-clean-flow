import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { User, Landmark, Calendar, IdCard, CheckCircle2 } from 'lucide-react';

interface Props {
  staffId: string;
}

export default function StaffOnboardingDataView({ staffId }: Props) {
  const { data: onb, isLoading } = useQuery({
    queryKey: ['staff-onboarding-data', staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_onboarding')
        .select('*')
        .eq('user_id', staffId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading onboarding data...</p>;
  if (!onb) return <p className="text-sm text-muted-foreground">No onboarding form submitted yet.</p>;

  const maskAccount = (val: string | null) => {
    if (!val) return '—';
    return val.length > 4 ? '****' + val.slice(-4) : val;
  };

  const availableDays = Array.isArray(onb.available_days) ? onb.available_days : [];

  return (
    <div className="space-y-4">
      {/* Personal Details */}
      <div className="bg-card rounded-2xl shadow-md p-5 space-y-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
          <User className="w-4 h-4" /> Personal Details
        </h3>
        <div className="grid gap-2 sm:grid-cols-2 text-sm">
          <p><span className="font-medium text-muted-foreground">Full Name:</span> {onb.full_name || '—'}</p>
          <p><span className="font-medium text-muted-foreground">Preferred Name:</span> {onb.preferred_name || '—'}</p>
          <p><span className="font-medium text-muted-foreground">Date of Birth:</span> {onb.date_of_birth || '—'}</p>
          <p><span className="font-medium text-muted-foreground">Mobile:</span> {onb.phone || '—'}</p>
          <p className="sm:col-span-2"><span className="font-medium text-muted-foreground">Address:</span> {onb.address || '—'}</p>
          {onb.emergency_contact_name && (
            <p className="sm:col-span-2">
              <span className="font-medium text-muted-foreground">Emergency Contact:</span>{' '}
              {onb.emergency_contact_name}
              {onb.emergency_contact_relationship && ` (${onb.emergency_contact_relationship})`}
              {onb.emergency_contact_phone && ` — ${onb.emergency_contact_phone}`}
            </p>
          )}
        </div>
      </div>

      {/* Work Entitlements */}
      <div className="bg-card rounded-2xl shadow-md p-5 space-y-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
          <Landmark className="w-4 h-4" /> Work Entitlements
        </h3>
        <div className="grid gap-2 sm:grid-cols-2 text-sm">
          <p><span className="font-medium text-muted-foreground">ABN:</span> {onb.abn || (onb.abn_status === 'yes' ? 'Yes (not provided)' : onb.abn_status === 'no' ? 'No' : '—')}</p>
          <p><span className="font-medium text-muted-foreground">Contractor:</span> {onb.is_contractor ? 'Yes' : 'No'}</p>
          <p><span className="font-medium text-muted-foreground">Account Name:</span> {onb.bank_account_name || '—'}</p>
          <p><span className="font-medium text-muted-foreground">BSB:</span> {onb.bank_bsb || '—'}</p>
          <p><span className="font-medium text-muted-foreground">Account #:</span> {maskAccount(onb.bank_account_number)}</p>
        </div>
      </div>

      {/* Availability */}
      <div className="bg-card rounded-2xl shadow-md p-5 space-y-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
          <Calendar className="w-4 h-4" /> Availability
        </h3>
        <div className="grid gap-2 sm:grid-cols-2 text-sm">
          <p>
            <span className="font-medium text-muted-foreground">Available Days:</span>{' '}
            {availableDays.length > 0 ? availableDays.join(', ') : '—'}
          </p>
          <p><span className="font-medium text-muted-foreground">Preferred Start:</span> {onb.preferred_start_time || '—'}</p>
          <p><span className="font-medium text-muted-foreground">Max Jobs/Day:</span> {onb.max_jobs_per_day || '—'}</p>
          {onb.availability_notes && (
            <p className="sm:col-span-2"><span className="font-medium text-muted-foreground">Notes:</span> {onb.availability_notes}</p>
          )}
        </div>
      </div>

      {/* Identity */}
      <div className="bg-card rounded-2xl shadow-md p-5 space-y-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
          <IdCard className="w-4 h-4" /> Identity Verification
        </h3>
        <div className="grid gap-2 sm:grid-cols-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium text-muted-foreground">ID Document:</span>
            {onb.id_document_url ? (
              <a href={onb.id_document_url} target="_blank" rel="noopener noreferrer" className="text-primary underline flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Uploaded ✓
              </a>
            ) : (
              <span>—</span>
            )}
          </div>
          <p>
            <span className="font-medium text-muted-foreground">ID Confirmed:</span>{' '}
            {onb.id_confirmed ? <span className="text-primary font-medium">Yes ✓</span> : 'No'}
          </p>
        </div>
      </div>
    </div>
  );
}
