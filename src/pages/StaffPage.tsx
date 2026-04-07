import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import AdminTimeView from '@/components/timeclock/AdminTimeView';
import { StaffAvailabilitySection } from '@/components/staff/StaffAvailabilitySection';
import { StaffPaySection } from '@/components/staff/StaffPaySection';
import { StaffPayRatesSection } from '@/components/staff/StaffPayRatesSection';
import { StaffPerformanceSection, useStaffPerformanceBadges } from '@/components/staff/StaffPerformanceSection';
import { StaffOnboardingSection, useStaffOnboardingStatuses } from '@/components/staff/StaffOnboardingSection';
import CleanerScorecard from '@/components/staff/CleanerScorecard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { UserPlus, Pencil, Trash2, Phone, Mail, Loader2, ArrowLeft, Key, Link2, Copy, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { getAppBaseUrl } from '@/lib/appUrl';

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
  const [passwordMember, setPasswordMember] = useState<StaffMember | null>(null);
  const [tempPassword, setTempPassword] = useState('');
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
    mutationFn: () =>
      invokeFn({ action: 'invite', email: invEmail, role: invRole, full_name: invName, phone: invPhone }),
    onSuccess: () => {
      toast.success('Invitation sent!');
      queryClient.invalidateQueries({ queryKey: ['staff-list'] });
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
      // Update role via edge function (has admin privileges for user_roles)
      await invokeFn({ action: 'update_role', user_id: editMember!.id, role: editRole });
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
    mutationFn: () => invokeFn({ action: 'remove', user_id: removeMember!.id }),
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
  };

  const resetPasswordMutation = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success('Password reset email sent!'),
    onError: (e: Error) => toast.error(e.message),
  });

  const setPasswordMutation = useMutation({
    mutationFn: async ({ userId, pw }: { userId: string; pw: string }) => {
      const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
      if (!serviceRoleKey) {
        throw new Error('Password reset requires admin setup — add VITE_SUPABASE_SERVICE_ROLE_KEY to .env, or use Send Reset Email instead');
      }
      const adminClient = createClient(import.meta.env.VITE_SUPABASE_URL, serviceRoleKey);
      const { error } = await adminClient.auth.admin.updateUserById(userId, { password: pw });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Password updated!');
      setPasswordMember(null);
      setTempPassword('');
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

  const ensureOnboardingMutation = useMutation({
    mutationFn: (m: StaffMember) =>
      invokeFn({ action: 'ensure_onboarding', user_id: m.id, full_name: m.full_name, email: m.email }),
    onSuccess: (data: any) => {
      if (data?.token) {
        const link = `${getAppBaseUrl()}/staff-onboarding/${data.token}`;
        navigator.clipboard.writeText(link);
        setOnboardingLinkCopied(data.token);
        toast.success('Onboarding link copied to clipboard!');
        queryClient.invalidateQueries({ queryKey: ['staff-onboarding-statuses'] });
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

  // Selected staff detail view
  if (selectedStaff) {
    const obStatus = onboardingStatuses[selectedStaff.id];
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedStaff(null)} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Back to Staff
          </Button>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground font-bold text-2xl">
            {(selectedStaff.full_name || '?')[0].toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-primary">{selectedStaff.full_name || 'No name'}</h1>
            <Badge className={roleBadgeStyles[selectedStaff.role]}>{roleLabels[selectedStaff.role]}</Badge>
          </div>
        </div>

        <div className="bg-card rounded-2xl shadow-md p-5 space-y-3">
          {selectedStaff.email && <p className="text-sm text-muted-foreground flex items-center gap-2"><Mail className="w-4 h-4" /> {selectedStaff.email}</p>}
          {selectedStaff.phone && <p className="text-sm text-muted-foreground flex items-center gap-2"><Phone className="w-4 h-4" /> {selectedStaff.phone}</p>}

          {/* Login & Password Management */}
          {isAdmin && (
            <div className="border-t pt-3 mt-3 space-y-2">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1"><Key className="w-4 h-4" /> Login Management</h3>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="gap-1 rounded-xl"
                  onClick={() => setPasswordMember(selectedStaff)}>
                  <Key className="w-3.5 h-3.5" /> Set Temp Password
                </Button>
                <Button variant="outline" size="sm" className="gap-1 rounded-xl"
                  disabled={resetPasswordMutation.isPending}
                  onClick={() => selectedStaff.email && resetPasswordMutation.mutate(selectedStaff.email)}>
                  {resetPasswordMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                  Send Reset Email
                </Button>
              </div>
            </div>
          )}

          {/* Onboarding Link */}
          {isAdmin && (
            <div className="border-t pt-3 mt-3 space-y-2">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1"><Link2 className="w-4 h-4" /> Onboarding Link</h3>
              {obStatus?.token ? (
                <div className="flex items-center gap-2">
                  <Input readOnly value={getOnboardingLink(selectedStaff.id) || ''} className="text-xs h-8 font-mono" />
                  <Button variant="outline" size="sm" onClick={() => copyOnboardingLink(selectedStaff.id)} className="shrink-0 gap-1">
                    {onboardingLinkCopied === selectedStaff.id ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="gap-1 rounded-xl"
                  disabled={ensureOnboardingMutation.isPending}
                  onClick={() => ensureOnboardingMutation.mutate(selectedStaff)}>
                  {ensureOnboardingMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                  Generate Onboarding Link
                </Button>
              )}
              {obStatus?.submitted && !obStatus.reviewed && (
                <Button size="sm" className="gap-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white"
                  disabled={markReviewedMutation.isPending}
                  onClick={() => markReviewedMutation.mutate(selectedStaff.id)}>
                  {markReviewedMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  Mark as Reviewed
                </Button>
              )}
            </div>
          )}
        </div>

        <CleanerScorecard staffId={selectedStaff.id} staffName={selectedStaff.full_name || 'Staff'} />
        <StaffOnboardingSection staffId={selectedStaff.id} staffName={selectedStaff.full_name || 'Staff'} />
        <StaffPaySection staffId={selectedStaff.id} staffName={selectedStaff.full_name || 'Staff'} />
        <StaffPayRatesSection staffId={selectedStaff.id} staffName={selectedStaff.full_name || 'Staff'} />
        <StaffPerformanceSection staffId={selectedStaff.id} staffName={selectedStaff.full_name || 'Staff'} />
        <StaffAvailabilitySection staffId={selectedStaff.id} staffName={selectedStaff.full_name || 'Staff'} />
      </div>
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
            <div key={m.id} className="bg-card rounded-2xl shadow-md p-5 flex flex-col gap-3 border border-border cursor-pointer hover:border-primary/30 transition-colors" onClick={() => setSelectedStaff(m)}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-lg text-foreground">{m.full_name || 'No name'}</h3>
                   <Badge className={`mt-1 ${roleBadgeStyles[m.role]}`}>{roleLabels[m.role]}</Badge>
                   {perfBadges[m.id] && perfBadges[m.id].badge !== '—' && (
                     <Badge className={`mt-1 text-[10px] ${perfBadges[m.id].badgeColor}`}>{perfBadges[m.id].badge}</Badge>
                   )}
                   {onboardingStatuses[m.id]?.submitted && !onboardingStatuses[m.id]?.reviewed && (
                     <Badge className="mt-1 text-[10px] bg-amber-100 text-amber-800">⚠ Action Needed</Badge>
                   )}
                   {!onboardingStatuses[m.id] && (
                     <Badge className="mt-1 text-[10px] bg-muted text-muted-foreground">No onboarding</Badge>
                   )}
                   {onboardingStatuses[m.id]?.status === 'pending' && (
                     <Badge className="mt-1 text-[10px] bg-blue-100 text-blue-800">Pending form</Badge>
                   )}
                </div>
                <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground font-bold text-lg">
                  {(m.full_name || '?')[0].toUpperCase()}
                </div>
              </div>

              <div className="space-y-1 text-sm text-muted-foreground">
                {m.email && (
                  <div className="flex items-center gap-2"><Mail className="w-4 h-4" />{m.email}</div>
                )}
                {m.phone && (
                  <div className="flex items-center gap-2"><Phone className="w-4 h-4" />{m.phone}</div>
                )}
              </div>

              {isAdmin && (
                <div className="flex gap-2 mt-auto pt-2">
                  <Button variant="outline" size="sm" className="flex-1 gap-1 rounded-xl" onClick={(e) => { e.stopPropagation(); openEdit(m); }}>
                    <Pencil className="w-4 h-4" /> Edit
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 gap-1 rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); setRemoveMember(m); }}>
                    <Trash2 className="w-4 h-4" /> Remove
                  </Button>
                </div>
              )}
            </div>
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
            <DialogDescription>Send an email invitation to join your team.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Email *</Label>
              <Input type="email" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} placeholder="staff@example.com" />
            </div>
            <div>
              <Label>Full Name</Label>
              <Input value={invName} onChange={(e) => setInvName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={invPhone} onChange={(e) => setInvPhone(e.target.value)} placeholder="0412 345 678" />
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
            <Button onClick={() => inviteMutation.mutate()} disabled={!invEmail || inviteMutation.isPending} className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold gap-2">
              {inviteMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Send Invite
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
            <AlertDialogAction onClick={() => removeMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {removeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Set Temp Password Dialog */}
      <Dialog open={!!passwordMember} onOpenChange={(o) => { if (!o) { setPasswordMember(null); setTempPassword(''); } }}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Set Temporary Password</DialogTitle>
            <DialogDescription>Set a new temporary password for {passwordMember?.full_name}. Share it with them securely.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>New Password *</Label>
              <Input type="text" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} placeholder="Min 6 characters" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPasswordMember(null); setTempPassword(''); }}>Cancel</Button>
            <Button
              onClick={() => passwordMember && setPasswordMutation.mutate({ userId: passwordMember.id, pw: tempPassword })}
              disabled={tempPassword.length < 6 || setPasswordMutation.isPending}
              className="bg-primary text-primary-foreground font-bold gap-2"
            >
              {setPasswordMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Set Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
