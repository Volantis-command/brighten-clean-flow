import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  initialName: string;
  initialEmail: string;
  initialPhone: string;
  initialLogoUrl?: string;
  onSaved: () => void;
  clientType?: 'profile' | 'property' | 'qr';
  propertyIds?: string[];
  allowDelete?: boolean;
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    first_name: parts.shift() || null,
    last_name: parts.join(' ') || null,
  };
}

export default function EditClientDialog({
  open,
  onOpenChange,
  clientId,
  initialName,
  initialEmail,
  initialPhone,
  initialLogoUrl = '',
  onSaved,
  clientType = 'profile',
  propertyIds = [],
  allowDelete = clientType === 'profile',
}: Props) {
  const navigate = useNavigate();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone);
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleOpenChange = (o: boolean) => {
    if (o) {
      setName(initialName);
      setEmail(initialEmail);
      setPhone(initialPhone);
      setLogoUrl(initialLogoUrl);
      setConfirmDelete(false);
    }
    onOpenChange(o);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (clientType === 'profile') {
        const { data: roles } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', clientId);

        const roleSet = new Set((roles || []).map((r: any) => r.role));
        const hasStaffRole = ['admin', 'cleaner', 'head_cleaner'].some((role) => roleSet.has(role));

        if (hasStaffRole) {
          throw new Error('This record is linked to a staff account and cannot be edited as a client. Create a separate client account instead.');
        }

        const { error } = await supabase.from('profiles').update({ full_name: name, email, phone, logo_url: logoUrl || null } as any).eq('id', clientId);
        if (error) throw error;
      } else if (clientType === 'property') {
        const targetIds = propertyIds.length ? propertyIds : [clientId];
        const { error } = await supabase
          .from('properties')
          .update({ client_name: name || null, billing_email: email || null, client_phone: phone || null })
          .in('id', targetIds);
        if (error) throw error;
      } else {
        const { first_name, last_name } = splitName(name);
        const { error } = await (supabase.from('quote_requests' as any)
          .update({ first_name, last_name, email: email || null, phone: phone || null })
          .eq('id', clientId) as any);
        if (error) throw error;

        if (propertyIds.length) {
          await supabase
            .from('properties')
            .update({ client_name: name || null, billing_email: email || null, client_phone: phone || null })
            .in('id', propertyIds);
        }
      }

      toast.success('Client updated');
      onSaved();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to update client');
    } finally {
      setSaving(false);
    }
  };

  const deleteClient = async () => {
    setDeleting(true);
    try {
      await supabase.from('client_properties').delete().eq('client_id', clientId);
      await supabase.from('user_roles').delete().eq('user_id', clientId);
      setDeleting(false);
      toast.success('Client removed');
      navigate('/clients');
    } catch (error: any) {
      setDeleting(false);
      toast.error(error.message || 'Failed to remove client');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Edit Client</DialogTitle>
          <DialogDescription>Update client details.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div><Label>Full Name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
          <div><Label>Email</Label><Input value={email} onChange={e => setEmail(e.target.value)} type="email" /></div>
          <div><Label>Phone</Label><Input value={phone} onChange={e => setPhone(e.target.value)} /></div>
          {clientType === 'profile' && (
            <div>
              <Label>Logo URL</Label>
              <Input value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://..." />
              {logoUrl && <img src={logoUrl} alt="Logo preview" className="mt-2 h-8 object-contain" />}
            </div>
          )}
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          {allowDelete && (
            !confirmDelete ? (
              <Button variant="ghost" className="text-destructive hover:bg-destructive/10 mr-auto" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="w-4 h-4 mr-1" /> Delete Client
              </Button>
            ) : (
              <Button variant="destructive" className="mr-auto" onClick={deleteClient} disabled={deleting}>
                {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Confirm Delete
              </Button>
            )
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
