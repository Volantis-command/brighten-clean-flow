import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { UserPlus, Pencil, Loader2, Mail, Phone, Link2, Copy, Users } from 'lucide-react';
import { toast } from 'sonner';
import { getAppBaseUrl } from '@/lib/appUrl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
  client: 'Client',
};

const roleBadgeStyles: Record<AppRole, string> = {
  admin: 'bg-primary text-primary-foreground',
  head_cleaner: 'bg-accent text-accent-foreground',
  cleaner: 'bg-secondary text-secondary-foreground',
  client: 'bg-[rgba(96,165,250,0.15)] text-[#60A5FA]',
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

function useClientList() {
  return useQuery({
    queryKey: ['client-list'],
    queryFn: async () => {
      const { data: roles, error: rolesErr } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .eq('role', 'client');
      if (rolesErr) throw rolesErr;
      if (!roles?.length) return [];

      const userIds = roles.map((r) => r.user_id);
      const { data: profiles } = await supabase.from('profiles').select('id, full_name, email, phone').in('id', userIds);

      // Fetch client_properties for each
      const { data: clientProps } = await supabase.from('client_properties' as any).select('*').in('client_id', userIds);

      // Fetch property names
      const propIds = [...new Set((clientProps || []).map((cp: any) => cp.property_id))];
      const { data: properties } = propIds.length ? await supabase.from('properties').select('id, property_name').in('id', propIds) : { data: [] };

      const propNameMap: Record<string, string> = {};
      (properties || []).forEach((p: any) => { propNameMap[p.id] = p.property_name; });

      return (profiles || []).map((p) => ({
        ...p,
        role: 'client' as AppRole,
        links: ((clientProps || []) as any[]).filter((cp: any) => cp.client_id === p.id).map((cp: any) => ({
          ...cp,
          property_name: propNameMap[cp.property_id] || 'Unknown',
        })),
      }));
    },
  });
}

export default function TeamSection() {
  const queryClient = useQueryClient();
  const { data: staff = [], isLoading } = useStaffList();
  const { data: clients = [], isLoading: loadingClients } = useClientList();

  const [createOpen, setCreateOpen] = useState(false);
  const [editMember, setEditMember] = useState<StaffMember | null>(null);
  const [activeTab, setActiveTab] = useState('staff');

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
      toast.success(createRole === 'client' ? 'Client account created!' : 'Staff account created!');
      queryClient.invalidateQueries({ queryKey: ['staff-list'] });
      queryClient.invalidateQueries({ queryKey: ['client-list'] });
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
      toast.success('Updated');
      queryClient.invalidateQueries({ queryKey: ['staff-list'] });
      queryClient.invalidateQueries({ queryKey: ['client-list'] });
      queryClient.invalidateQueries({ queryKey: ['cleaners-list'] });
      setEditMember(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setPasswordMutation = useMutation({
    mutationFn: () =>
      invokeFn({ action: 'set_password', user_id: editMember!.id, password: editPassword }),
    onSuccess: () => {
      toast.success('Password updated');
      setEditPassword('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (m: StaffMember) => {
    setEditMember(m);
    setEditName(m.full_name || '');
    setEditPhone(m.phone || '');
    setEditRole(m.role);
    setEditPassword('');
  };

  const copyMagicLink = (token: string) => {
    const url = `${getAppBaseUrl()}/client/${token}`;
    navigator.clipboard.writeText(url);
    toast.success('Magic link copied!');
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="staff">Staff</TabsTrigger>
            <TabsTrigger value="clients">Clients</TabsTrigger>
          </TabsList>
          <Button onClick={() => { setCreateRole(activeTab === 'clients' ? 'client' : 'cleaner'); setCreateOpen(true); }} className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold rounded-xl gap-2">
            <UserPlus className="w-5 h-5" />
            {activeTab === 'clients' ? 'Add Client' : 'Add Staff'}
          </Button>
        </div>

        <TabsContent value="staff">
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
                    <Button variant="ghost" size="sm" onClick={() => openEdit(m)}><Pencil className="w-4 h-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="clients">
          {loadingClients ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : clients.length === 0 ? (
            <div className="bg-card rounded-2xl shadow-md p-6 text-center text-muted-foreground">No clients yet.</div>
          ) : (
            <div className="space-y-3">
              {clients.map((c: any) => (
                <div key={c.id} className="bg-card rounded-xl shadow-sm p-4 border border-border space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-foreground">{c.full_name || 'No name'}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-3">
                        {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>}
                        {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                      </div>
                    </div>
                    <Badge className={roleBadgeStyles.client}>Client</Badge>
                  </div>
                  {c.links?.length > 0 && (
                    <div className="space-y-2">
                      {c.links.map((link: any) => (
                        <div key={link.id} className="flex items-center justify-between bg-muted/50 rounded-lg p-2 text-sm">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{link.property_name}</span>
                            <div className="flex items-center gap-1.5">
                              {link.portal_active && <span className="text-xs text-primary font-bold">Active</span>}
                              {link.guest_ready_sms && <span className="text-xs text-muted-foreground">SMS ✓</span>}
                            </div>
                          </div>
                          {link.portal_token && (
                            <Button variant="ghost" size="sm" onClick={() => copyMagicLink(link.portal_token)} className="gap-1 text-xs">
                              <Copy className="w-3 h-3" /> Magic Link
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{createRole === 'client' ? 'Add Client' : 'Add Staff Member'}</DialogTitle>
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
                  <SelectItem value="client">Client</SelectItem>
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
            <DialogTitle>Edit {editMember?.role === 'client' ? 'Client' : 'Staff Member'}</DialogTitle>
            <DialogDescription>Update {editMember?.full_name || 'member'} details.</DialogDescription>
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
                  <SelectItem value="client">Client</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="border-t pt-4">
              <Label>Set / Reset Password</Label>
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
                  Update Password
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Share the new password securely with the {editMember?.role === 'client' ? 'client' : 'staff member'}.
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
    </div>
  );
}
