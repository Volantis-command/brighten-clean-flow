import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, User, Landmark, Shield } from 'lucide-react';

interface Props {
  staffId: string;
  staffName: string;
}

export function StaffOnboardingSection({ staffId, staffName }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['staff-onboarding', staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_onboarding')
        .select('*')
        .eq('user_id', staffId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading HR details...</div>;
  if (!data || !data.submitted_at) {
    return (
      <div className="bg-card rounded-2xl shadow-md p-5">
        <h2 className="text-lg font-bold text-primary flex items-center gap-2">
          <ClipboardList className="w-5 h-5" /> HR & Onboarding
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          Onboarding form has not been submitted yet. Send the onboarding link to {staffName}.
        </p>
      </div>
    );
  }

  const d = data as any;
  const reviewed = !!d.admin_reviewed_at;

  return (
    <div className="bg-card rounded-2xl shadow-md p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-primary flex items-center gap-2">
          <ClipboardList className="w-5 h-5" /> HR & Onboarding
        </h2>
        {reviewed ? (
          <Badge className="bg-green-100 text-green-800">Reviewed ✓</Badge>
        ) : (
          <Badge className="bg-amber-100 text-amber-800">Action Needed</Badge>
        )}
      </div>

      {/* Personal */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1 mb-2">
          <User className="w-4 h-4" /> Personal Details
        </h3>
        <div className="grid gap-1 sm:grid-cols-2 text-sm">
          <p><span className="font-medium">Name:</span> {d.full_name}</p>
          {d.preferred_name && <p><span className="font-medium">Preferred:</span> {d.preferred_name}</p>}
          <p><span className="font-medium">Email:</span> {d.email}</p>
          <p><span className="font-medium">Phone:</span> {d.phone}</p>
          {d.address && <p className="sm:col-span-2"><span className="font-medium">Address:</span> {d.address}</p>}
          {d.date_of_birth && <p><span className="font-medium">DOB:</span> {d.date_of_birth}</p>}
          {d.emergency_contact_name && (
            <p className="sm:col-span-2">
              <span className="font-medium">Emergency:</span> {d.emergency_contact_name} ({d.emergency_contact_relationship}) — {d.emergency_contact_phone}
            </p>
          )}
        </div>
      </div>

      {/* Tax & Super */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1 mb-2">
          <Shield className="w-4 h-4" /> Tax & Super
        </h3>
        <div className="grid gap-1 sm:grid-cols-2 text-sm">
          {d.is_contractor ? (
            <p><span className="font-medium">ABN:</span> {d.abn || '—'}</p>
          ) : (
            <>
              <p><span className="font-medium">TFN:</span> {d.tfn ? '•••••' + d.tfn.slice(-3) : '—'}</p>
              <p><span className="font-medium">Super Fund:</span> {d.super_fund_name || '—'}</p>
              <p><span className="font-medium">Member #:</span> {d.super_member_number || '—'}</p>
            </>
          )}
        </div>
      </div>

      {/* Bank */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1 mb-2">
          <Landmark className="w-4 h-4" /> Bank Details
        </h3>
        <div className="grid gap-1 sm:grid-cols-2 text-sm">
          <p><span className="font-medium">BSB:</span> {d.bank_bsb || '—'}</p>
          <p><span className="font-medium">Account #:</span> {d.bank_account_number ? '••••' + d.bank_account_number.slice(-4) : '—'}</p>
          <p><span className="font-medium">Account Name:</span> {d.bank_account_name || '—'}</p>
        </div>
      </div>
    </div>
  );
}

export function useStaffOnboardingStatuses(staffIds: string[]) {
  return useQuery({
    queryKey: ['staff-onboarding-statuses', staffIds],
    enabled: staffIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_onboarding')
        .select('user_id, status, submitted_at, admin_reviewed_at, onboarding_token')
        .in('user_id', staffIds);
      if (error) throw error;
      const map: Record<string, { status: string; submitted: boolean; reviewed: boolean; token: string }> = {};
      (data || []).forEach((r: any) => {
        map[r.user_id] = {
          status: r.status,
          submitted: !!r.submitted_at,
          reviewed: !!r.admin_reviewed_at,
          token: r.onboarding_token,
        };
      });
      return map;
    },
  });
}
