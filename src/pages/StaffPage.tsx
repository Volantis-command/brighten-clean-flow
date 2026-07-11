import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getAppBaseUrl } from '@/lib/appUrl';
import { sendJobSms } from '@/lib/sendJobSms';
import AdminTimeView from '@/components/timeclock/AdminTimeView';
import { StaffAvailabilitySection } from '@/components/staff/StaffAvailabilitySection';
import { StaffPaySection } from '@/components/staff/StaffPaySection';
import { StaffPayRatesSection } from '@/components/staff/StaffPayRatesSection';
import { StaffPerformanceSection, useStaffPerformanceBadges } from '@/components/staff/StaffPerformanceSection';
import { StaffOnboardingSection, useStaffOnboardingStatuses, useCleanerActiveStatus } from '@/components/staff/StaffOnboardingSection';
import CleanerScorecard from '@/components/staff/CleanerScorecard';
import StaffOnboardingDataView from '@/components/staff/StaffOnboardingDataView';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { UserPlus, Pencil, Trash2, Phone, Mail, Loader2, ArrowLeft, Key, Link2, Copy, CheckCircle2, Clock, Calendar, FileCheck, DollarSign, Upload, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { useRef } from 'react';
import { format } from 'date-fns';

type AppRole = 'admin' | 'head_cleaner' | 'cleaner';

interface StaffMember {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  employment_type: string | null;
  role: AppRole;
}

const roleBadgeStyles: Record<AppRole, string> = {
  admin: 'bg-primary text-primary-foreground',
  head_cleaner: 'bg-accent text-accent-foreground',
  cleaner: 'bg-secondary text-secondary-foreground',
};

const roleLabels: Record<AppRole, string> = {
  admin: 'Admin',
  head_cleaner: 'Head Cleaner',
  cleaner: 'Cleaner',
};

function useStaffList() {
  return useQuery({
    queryKey: ['staff-list'],
    queryFn: async () => {
      const { data: roles, error: rolesErr } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['admin', 'head_cleaner', 'cleaner']);
      if (rolesErr) throw rolesErr;
      if (!roles?.length) return [];

      const userIds = roles.map((r) => r.user_id);
      const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, employment_type')
        .in('id', userIds);
      if (profErr) throw profErr;

      const roleMap = new Map(roles.map((r) => [r.user_id, r.role as AppRole]));
      return (profiles || []).map((p) => ({
        ...p,
        role: roleMap.get(p.id) || ('cleaner' as AppRole),
      })) as StaffMember[];
    },
  });
}

