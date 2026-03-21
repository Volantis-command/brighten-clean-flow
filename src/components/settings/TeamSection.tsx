import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { UserPlus, Pencil, Loader2, Mail, Phone } from 'lucide-react';
import { toast } from 'sonner';

type AppRole = 'admin' | 'head_cleaner' | 'cleaner' | 'client';

interface StaffMember {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: AppRole;
}

const roleLabels: Record<AppRole, string> = {
  admin: 'Admin',
  head_cleaner: 'Head Cleaner',
  cleaner: 'Cleaner',
};

const roleBadgeStyles: Record<AppRole, string> = {
  admin: 'bg-primary text-primary-foreground',
  head_cleaner: 'bg-accent text-accent-foreground',
  cleaner: 'bg-secondary text-secondary-foreground',
};

function useStaffList() {
  return useQuery({
    queryKey: ['staff-list'],
    queryFn: async () => {
      const { data: roles, error: rolesErr } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .neq('role', 'client');
      if (rolesErr) throw rolesErr;
      if (!roles?.length) return [];

      const userIds = roles.map((r) => r.user_id);
      const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone')
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

export default function TeamSection() {
  const queryClient = useQueryClient();
  const { data: staff = [], isLoading } = useStaffList();

  const [createOpen, setCreateOpen] = useState(false);
  const [editMember, setEditMember] = useState<StaffMember | null>(null);

  // Create form
  const [createEmail, setCreateEmail] = useState('');
  const [createName, setCreateName] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createRole, setCreateRole] = useState<AppRole>('cleaner');
  const [createPassword, setCreatePassword] = useState('');

  // Edit form
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState<AppRole>('cleaner');

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

  const updateMutation = useMutation({
    mutationFn: () =>
      invokeFn({ action: 'update_role', user_id: editMember!.id, role: editRole, full_name: editName, phone: editPhone }),
    onSuccess: () => {
      toast.success('Staff member updated');
      queryClient.invalidateQueries({ queryKey: ['staff-list'] });
      queryClient.invalidateQueries({ queryKey: ['cleaners-list'] });
      setEditMember(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (m: StaffMember) => {
    setEditMember(m);
    setEditName(m.full_name || '');
    setEditPhone(m.phone || '');
    setEditRole(m.role);
  };

  const activeCount = staff.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-primary">Team</h2>
          <p className="text-sm text-muted-foreground">{activeCount} active staff member{activeCount !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold rounded-xl gap-2">
          <UserPlus className="w-5 h-5" />
          Add Staff
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : staff.length === 0 ? (
        <div className="bg-card rounded-2xl shadow-md p-6 text-center text-muted-foreground">No staff members yet.</div>
      ) : (
        <div className="space-y-2">
          {staff.map((m) => (
            <div key={m.id} className="bg-card rounded-xl shadow-sm p-4 flex items-center justify-between border border-border">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-primary" />
                <div>
                  <div className="font-semibold text-foreground">{m.full_name || 'No name'}</div>
                  <div className="text-sm text-muted-foreground flex items-center gap-3">
                    {m.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{m.email}</span>}
                    {m.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{m.phone}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={roleBadgeStyles[m.role]}>{roleLabels[m.role]}</Badge>
                <Button variant="ghost" size="sm" onClick={() => openEdit(m)}>
                  <Pencil className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Add Staff Member</DialogTitle>
            <DialogDescription>Create a new account with login credentials.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Full Name *</Label><Input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="Jane Doe" /></div>
            <div><Label>Email *</Label><Input type="email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} placeholder="staff@example.com" /></div>
            <div><Label>Temporary Password *</Label><Input type="text" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} placeholder="Min 6 characters" /></div>
            <div><Label>Phone</Label><Input value={createPhone} onChange={(e) => setCreatePhone(e.target.value)} placeholder="0412 345 678" /></div>
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

      {/* Edit Dialog */}
      <Dialog open={!!editMember} onOpenChange={(o) => !o && setEditMember(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Edit Staff Member</DialogTitle>
            <DialogDescription>Update {editMember?.full_name || 'staff member'} details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Full Name</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} /></div>
            <div><Label>Phone</Label><Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} /></div>
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
    </div>
  );
}
