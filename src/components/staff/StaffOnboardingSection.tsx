import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ClipboardList, User, Landmark, Shield, Camera, IdCard, CreditCard, FileSignature, GraduationCap, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  staffId: string;
  staffName: string;
}

const CHECKLIST_ITEMS = [
  { key: 'profile_photo', label: 'Profile photo uploaded', icon: Camera },
  { key: 'id_verified', label: 'ID verified', icon: IdCard },
  { key: 'bank_details', label: 'Bank details provided', icon: CreditCard },
  { key: 'signed_agreement', label: 'Signed cleaning agreement', icon: FileSignature },
  { key: 'first_training_clean', label: 'Completed first training clean', icon: GraduationCap },
  { key: 'active_on_app', label: 'Active on app', icon: Smartphone },
];

export function StaffOnboardingSection({ staffId, staffName }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

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

  // Parse checklist from the policy_acknowledgements JSON field (reuse existing column)
  const getChecklist = (): Record<string, boolean> => {
    if (!data) return {};
    const d = data as any;
    // Store checklist in policy_acknowledgements as { checklist: { key: true } }
    const acks = d.policy_acknowledgements;
    if (acks && typeof acks === 'object' && !Array.isArray(acks) && acks.checklist) {
      return acks.checklist;
    }
    return {};
  };

  const checklist = getChecklist();

  const toggleMutation = useMutation({
    mutationFn: async ({ key, checked }: { key: string; checked: boolean }) => {
      const d = data as any;
      const currentAcks = d?.policy_acknowledgements && typeof d.policy_acknowledgements === 'object' && !Array.isArray(d.policy_acknowledgements)
        ? d.policy_acknowledgements
        : {};
      const currentChecklist = currentAcks.checklist || {};
      const newChecklist = { ...currentChecklist, [key]: checked };
      const newAcks = { ...currentAcks, checklist: newChecklist };

      if (!data) {
        // Create onboarding record if none exists
        const { error } = await supabase.from('staff_onboarding').insert({
          user_id: staffId,
          status: 'pending',
          policy_acknowledgements: newAcks,
        } as any);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('staff_onboarding')
          .update({ policy_acknowledgements: newAcks, updated_at: new Date().toISOString() } as any)
          .eq('user_id', staffId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-onboarding', staffId] });
      toast.success('Checklist updated');
    },
    onError: () => toast.error('Failed to update'),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading HR details...</div>;

  const d = data as any;
  const reviewed = !!d?.admin_reviewed_at;
  const submitted = !!d?.submitted_at;
  const completedCount = CHECKLIST_ITEMS.filter(item => checklist[item.key]).length;

  return (
    <div className="bg-card rounded-2xl shadow-md p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-primary flex items-center gap-2">
          <ClipboardList className="w-5 h-5" /> HR & Onboarding
        </h2>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {completedCount}/{CHECKLIST_ITEMS.length}
          </Badge>
          {reviewed ? (
            <Badge className="bg-green-100 text-green-800">Reviewed ✓</Badge>
          ) : submitted ? (
            <Badge className="bg-amber-100 text-amber-800">Action Needed</Badge>
          ) : null}
        </div>
      </div>

      {/* Onboarding Checklist */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-3">Onboarding Checklist</h3>
        <div className="space-y-3">
          {CHECKLIST_ITEMS.map(({ key, label, icon: Icon }) => (
            <label key={key} className="flex items-center gap-3 cursor-pointer group">
              <Checkbox
                checked={!!checklist[key]}
                onCheckedChange={(checked) => toggleMutation.mutate({ key, checked: !!checked })}
                className="h-5 w-5"
              />
              <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              <span className={`text-sm font-medium ${checklist[key] ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                {label}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Submitted HR data */}
      {submitted && (
        <>
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
        </>
      )}

      {!submitted && (
        <p className="text-sm text-muted-foreground">
          Onboarding form has not been submitted yet. Send the onboarding link to {staffName}.
        </p>
      )}
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