export default function StaffPage() {
  const { role: currentRole } = useAuth();
  const queryClient = useQueryClient();
  const { data: staff = [], isLoading } = useStaffList();
  const staffIds = staff.map(s => s.id);
  const { data: perfBadges = {} } = useStaffPerformanceBadges(staffIds);
  const { data: onboardingStatuses = {} } = useStaffOnboardingStatuses(staffIds);
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editMember, setEditMember] = useState<StaffMember | null>(null);
  const [removeMember, setRemoveMember] = useState<StaffMember | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [magicLinkConfirm, setMagicLinkConfirm] = useState<StaffMember | null>(null);
  const [onboardingLinkCopied, setOnboardingLinkCopied] = useState('');

  // Create form
  const [createEmail, setCreateEmail] = useState('');
  const [createName, setCreateName] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createRole, setCreateRole] = useState<AppRole>('cleaner');
  const [createPassword, setCreatePassword] = useState('');

  // Invite form
  const [invEmail, setInvEmail] = useState('');
  const [invName, setInvName] = useState('');
  const [invPhone, setInvPhone] = useState('');
  const [invRole, setInvRole] = useState<AppRole>('cleaner');

  // Edit form
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState<AppRole>('cleaner');
  const [editEmploymentType, setEditEmploymentType] = useState('employee');
  const [editPassword, setEditPassword] = useState('');

  const invokeFn = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('invite-staff', { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const createMutation = useMutation({
    mutationFn: () =>
      invokeFn({ action: 'create_user', email: createEmail, role: createRole, full_name: createName, phone: createPhone, password: createPassword }),
    onSuccess: () => {
      toast.success('Staff account created!');
      queryClient.invalidateQueries({ queryKey: ['staff-list'] });
      queryClient.invalidateQueries({ queryKey: ['cleaners-list'] });
      setCreateOpen(false);
      setCreateEmail(''); setCreateName(''); setCreatePhone(''); setCreatePassword(''); setCreateRole('cleaner');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      // Create user with random password (they'll use magic link, not password)
      const randomPwd = crypto.randomUUID().slice(0, 16) + 'Aa1!';
      const data = await invokeFn({
        action: 'create_user',
        email: invEmail,
        role: invRole,
        full_name: invName,
        phone: invPhone,
        password: randomPwd,
      });
      const userId = data?.user_id;
      if (!userId) throw new Error('Failed to create user');

      // Ensure onboarding record + get token
      const onboardData = await invokeFn({
        action: 'ensure_onboarding',
        user_id: userId,
        full_name: invName,
        email: invEmail,
      });

      // NOTE: Do NOT send magic login link here — the onboarding SMS below
      // is the new staff member's entry point. Login links are only for
      // existing staff re-authentication (via "Send Login Link" button).

      // Send SMS with onboarding form link
      if (invPhone && onboardData?.token) {
        const link = `${getAppBaseUrl()}/staff-onboarding/${onboardData.token}`;
        const firstName = (invName || 'there').split(' ')[0];
        try {
          await sendJobSms({
            to: invPhone,
            message: `Hi ${firstName}, welcome to Brightly! 🌿 Complete your onboarding here: ${link}`,
          });
        } catch { /* best effort */ }
      }

      return data;
    },
    onSuccess: () => {
      toast.success('Staff member invited. SMS sent.');
      queryClient.invalidateQueries({ queryKey: ['staff-list'] });
      queryClient.invalidateQueries({ queryKey: ['cleaners-list'] });
      queryClient.invalidateQueries({ queryKey: ['staff-onboarding-statuses'] });
      setInviteOpen(false);
      setInvEmail(''); setInvName(''); setInvPhone(''); setInvRole('cleaner');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error: profileErr } = await supabase
        .from('profiles')
        .update({ full_name: editName, email: editEmail, phone: editPhone, employment_type: editEmploymentType })
        .eq('id', editMember!.id);
      if (profileErr) throw profileErr;
      // Update role directly in user_roles table
      const { error: roleErr } = await supabase
        .from('user_roles')
        .upsert({ user_id: editMember!.id, role: editRole }, { onConflict: 'user_id' });
      if (roleErr) {
        // Non-fatal — profile saved, role update failed silently
        console.warn('Role update failed:', roleErr.message);
      }
    },
    onSuccess: () => {
      toast.success('Staff member updated');
      queryClient.invalidateQueries({ queryKey: ['staff-list'] });
      queryClient.invalidateQueries({ queryKey: ['cleaners-list'] });
      setEditMember(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => invokeFn({ action: 'remove', user_id: memberId }),
    onSuccess: () => {
      toast.success('Staff member removed');
      queryClient.invalidateQueries({ queryKey: ['staff-list'] });
      queryClient.invalidateQueries({ queryKey: ['cleaners-list'] });
      setRemoveMember(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (m: StaffMember) => {
    setEditMember(m);
    setEditName(m.full_name || '');
    setEditEmail(m.email || '');
    setEditPhone(m.phone || '');
    setEditRole(m.role);
    setEditEmploymentType(m.employment_type || 'employee');
    setEditPassword('');
  };

  const setPasswordMutation = useMutation({
    mutationFn: () =>
      invokeFn({ action: 'set_password', user_id: editMember!.id, password: editPassword }),
    onSuccess: () => {
      toast.success('Password updated. Share it securely with the staff member.');
      setEditPassword('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        // Password reset email — must land on the published app, not a preview.
        redirectTo: getAppBaseUrl(),
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success('Password reset email sent!'),
    onError: (e: Error) => toast.error(e.message),
  });

  const sendMagicLinkMutation = useMutation({
    mutationFn: async (staffMember: StaffMember) => {
      const { data, error } = await supabase.functions.invoke('send-staff-magic-link', {
        body: { staff_id: staffMember.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Login link sent to ${data?.phone || 'staff'}`);
      setMagicLinkConfirm(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markReviewedMutation = useMutation({
    mutationFn: (userId: string) =>
      invokeFn({ action: 'mark_reviewed', user_id: userId }),
    onSuccess: () => {
      toast.success('Marked as reviewed');
      queryClient.invalidateQueries({ queryKey: ['staff-onboarding'] });
      queryClient.invalidateQueries({ queryKey: ['staff-onboarding-statuses'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveDeploymentMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('staff_onboarding')
        .update({ director_approved: true } as any)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Cleaner approved for deployment!');
      queryClient.invalidateQueries({ queryKey: ['staff-onboarding'] });
      queryClient.invalidateQueries({ queryKey: ['staff-onboarding-statuses'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ensureOnboardingMutation = useMutation({
    mutationFn: async (m: StaffMember) => {
      const data = await invokeFn({ action: 'ensure_onboarding', user_id: m.id, full_name: m.full_name, email: m.email });
      return { ...data, phone: m.phone, full_name: m.full_name };
    },
    onSuccess: async (data: any) => {
      if (data?.token) {
        const link = `${getAppBaseUrl()}/staff-onboarding/${data.token}`;
        navigator.clipboard.writeText(link);
        setOnboardingLinkCopied(data.token);
        queryClient.invalidateQueries({ queryKey: ['staff-onboarding-statuses'] });
        // Send SMS with onboarding link if phone available
        if (data.phone) {
          try {
            const firstName = (data.full_name || 'there').split(' ')[0];
            await sendJobSms({
              to: data.phone,
              message: `Hi ${firstName}, welcome to Brightly! 🌿 Complete your onboarding here: ${link}`,
            });
            toast.success('Onboarding link sent via SMS and copied!');
          } catch {
            toast.success('Onboarding link copied! (SMS send failed)');
          }
        } else {
          toast.success('Onboarding link copied to clipboard!');
        }
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const getOnboardingLink = (staffId: string) => {
    const status = onboardingStatuses[staffId];
    if (status?.token) return `${getAppBaseUrl()}/staff-onboarding/${status.token}`;
    return null;
  };

  const copyOnboardingLink = (staffId: string) => {
    const link = getOnboardingLink(staffId);
    if (link) {
      navigator.clipboard.writeText(link);
      setOnboardingLinkCopied(staffId);
      toast.success('Onboarding link copied!');
      setTimeout(() => setOnboardingLinkCopied(''), 2000);
    }
  };

  const isAdmin = currentRole === 'admin';

  // The magic-link confirmation dialog must render regardless of which
  // view is active (list vs detail). Previously it was below the early-return
  // for the detail view, so clicking "Send Login Link" on the detail page
  // set the state but the dialog didn't exist in the DOM.
  const magicLinkDialog = (
    <AlertDialog open={!!magicLinkConfirm} onOpenChange={(o) => { if (!o) setMagicLinkConfirm(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Send Login Link</AlertDialogTitle>
          <AlertDialogDescription>
            Send a magic login link via SMS to <strong>{magicLinkConfirm?.full_name}</strong> ({magicLinkConfirm?.phone})?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => magicLinkConfirm && sendMagicLinkMutation.mutate(magicLinkConfirm)}
            disabled={!magicLinkConfirm?.phone || sendMagicLinkMutation.isPending}
          >
            {sendMagicLinkMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Send Login Link
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // Selected staff detail view
  if (selectedStaff) {
    return (
      <>
        <StaffDetailView
          staff={selectedStaff}
          isAdmin={isAdmin}
          onBack={() => setSelectedStaff(null)}
          onboardingStatuses={onboardingStatuses}
          getOnboardingLink={getOnboardingLink}
          onboardingLinkCopied={onboardingLinkCopied}
          copyOnboardingLink={copyOnboardingLink}
          ensureOnboardingMutation={ensureOnboardingMutation}
          markReviewedMutation={markReviewedMutation}
          approveDeploymentMutation={approveDeploymentMutation}
          setMagicLinkConfirm={setMagicLinkConfirm}
          sendMagicLinkMutation={sendMagicLinkMutation}
          resetPasswordMutation={resetPasswordMutation}
        />
        {magicLinkDialog}
      </>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-extrabold text-primary">Staff</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <Button onClick={() => setCreateOpen(true)} className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold rounded-xl gap-2">
              <UserPlus className="w-5 h-5" />
              Create Account
            </Button>
            <Button variant="outline" onClick={() => setInviteOpen(true)} className="font-bold rounded-xl gap-2">
              <Mail className="w-4 h-4" />
              Invite
            </Button>
          </div>
        )}
      </div>

      {/* Staff Cards */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : staff.length === 0 ? (
        <div className="bg-card rounded-2xl shadow-md p-6 text-center text-muted-foreground">No staff members yet. Invite your first team member!</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {staff.map((m) => (
            <StaffCard key={m.id} member={m} perfBadges={perfBadges} onboardingStatuses={onboardingStatuses}
              isAdmin={isAdmin} onSelect={() => setSelectedStaff(m)} onEdit={(e) => { e.stopPropagation(); openEdit(m); }}
              onRemove={(e) => { e.stopPropagation(); setRemoveMember(m); }}
              onSendMagicLink={(e) => { e.stopPropagation(); setMagicLinkConfirm(m); }} />
          ))}
        </div>
      )}

      {/* Time tracking section */}
      {isAdmin && <AdminTimeView />}

      {/* Create Account Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Create Staff Account</DialogTitle>
            <DialogDescription>Create a new account with login credentials. Share the password with the staff member.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Full Name *</Label>
              <Input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div>
              <Label>Email *</Label>
              <Input type="email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} placeholder="staff@example.com" />
            </div>
            <div>
              <Label>Temporary Password *</Label>
              <Input type="text" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} placeholder="Min 6 characters" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={createPhone} onChange={(e) => setCreatePhone(e.target.value)} placeholder="0412 345 678" />
            </div>
            <div>
              <Label>Role *</Label>
              <Select value={createRole} onValueChange={(v) => setCreateRole(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cleaner">Cleaner</SelectItem>
                  <SelectItem value="head_cleaner">Head Cleaner</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!createEmail || !createName || !createPassword || createPassword.length < 6 || createMutation.isPending}
              className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold gap-2"
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Invite Staff Member</DialogTitle>
            <DialogDescription>They'll receive an SMS with their onboarding form link.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Full Name *</Label>
              <Input value={invName} onChange={(e) => setInvName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div>
              <Label>Phone *</Label>
              <Input value={invPhone} onChange={(e) => setInvPhone(e.target.value)} placeholder="0412 345 678" type="tel" />
            </div>
            <div>
              <Label>Email *</Label>
              <Input type="email" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} placeholder="staff@example.com" />
            </div>
            <div>
              <Label>Role *</Label>
              <Select value={invRole} onValueChange={(v) => setInvRole(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cleaner">Cleaner</SelectItem>
                  <SelectItem value="head_cleaner">Head Cleaner</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={() => inviteMutation.mutate()} disabled={!invEmail || !invName || !invPhone.trim() || inviteMutation.isPending} className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold gap-2">
              {inviteMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editMember} onOpenChange={(o) => !o && setEditMember(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Edit Staff Member</DialogTitle>
            <DialogDescription>Update {editMember?.full_name || 'staff member'} details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Full Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={editRole} onValueChange={(v) => setEditRole(v as AppRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cleaner">Cleaner</SelectItem>
                  <SelectItem value="head_cleaner">Head Cleaner</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Employment Type</Label>
              <Select value={editEmploymentType} onValueChange={setEditEmploymentType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="contractor">Contractor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="border-t pt-4">
              <Label className="flex items-center gap-1.5"><Key className="w-4 h-4" /> Set / Reset Password</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="text"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="New password (min 6 chars)"
                />
                <Button
                  variant="secondary"
                  onClick={() => setPasswordMutation.mutate()}
                  disabled={!editPassword || editPassword.length < 6 || setPasswordMutation.isPending}
                  className="font-bold whitespace-nowrap"
                >
                  {setPasswordMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                  Update
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Sets the password immediately. Share it securely with the staff member so they can log in.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMember(null)}>Cancel</Button>
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} className="bg-primary text-primary-foreground font-bold gap-2">
              {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Confirm */}
      <AlertDialog open={!!removeMember} onOpenChange={(o) => !o && setRemoveMember(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeMember?.full_name || 'staff member'}?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete their account and all associated data. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => removeMember && removeMutation.mutate(removeMember.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {removeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Magic Link dialog (shared with detail view — defined above the early return) */}
      {magicLinkDialog}
    </div>
  );
}

// ─── Staff Card with Active Status ───
function StaffCard({ member: m, perfBadges, onboardingStatuses, isAdmin, onSelect, onEdit, onRemove, onSendMagicLink }: {
  member: StaffMember; perfBadges: any; onboardingStatuses: any; isAdmin: boolean;
  onSelect: () => void; onEdit: (e: React.MouseEvent) => void; onRemove: (e: React.MouseEvent) => void;
  onSendMagicLink: (e: React.MouseEvent) => void;
}) {
  const { data: activeStatus } = useCleanerActiveStatus(m.id);
  const isCleanerRole = m.role === 'cleaner' || m.role === 'head_cleaner';

  return (
    <div className="bg-card rounded-2xl shadow-md p-5 flex flex-col gap-3 border border-border cursor-pointer hover:border-primary/30 transition-colors" onClick={onSelect}>
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-bold text-lg text-foreground">{m.full_name || 'No name'}</h3>
          <Badge className={`mt-1 ${roleBadgeStyles[m.role]}`}>{roleLabels[m.role]}</Badge>
          {isCleanerRole && activeStatus && (
            <Badge className={`mt-1 text-[10px] ${activeStatus.active ? 'bg-brightly/10 text-brightly' : 'bg-[rgba(248,113,113,0.15)] text-[#F87171]'}`}>
              {activeStatus.active ? '● Active' : '● Inactive'}
            </Badge>
          )}
          {perfBadges[m.id] && perfBadges[m.id].badge !== '—' && (
            <Badge className={`mt-1 text-[10px] ${perfBadges[m.id].badgeColor}`}>{perfBadges[m.id].badge}</Badge>
          )}
          {onboardingStatuses[m.id]?.submitted && !onboardingStatuses[m.id]?.reviewed && (
            <Badge className="mt-1 text-[10px] bg-[rgba(251,191,36,0.15)] text-[#FCD34D]">⚠ Action Needed</Badge>
          )}
          {!onboardingStatuses[m.id] && (
            <Badge className="mt-1 text-[10px] bg-muted text-muted-foreground">No onboarding</Badge>
          )}
          {onboardingStatuses[m.id]?.status === 'pending' && (
            <Badge className="mt-1 text-[10px] bg-[rgba(96,165,250,0.15)] text-[#60A5FA]">Pending form</Badge>
          )}
        </div>
        <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground font-bold text-lg">
          {(m.full_name || '?')[0].toUpperCase()}
        </div>
      </div>

      <div className="space-y-1 text-sm text-muted-foreground">
        {m.email && <div className="flex items-center gap-2"><Mail className="w-4 h-4" />{m.email}</div>}
        {m.phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4" />{m.phone}</div>}
      </div>

      {isCleanerRole && activeStatus && !activeStatus.active && (
        <p className="text-xs text-destructive">{activeStatus.reason}</p>
      )}

      {isAdmin && (
        <div className="flex flex-wrap gap-2 mt-auto pt-2">
          <Button size="sm" className="flex-1 gap-1 rounded-xl bg-brightly hover:bg-brightly-hover text-white text-xs"
            disabled={!m.phone}
            title={!m.phone ? 'No phone on file' : `Send login link to ${m.phone}`}
            onClick={onSendMagicLink}>
            <Link2 className="w-3.5 h-3.5" /> Login Link
          </Button>
          <Button variant="outline" size="sm" className="flex-1 gap-1 rounded-xl" onClick={onEdit}>
            <Pencil className="w-4 h-4" /> Edit
          </Button>
          <Button variant="outline" size="sm" className="gap-1 rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10" onClick={onRemove}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Paperwork Checklist Items ───
const PAPERWORK_ITEMS = [
  { key: 'police_check', label: 'Police Check' },
  { key: 'tax_file_number', label: 'Tax File Number' },
  { key: 'bank_details', label: 'Bank Details' },
  { key: 'signed_contract', label: 'Signed Employment Contract' },
  { key: 'wwcc', label: 'Working With Children Check' },
];

// ─── Staff Detail View (tabbed) ───
function StaffDetailView({ staff, isAdmin, onBack, onboardingStatuses, getOnboardingLink, onboardingLinkCopied, copyOnboardingLink, ensureOnboardingMutation, markReviewedMutation, approveDeploymentMutation, setMagicLinkConfirm, sendMagicLinkMutation, resetPasswordMutation }: {
  staff: StaffMember;
  isAdmin: boolean;
  onBack: () => void;
  onboardingStatuses: any;
  getOnboardingLink: (id: string) => string | null;
  onboardingLinkCopied: string;
  copyOnboardingLink: (id: string) => void;
  ensureOnboardingMutation: any;
  markReviewedMutation: any;
  approveDeploymentMutation: any;
  setMagicLinkConfirm: (m: StaffMember) => void;
  sendMagicLinkMutation: any;
  resetPasswordMutation: any;
}) {
  const queryClient = useQueryClient();
  const obStatus = onboardingStatuses[staff.id];
  const staffName = staff.full_name || 'Staff';

  // Fetch jobs for clean history
  const { data: staffJobs = [] } = useQuery({
    queryKey: ['staff-jobs', staff.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('id, scheduled_date, scheduled_time, status, clean_type, property_id, feedback_score, clock_on, clock_off, properties(property_name, address)')
        .or(`cleaner_1_id.eq.${staff.id},cleaner_2_id.eq.${staff.id}`)
        .order('scheduled_date', { ascending: false });
      return data || [];
    },
  });

  // Performance stats
  const completedCleans = staffJobs.filter((j: any) => j.status === 'complete' || j.status === 'completed');
  const scores = completedCleans.map((j: any) => j.feedback_score).filter(Boolean) as number[];
  const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '—';

  // Total hours from clock_on/clock_off
  const totalMinutes = completedCleans.reduce((sum: number, j: any) => {
    if (j.clock_on && j.clock_off) {
      const diff = (new Date(j.clock_off).getTime() - new Date(j.clock_on).getTime()) / 60000;
      return sum + Math.max(0, diff);
    }
    return sum;
  }, 0);
  const totalHours = (totalMinutes / 60).toFixed(1);

  // SOPs for inductions
  const { data: sops = [] } = useQuery({
    queryKey: ['sop-documents'],
    queryFn: async () => {
      const { data } = await supabase.from('sop_documents' as any).select('*').order('name');
      return (data as any[]) || [];
    },
  });

  // Paperwork status
  const { data: staffProfile } = useQuery({
    queryKey: ['staff-profile-detail', staff.id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', staff.id).single();
      return data;
    },
  });

  const paperworkStatus: Record<string, boolean> = (staffProfile as any)?.paperwork_status || {};

  const savePaperworkMutation = useMutation({
    mutationFn: async (updated: Record<string, boolean>) => {
      const { error } = await supabase.from('profiles').update({ paperwork_status: updated } as any).eq('id', staff.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Paperwork updated');
      queryClient.invalidateQueries({ queryKey: ['staff-profile-detail', staff.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePaperwork = (key: string) => {
    const updated = { ...paperworkStatus, [key]: !paperworkStatus[key] };
    savePaperworkMutation.mutate(updated);
  };

  // Hourly rate and pay
  const hourlyRate = (staffProfile as any)?.hourly_rate || 45;

  // Current pay period hours (this fortnight)
  const now = new Date();
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);
  const payPeriodJobs = completedCleans.filter((j: any) => new Date(j.scheduled_date + 'T00:00:00') >= twoWeeksAgo);
  const payPeriodMinutes = payPeriodJobs.reduce((sum: number, j: any) => {
    if (j.clock_on && j.clock_off) {
      const diff = (new Date(j.clock_off).getTime() - new Date(j.clock_on).getTime()) / 60000;
      return sum + Math.max(0, diff);
    }
    return sum;
  }, 0);
  const payPeriodHours = (payPeriodMinutes / 60).toFixed(1);
  const estimatedPay = (parseFloat(payPeriodHours) * hourlyRate).toFixed(2);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to Staff
        </Button>
      </div>

      {/* Profile header */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground font-bold text-2xl">
          {(staff.full_name || '?')[0].toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-primary">{staff.full_name || 'No name'}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge className={roleBadgeStyles[staff.role]}>{roleLabels[staff.role]}</Badge>
            {obStatus?.directorApproved && <Badge className="bg-brightly/10 text-brightly">Director Approved</Badge>}
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full grid grid-cols-6 bg-muted rounded-xl">
          <TabsTrigger value="overview" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-[10px] sm:text-xs">Overview</TabsTrigger>
          <TabsTrigger value="inductions" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-[10px] sm:text-xs">Inductions</TabsTrigger>
          <TabsTrigger value="paperwork" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-[10px] sm:text-xs">Paperwork</TabsTrigger>
          <TabsTrigger value="history" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-[10px] sm:text-xs">History</TabsTrigger>
          <TabsTrigger value="availability" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-[10px] sm:text-xs">Availability</TabsTrigger>
          <TabsTrigger value="pay" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-[10px] sm:text-xs">Pay</TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          {/* Editable Profile Details — admin can update inline */}
          {isAdmin && <EditableProfileSection staffId={staff.id} staff={staff} onSaved={() => onBack()} />}

          <div className="bg-card rounded-2xl shadow-md p-5 space-y-3">
            {!isAdmin && staff.email && <p className="text-sm text-muted-foreground flex items-center gap-2"><Mail className="w-4 h-4" /> {staff.email}</p>}
            {!isAdmin && staff.phone && <p className="text-sm text-muted-foreground flex items-center gap-2"><Phone className="w-4 h-4" /> {staff.phone}</p>}

            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border">
              <div>
                <span className="text-xs text-muted-foreground">Avg QC Score</span>
                <p className="font-bold text-lg text-primary">{avgScore}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Total Cleans</span>
                <p className="font-bold text-lg text-foreground">{completedCleans.length}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Total Hours</span>
                <p className="font-bold text-lg text-foreground">{totalHours}h</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Status</span>
                <p className="font-bold text-lg text-foreground">
                  {obStatus?.directorApproved ? 'Active' : obStatus?.submitted ? 'Pending Approval' : 'Onboarding'}
                </p>
              </div>
            </div>

            {/* Login & Password Management */}
            {isAdmin && (
              <div className="border-t pt-3 mt-3 space-y-2">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1"><Key className="w-4 h-4" /> Login Management</h3>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" className="gap-1 rounded-xl bg-brightly hover:bg-brightly-hover text-white"
                    disabled={!staff.phone || sendMagicLinkMutation.isPending}
                    onClick={() => setMagicLinkConfirm(staff)}
                    title={!staff.phone ? 'No phone on file' : undefined}>
                    {sendMagicLinkMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Phone className="w-3.5 h-3.5" />}
                    Send Login Link
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1 rounded-xl"
                    disabled={resetPasswordMutation.isPending}
                    onClick={() => staff.email && resetPasswordMutation.mutate(staff.email)}>
                    {resetPasswordMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                    Send Reset Email
                  </Button>
                </div>
              </div>
            )}

            {/* Onboarding status actions (no link generation — handled during invite) */}
            {isAdmin && (obStatus?.submitted || obStatus?.reviewed || obStatus?.directorApproved) && (
              <div className="border-t pt-3 mt-3 space-y-2">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1"><FileCheck className="w-4 h-4" /> Onboarding Status</h3>
                {obStatus?.submitted && !obStatus.reviewed && (
                  <Button size="sm" className="gap-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white"
                    disabled={markReviewedMutation.isPending}
                    onClick={() => markReviewedMutation.mutate(staff.id)}>
                    {markReviewedMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Mark as Reviewed
                  </Button>
                )}
                {obStatus?.reviewed && !obStatus.directorApproved && (
                  <Button size="sm" className="gap-1 rounded-xl bg-brightly hover:bg-brightly-hover text-white"
                    disabled={approveDeploymentMutation.isPending}
                    onClick={() => approveDeploymentMutation.mutate(staff.id)}>
                    {approveDeploymentMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Approve for Deployment
                  </Button>
                )}
              </div>
            )}
          </div>

          <CleanerScorecard staffId={staff.id} staffName={staffName} />
        </TabsContent>

        {/* INDUCTIONS TAB */}
        <TabsContent value="inductions" className="space-y-4 mt-4">
          <StaffOnboardingSection staffId={staff.id} staffName={staffName} />
          {sops.length > 0 && (
            <div className="bg-card rounded-2xl shadow-md p-5">
              <h3 className="font-bold text-foreground mb-3 flex items-center gap-2"><FileCheck className="w-4 h-4" /> SOPs</h3>
              <div className="space-y-2">
                {sops.map((sop: any) => (
                  <div key={sop.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{sop.name}</p>
                      <p className="text-xs text-muted-foreground">v{sop.version || '1.0'}</p>
                    </div>
                    <span className="text-muted-foreground text-xs">—</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* PAPERWORK TAB */}
        <TabsContent value="paperwork" className="space-y-4 mt-4">
          <StaffOnboardingDataView staffId={staff.id} />
          <div className="bg-card rounded-2xl shadow-md p-5">
            <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><FileCheck className="w-4 h-4" /> Required Documents</h3>
            <div className="space-y-3">
              {PAPERWORK_ITEMS.map(item => (
                <PaperworkItemRow
                  key={item.key}
                  itemKey={item.key}
                  label={item.label}
                  checked={!!paperworkStatus[item.key]}
                  onToggle={() => isAdmin && togglePaperwork(item.key)}
                  isAdmin={isAdmin}
                  staffId={staff.id}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              {Object.values(paperworkStatus).filter(Boolean).length}/{PAPERWORK_ITEMS.length} documents received
            </p>
          </div>
        </TabsContent>

        {/* CLEAN HISTORY TAB */}
        <TabsContent value="history" className="space-y-4 mt-4">
          <div className="bg-card rounded-2xl shadow-md p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-foreground flex items-center gap-2"><Clock className="w-4 h-4" /> Clean History</h3>
              <Badge className="bg-primary/10 text-primary">Avg QC: {avgScore}</Badge>
            </div>
            {staffJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No cleans recorded.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {staffJobs.slice(0, 50).map((job: any) => {
                  const propName = (job as any).properties?.property_name || 'Property';
                  const duration = job.clock_on && job.clock_off
                    ? ((new Date(job.clock_off).getTime() - new Date(job.clock_on).getTime()) / 3600000).toFixed(1)
                    : null;
                  return (
                    <div key={job.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 text-sm">
                      <div>
                        <p className="font-semibold text-foreground">{format(new Date(job.scheduled_date + 'T00:00:00'), 'dd MMM yyyy')}</p>
                        <p className="text-xs text-muted-foreground">{propName} — {job.clean_type || 'Clean'}</p>
                      </div>
                      <div className="flex items-center gap-3 text-right">
                        {duration && <span className="text-xs text-muted-foreground">{duration}h</span>}
                        {job.feedback_score && (
                          <span className={`text-xs font-bold ${job.feedback_score >= 4 ? 'text-primary' : job.feedback_score >= 3 ? 'text-orange-500' : 'text-destructive'}`}>
                            {job.feedback_score}/5
                          </span>
                        )}
                        <Badge className={`text-[10px] ${
                          job.status === 'complete' || job.status === 'completed' ? 'bg-brightly/10 text-brightly' :
                          job.status === 'scheduled' ? 'bg-[rgba(96,165,250,0.15)] text-[#60A5FA]' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {job.status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-3">Total hours: {totalHours}h across {completedCleans.length} cleans</p>
          </div>
        </TabsContent>

        {/* AVAILABILITY TAB */}
        <TabsContent value="availability" className="space-y-4 mt-4">
          <StaffAvailabilitySection staffId={staff.id} staffName={staffName} />
        </TabsContent>

        {/* PAY TAB */}
        <TabsContent value="pay" className="space-y-4 mt-4">
          <div className="bg-card rounded-2xl shadow-md p-5 space-y-4">
            <h3 className="font-bold text-foreground flex items-center gap-2"><DollarSign className="w-4 h-4" /> Pay Summary</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-muted-foreground">Hours This Period</span>
                <p className="font-bold text-lg text-foreground">{payPeriodHours}h</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Hourly Rate</span>
                <p className="font-bold text-lg text-foreground">${hourlyRate}/hr</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Estimated Pay</span>
                <p className="font-bold text-lg text-primary">${estimatedPay}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Pay Period</span>
                <p className="font-bold text-sm text-muted-foreground">Last 14 days</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground italic">Payroll processed via external system</p>
          </div>
          <StaffPaySection staffId={staff.id} staffName={staffName} />
          <StaffPayRatesSection staffId={staff.id} staffName={staffName} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Editable Profile Section (Overview tab) ───
function EditableProfileSection({ staffId, staff, onSaved }: { staffId: string; staff: any; onSaved: () => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState(staff.full_name || '');
  const [email, setEmail] = useState(staff.email || '');
  const [phone, setPhone] = useState(staff.phone || '');
  const [address, setAddress] = useState('');
  const [abn, setAbn] = useState('');

  // Load address + ABN from cleaner_onboarding (not on profiles table)
  const { data: onboardingData } = useQuery({
    queryKey: ['staff-onboarding-profile', staffId],
    queryFn: async () => {
      const { data } = await supabase.from('staff_onboarding' as any).select('address, abn').eq('user_id', staffId).maybeSingle();
      return data as any;
    },
  });

  // Sync loaded data
  useState(() => {
    if (onboardingData?.address) setAddress(onboardingData.address);
    if (onboardingData?.abn) setAbn(onboardingData.abn);
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      // Update profiles table (phone, email, full_name)
      const { error: profErr } = await supabase.from('profiles').update({
        full_name: fullName || null,
        email: email || null,
        phone: phone || null,
      }).eq('id', staffId);
      if (profErr) throw profErr;

      // Update staff_onboarding (address, ABN) if the row exists
      if (onboardingData) {
        await supabase.from('staff_onboarding' as any).update({
          address: address || null,
          abn: abn || null,
        } as any).eq('user_id', staffId);
      }

      toast.success('Profile updated');
      queryClient.invalidateQueries({ queryKey: ['staff-list'] });
      queryClient.invalidateQueries({ queryKey: ['staff-onboarding-profile', staffId] });
      setEditing(false);
    } catch (e: any) {
      toast.error(e.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="bg-card rounded-2xl shadow-md p-5 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-foreground text-sm">Contact Details</h3>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="gap-1 text-xs">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-1.5 text-sm">
          {staff.email && <p className="text-muted-foreground flex items-center gap-2"><Mail className="w-4 h-4 shrink-0" /> {staff.email}</p>}
          {staff.phone && <p className="text-muted-foreground flex items-center gap-2"><Phone className="w-4 h-4 shrink-0" /> {staff.phone}</p>}
          {(onboardingData?.address || address) && <p className="text-muted-foreground flex items-center gap-2"><MapPin className="w-4 h-4 shrink-0" /> {onboardingData?.address || address}</p>}
          {(onboardingData?.abn || abn) && <p className="text-muted-foreground flex items-center gap-2"><FileCheck className="w-4 h-4 shrink-0" /> ABN: {onboardingData?.abn || abn}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl shadow-md p-5 space-y-3">
      <h3 className="font-bold text-foreground text-sm">Edit Contact Details</h3>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-xs font-bold text-muted-foreground">Full Name</Label>
          <Input value={fullName} onChange={e => setFullName(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs font-bold text-muted-foreground">Email</Label>
          <Input value={email} onChange={e => setEmail(e.target.value)} type="email" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs font-bold text-muted-foreground">Phone</Label>
          <Input value={phone} onChange={e => setPhone(e.target.value)} type="tel" className="mt-1" />
        </div>
        <div className="col-span-2">
          <Label className="text-xs font-bold text-muted-foreground">Address</Label>
          <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="e.g. 42 Smith St, Gold Coast QLD" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs font-bold text-muted-foreground">ABN</Label>
          <Input value={abn} onChange={e => setAbn(e.target.value)} placeholder="e.g. 12 345 678 901" className="mt-1" />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
        <Button size="sm" onClick={handleSave} disabled={saving} className="bg-brightly hover:bg-brightly-hover text-white">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
          Save
        </Button>
      </div>
    </div>
  );
}

// ─── Paperwork Item with Upload ───
function PaperworkItemRow({ itemKey, label, checked, onToggle, isAdmin, staffId }: {
  itemKey: string; label: string; checked: boolean; onToggle: () => void; isAdmin: boolean; staffId: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Check if a document was already uploaded for this item
  const { data: existingDoc } = useQuery({
    queryKey: ['paperwork-doc', staffId, itemKey],
    queryFn: async () => {
      const { data } = await supabase.from('job_photos' as any)
        .select('public_url')
        .eq('job_id', staffId)
        .eq('room_label', `paperwork_${itemKey}`)
        .maybeSingle();
      return (data as any)?.public_url || null;
    },
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split('.').pop() || 'pdf';
    const path = `staff-documents/paperwork/${staffId}/${itemKey}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('staff-documents').upload(path, file, { contentType: file.type });
    if (error) {
      toast.error('Upload failed: ' + error.message);
      setUploading(false);
      e.target.value = '';
      return;
    }
    const { data: urlData } = supabase.storage.from('staff-documents').getPublicUrl(path);
    setDocUrl(urlData.publicUrl);

    // Store reference
    await supabase.from('job_photos' as any).insert({
      job_id: staffId,
      storage_path: path,
      public_url: urlData.publicUrl,
      room_label: `paperwork_${itemKey}`,
    });

    // Auto-check the paperwork item
    if (!checked) onToggle();

    toast.success(`${label} uploaded`);
    setUploading(false);
    e.target.value = '';
  };

  const url = docUrl || existingDoc;

  return (
    <div className="flex items-center gap-3">
      <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx" className="hidden" onChange={handleUpload} />
      <Checkbox checked={checked} onCheckedChange={onToggle} disabled={!isAdmin} />
      <span className={`text-sm flex-1 ${checked ? 'text-foreground' : 'text-muted-foreground'}`}>
        {label}
      </span>
      {url ? (
        <a href={url} target="_blank" rel="noopener" className="text-xs text-primary underline">View</a>
      ) : null}
      {isAdmin && (
        <Button variant="ghost" size="sm" className="gap-1 text-xs h-7 px-2" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
          {url ? 'Replace' : 'Upload'}
        </Button>
      )}
      {checked && <CheckCircle2 className="w-4 h-4 text-brightly shrink-0" />}
    </div>
  );
}
