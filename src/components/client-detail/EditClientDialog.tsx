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
  onSaved: () => void;
}

export default function EditClientDialog({ open, onOpenChange, clientId, initialName, initialEmail, initialPhone, onSaved }: Props) {
  const navigate = useNavigate();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Sync when dialog opens with new values
  const handleOpenChange = (o: boolean) => {
    if (o) { setName(initialName); setEmail(initialEmail); setPhone(initialPhone); setConfirmDelete(false); }
    onOpenChange(o);
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('profiles')
      .update({ full_name: name, email, phone })
      .eq('id', clientId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Client updated');
    onSaved();
    onOpenChange(false);
  };

  const deleteClient = async () => {
    setDeleting(true);
    // Remove client_properties links
    await supabase.from('client_properties').delete().eq('client_id', clientId);
    // Remove role
    await supabase.from('user_roles').delete().eq('user_id', clientId);
    setDeleting(false);
    toast.success('Client removed');
    navigate('/clients');
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Edit Client</DialogTitle>
          <DialogDescription>Update client details or remove this client.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div><Label>Full Name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
          <div><Label>Email</Label><Input value={email} onChange={e => setEmail(e.target.value)} type="email" /></div>
          <div><Label>Phone</Label><Input value={phone} onChange={e => setPhone(e.target.value)} /></div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          {!confirmDelete ? (
            <Button variant="ghost" className="text-destructive hover:bg-destructive/10 mr-auto" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="w-4 h-4 mr-1" /> Delete Client
            </Button>
          ) : (
            <Button variant="destructive" className="mr-auto" onClick={deleteClient} disabled={deleting}>
              {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Confirm Delete
            </Button>
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
