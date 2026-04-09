import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  ClipboardList, User, Landmark, Shield, Camera, IdCard, CreditCard,
  FileSignature, GraduationCap, Smartphone, ShieldCheck, Car, Upload,
  AlertTriangle, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { format, differenceInDays, parseISO } from 'date-fns';
import { useState, useRef } from 'react';

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
  const photoInputRef = useRef<HTMLInputElement>(null);
  const insuranceInputRef = useRef<HTMLInputElement>(null);
  const licenceInputRef = useRef<HTMLInputElement>(null);
  const vevoInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['staff-onboarding', staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cleaner_onboarding')
        .select('*')
        .eq('user_id', staffId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const d = data as any;

  // Also load from staff_onboarding for checklist
  const { data: staffOnb } = useQuery({
    queryKey: ['staff-onboarding-legacy', staffId],
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

  const getChecklist = (): Record<string, boolean> => {
    if (!staffOnb) return {};
    const so = staffOnb as any;
    const acks = so.policy_acknowledgements;
    if (acks && typeof acks === 'object' && !Array.isArray(acks) && acks.checklist) {
      return acks.checklist;
    }
    return {};
  };

  const checklist = getChecklist();

  const toggleMutation = useMutation({
    mutationFn: async ({ key, checked }: { key: string; checked: boolean }) => {
      const so = staffOnb as any;
      const currentAcks = so?.policy_acknowledgements && typeof so.policy_acknowledgements === 'object' && !Array.isArray(so.policy_acknowledgements)
        ? so.policy_acknowledgements
        : {};
      const currentChecklist = currentAcks.checklist || {};
      const newChecklist = { ...currentChecklist, [key]: checked };
      const newAcks = { ...currentAcks, checklist: newChecklist };

      if (!staffOnb) {
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
      queryClient.invalidateQueries({ queryKey: ['staff-onboarding-legacy', staffId] });
      toast.success('Checklist updated');
    },
    onError: () => toast.error('Failed to update'),
  });

  const updateFieldMutation = useMutation({
    mutationFn: async (fields: Record<string, any>) => {
      if (!d) {
        const { error } = await supabase.from('cleaner_onboarding').insert({
          user_id: staffId,
          ...fields,
        } as any);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('cleaner_onboarding')
          .update(fields as any)
          .eq('user_id', staffId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-onboarding', staffId] });
      toast.success('Updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleFileUpload = async (file: File, folder: string, fieldName: string) => {
    setUploading(fieldName);
    try {
      const ext = file.name.split('.').pop();
      const path = `${folder}/${staffId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('staff-documents').upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('staff-documents').getPublicUrl(path);
      await updateFieldMutation.mutateAsync({ [fieldName]: urlData.publicUrl });
    } catch (err: any) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploading(null);
    }
  };

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading HR details...</div>;

  const so = staffOnb as any;
  const reviewed = !!so?.admin_reviewed_at;
  const submitted = !!so?.submitted_at || !!d?.onboarding_complete;
  const completedCount = CHECKLIST_ITEMS.filter(item => checklist[item.key]).length;

  // Expiry alerts
  const expiryAlerts: { label: string; daysLeft: number }[] = [];
  if (d?.public_liability_expiry) {
    const days = differenceInDays(parseISO(d.public_liability_expiry), new Date());
    if (days <= 30) expiryAlerts.push({ label: 'Public Liability', daysLeft: days });
  }
  if (d?.drivers_licence_expiry) {
    const days = differenceInDays(parseISO(d.drivers_licence_expiry), new Date());
    if (days <= 30) expiryAlerts.push({ label: "Driver's Licence", daysLeft: days });
  }
  if (d?.sops_resign_due) {
    const days = differenceInDays(parseISO(d.sops_resign_due), new Date());
    if (days <= 30) expiryAlerts.push({ label: 'SOP Re-sign', daysLeft: days });
  }

  return (
    <div className="space-y-4">
      {/* Expiry Warnings */}
      {expiryAlerts.length > 0 && (
        <div className="space-y-2">
          {expiryAlerts.map(a => (
            <div key={a.label} className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
              a.daysLeft <= 0 ? 'bg-destructive/10 text-destructive border border-destructive/30' :
              a.daysLeft <= 7 ? 'bg-orange-100 text-orange-800 border border-orange-300' :
              'bg-amber-50 text-amber-800 border border-amber-200'
            }`}>
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {a.label}: {a.daysLeft <= 0 ? 'EXPIRED' : `expires in ${a.daysLeft} days`}
            </div>
          ))}
        </div>
      )}

      {/* HR & Onboarding Checklist */}
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
              <Badge className="bg-brightly/10 text-brightly">Reviewed ✓</Badge>
            ) : submitted ? (
              <Badge className="bg-amber-100 text-amber-800">Action Needed</Badge>
            ) : null}
          </div>
        </div>

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
      </div>

      {/* Profile Photo */}
      <div className="bg-card rounded-2xl shadow-md p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Camera className="w-4 h-4" /> Profile Photo
        </h3>
        <div className="flex items-center gap-4">
          {d?.profile_photo_url ? (
            <img src={d.profile_photo_url} alt="Profile" className="w-16 h-16 rounded-full object-cover border-2 border-primary/20" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <Camera className="w-6 h-6" />
            </div>
          )}
          <div>
            <input ref={photoInputRef} type="file" accept="image/*" capture="user" className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'profile-photos', 'profile_photo_url')} />
            <Button variant="outline" size="sm" className="gap-1 rounded-xl"
              disabled={uploading === 'profile_photo_url'}
              onClick={() => photoInputRef.current?.click()}>
              {uploading === 'profile_photo_url' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {d?.profile_photo_url ? 'Replace' : 'Upload'}
            </Button>
          </div>
        </div>
      </div>

      {/* Insurance */}
      <div className="bg-card rounded-2xl shadow-md p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> Insurance
        </h3>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Public Liability Certificate</Label>
            <div className="flex items-center gap-2 mt-1">
              {d?.public_liability_url ? (
                <a href={d.public_liability_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline truncate max-w-[200px]">View certificate</a>
              ) : (
                <span className="text-xs text-muted-foreground">Not uploaded</span>
              )}
              <input ref={insuranceInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'insurance', 'public_liability_url')} />
              <Button variant="outline" size="sm" className="gap-1 rounded-xl h-7 text-xs"
                disabled={uploading === 'public_liability_url'}
                onClick={() => insuranceInputRef.current?.click()}>
                {uploading === 'public_liability_url' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                Upload
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">Expiry Date</Label>
            <Input type="date" className="h-8 text-sm"
              value={d?.public_liability_expiry || ''}
              onChange={(e) => updateFieldMutation.mutate({ public_liability_expiry: e.target.value || null })} />
          </div>
        </div>
      </div>

      {/* Identity & Compliance */}
      <div className="bg-card rounded-2xl shadow-md p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <IdCard className="w-4 h-4" /> Identity & Compliance
        </h3>
        <div className="space-y-3">
          {/* VEVO */}
          <div className="flex items-center justify-between">
            <Label className="text-xs">VEVO Check Required</Label>
            <Switch checked={d?.vevo_required || false}
              onCheckedChange={(checked) => updateFieldMutation.mutate({ vevo_required: checked })} />
          </div>
          {d?.vevo_required && (
            <div className="pl-4 border-l-2 border-primary/20 space-y-2">
              <div className="flex items-center gap-2">
                {d?.vevo_check_url ? (
                  <a href={d.vevo_check_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">View VEVO</a>
                ) : (
                  <span className="text-xs text-muted-foreground">Not uploaded</span>
                )}
                <input ref={vevoInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'vevo', 'vevo_check_url')} />
                <Button variant="outline" size="sm" className="gap-1 rounded-xl h-7 text-xs"
                  disabled={uploading === 'vevo_check_url'}
                  onClick={() => vevoInputRef.current?.click()}>
                  {uploading === 'vevo_check_url' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                  Upload
                </Button>
              </div>
              {d?.vevo_verified_at && (
                <p className="text-xs text-brightly">Verified {format(parseISO(d.vevo_verified_at), 'dd MMM yyyy')}</p>
              )}
            </div>
          )}

          {/* Driver's Licence */}
          <div>
            <Label className="text-xs">Driver's Licence</Label>
            <div className="flex items-center gap-2 mt-1">
              {d?.drivers_licence_url ? (
                <a href={d.drivers_licence_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">View licence</a>
              ) : (
                <span className="text-xs text-muted-foreground">Not uploaded</span>
              )}
              <input ref={licenceInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'licences', 'drivers_licence_url')} />
              <Button variant="outline" size="sm" className="gap-1 rounded-xl h-7 text-xs"
                disabled={uploading === 'drivers_licence_url'}
                onClick={() => licenceInputRef.current?.click()}>
                {uploading === 'drivers_licence_url' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                Upload
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">Licence Expiry</Label>
            <Input type="date" className="h-8 text-sm"
              value={d?.drivers_licence_expiry || ''}
              onChange={(e) => updateFieldMutation.mutate({ drivers_licence_expiry: e.target.value || null })} />
          </div>

          {/* Vehicle Rego */}
          <div>
            <Label className="text-xs">Vehicle Rego</Label>
            <Input className="h-8 text-sm" placeholder="e.g. ABC123"
              defaultValue={d?.vehicle_rego || ''}
              onBlur={(e) => {
                if (e.target.value !== (d?.vehicle_rego || '')) {
                  updateFieldMutation.mutate({ vehicle_rego: e.target.value || null });
                }
              }} />
          </div>
        </div>
      </div>

      {/* Tax & Super (existing data + GST) */}
      {submitted && (
        <div className="bg-card rounded-2xl shadow-md p-5 space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1 mb-2">
            <Shield className="w-4 h-4" /> Tax & Super
          </h3>
          <div className="grid gap-1 sm:grid-cols-2 text-sm">
            <p><span className="font-medium">ABN:</span> {d?.abn || '—'}</p>
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">GST Registered:</span>
              <Switch checked={d?.gst_registered || false}
                onCheckedChange={(checked) => updateFieldMutation.mutate({ gst_registered: checked })} />
            </div>
          </div>
        </div>
      )}

      {/* Kit & Uniform */}
      <div className="bg-card rounded-2xl shadow-md p-5 space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <ClipboardList className="w-4 h-4" /> Kit & Uniform
        </h3>
        <label className="flex items-center gap-3 cursor-pointer">
          <Checkbox checked={d?.uniform_received || false}
            onCheckedChange={(checked) => updateFieldMutation.mutate({ uniform_received: !!checked })}
            className="h-5 w-5" />
          <span className="text-sm font-medium">Uniform received</span>
        </label>
      </div>

      {/* SOP Re-sign Status */}
      {d?.sops_resign_due && (
        <div className="bg-card rounded-2xl shadow-md p-5 space-y-2">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FileSignature className="w-4 h-4" /> SOP Re-sign
          </h3>
          <p className="text-sm">
            Due: <span className="font-bold">{format(parseISO(d.sops_resign_due), 'dd MMM yyyy')}</span>
            {differenceInDays(parseISO(d.sops_resign_due), new Date()) <= 0 && (
              <Badge className="ml-2 bg-destructive text-destructive-foreground">OVERDUE</Badge>
            )}
          </p>
        </div>
      )}

      {/* Submitted HR data (existing personal/bank sections) */}
      {submitted && d && (
        <>
          <div className="bg-card rounded-2xl shadow-md p-5 space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1 mb-2">
              <User className="w-4 h-4" /> Personal Details
            </h3>
            <div className="grid gap-1 sm:grid-cols-2 text-sm">
              <p><span className="font-medium">Name:</span> {d.full_name}</p>
              <p><span className="font-medium">Email:</span> {d.email}</p>
              <p><span className="font-medium">Phone:</span> {d.mobile}</p>
              {d.suburb && <p><span className="font-medium">Suburb:</span> {d.suburb}</p>}
              {d.date_of_birth && <p><span className="font-medium">DOB:</span> {d.date_of_birth}</p>}
              {d.emergency_contact_name && (
                <p className="sm:col-span-2">
                  <span className="font-medium">Emergency:</span> {d.emergency_contact_name} — {d.emergency_contact_phone}
                </p>
              )}
            </div>
          </div>

          <div className="bg-card rounded-2xl shadow-md p-5 space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1 mb-2">
              <Landmark className="w-4 h-4" /> Bank Details
            </h3>
            <div className="grid gap-1 sm:grid-cols-2 text-sm">
              <p><span className="font-medium">BSB:</span> {d.bank_bsb || '—'}</p>
              <p><span className="font-medium">Account #:</span> {d.bank_account ? '••••' + d.bank_account.slice(-4) : '—'}</p>
              <p><span className="font-medium">Account Name:</span> {d.bank_name || '—'}</p>
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
        .select('user_id, status, submitted_at, admin_reviewed_at, onboarding_token, director_approved')
        .in('user_id', staffIds);
      if (error) throw error;
      const map: Record<string, { status: string; submitted: boolean; reviewed: boolean; token: string; directorApproved: boolean }> = {};
      (data || []).forEach((r: any) => {
        map[r.user_id] = {
          status: r.status,
          submitted: !!r.submitted_at,
          reviewed: !!r.admin_reviewed_at,
          token: r.onboarding_token,
          directorApproved: !!r.director_approved,
        };
      });
      return map;
    },
  });
}

/** Compute cleaner "active" status from compliance fields */
export function useCleanerActiveStatus(staffId: string) {
  return useQuery({
    queryKey: ['cleaner-active-status', staffId],
    queryFn: async () => {
      const { data } = await supabase
        .from('cleaner_onboarding')
        .select('onboarding_complete, police_check_url, police_check_date, public_liability_expiry, drivers_licence_expiry, sops_resign_due, id_document_url, bank_bsb, bank_account, abn')
        .eq('user_id', staffId)
        .maybeSingle();
      if (!data) return { active: false, reason: 'No onboarding record' };

      const d = data as any;
      const today = new Date();
      const reasons: string[] = [];

      if (!d.onboarding_complete) reasons.push('Onboarding incomplete');
      if (!d.id_document_url) reasons.push('Missing ID');
      if (!d.bank_bsb || !d.bank_account) reasons.push('Missing bank details');
      if (!d.abn) reasons.push('Missing ABN');
      if (!d.police_check_url) reasons.push('Missing police check');

      if (d.public_liability_expiry && parseISO(d.public_liability_expiry) < today) reasons.push('Public liability expired');
      if (d.drivers_licence_expiry && parseISO(d.drivers_licence_expiry) < today) reasons.push('Licence expired');
      if (d.sops_resign_due && parseISO(d.sops_resign_due) < today) reasons.push('SOP re-sign overdue');

      return { active: reasons.length === 0, reason: reasons.join(', ') || 'All clear' };
    },
  });
}
