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
import { StaffOnboardingSection, useStaffOnboardingStatuses, useCleanerActiveStatus } from '@/components/staff/StaffOnboardingSection';
import CleanerScorecard from '@/components/staff/CleanerScorecard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { UserPlus, Pencil, Trash2, Phone, Mail, Loader2, ArrowLeft, Key, Link2, Copy, CheckCircle2, Clock, Calendar, FileCheck, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
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
            await supabase.functions.invoke('send-job-sms', {
              body: { to: data.phone, message: `Hi ${firstName}, welcome to Brightly! 🌿 Complete your onboarding here: ${link}` },
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

  // Selected staff detail view
  if (selectedStaff) {
    return (
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

      {/* Send Magic Link Confirm Dialog */}
      <AlertDialog open={!!magicLinkConfirm} onOpenChange={(o) => { if (!o) setMagicLinkConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Login Link</AlertDialogTitle>
            <AlertDialogDescription>
              Send a one-tap login link to {magicLinkConfirm?.full_name} via SMS?
              {magicLinkConfirm?.phone ? ` (${magicLinkConfirm.phone})` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => magicLinkConfirm && sendMagicLinkMutation.mutate(magicLinkConfirm)}
              disabled={!magicLinkConfirm?.phone || sendMagicLinkMutation.isPending}
              className="bg-brightly hover:bg-brightly-hover text-white font-bold gap-2"
            >
              {sendMagicLinkMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Send Login Link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
            <Badge className={`mt-1 text-[10px] ${activeStatus.active ? 'bg-brightly/10 text-brightly' : 'bg-red-100 text-red-800'}`}>
              {activeStatus.active ? '● Active' : '● Inactive'}
            </Badge>
          )}
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
          <div className="bg-card rounded-2xl shadow-md p-5 space-y-3">
            {staff.email && <p className="text-sm text-muted-foreground flex items-center gap-2"><Mail className="w-4 h-4" /> {staff.email}</p>}
            {staff.phone && <p className="text-sm text-muted-foreground flex items-center gap-2"><Phone className="w-4 h-4" /> {staff.phone}</p>}

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

            {/* Onboarding Link */}
            {isAdmin && (
              <div className="border-t pt-3 mt-3 space-y-2">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1"><Link2 className="w-4 h-4" /> Onboarding Link</h3>
                {obStatus?.token ? (
                  <div className="flex items-center gap-2">
                    <Input readOnly value={getOnboardingLink(staff.id) || ''} className="text-xs h-8 font-mono" />
                    <Button variant="outline" size="sm" onClick={() => copyOnboardingLink(staff.id)} className="shrink-0 gap-1">
                      {onboardingLinkCopied === staff.id ? <CheckCircle2 className="w-4 h-4 text-brightly" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="gap-1 rounded-xl"
                    disabled={ensureOnboardingMutation.isPending}
                    onClick={() => ensureOnboardingMutation.mutate(staff)}>
                    {ensureOnboardingMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                    Generate Onboarding Link
                  </Button>
                )}
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
          <div className="bg-card rounded-2xl shadow-md p-5">
            <h3 className="font-bold text-foreground mb-4 flex items-center gap-2"><FileCheck className="w-4 h-4" /> Required Documents</h3>
            <div className="space-y-3">
              {PAPERWORK_ITEMS.map(item => (
                <div key={item.key} className="flex items-center gap-3">
                  <Checkbox
                    checked={!!paperworkStatus[item.key]}
                    onCheckedChange={() => isAdmin && togglePaperwork(item.key)}
                    disabled={!isAdmin}
                  />
                  <span className={`text-sm ${paperworkStatus[item.key] ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {item.label}
                  </span>
                  {paperworkStatus[item.key] && <CheckCircle2 className="w-4 h-4 text-brightly ml-auto" />}
                </div>
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
                          job.status === 'scheduled' ? 'bg-blue-100 text-blue-800' :
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
