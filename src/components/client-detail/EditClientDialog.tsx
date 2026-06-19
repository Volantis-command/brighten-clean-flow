import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Trash2, Upload } from 'lucide-react';
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
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `client-logos/${clientId}/logo.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('property-photos')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('property-photos').getPublicUrl(path);
      setLogoUrl(`${data.publicUrl}?t=${Date.now()}`);
    } catch (err: any) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
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
              <Label>Client Logo</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }}
              />
              <div className="flex items-center gap-3 mt-1.5">
                {logoUrl
                  ? <img src={logoUrl} alt="Logo" className="h-10 object-contain rounded border border-border bg-muted px-2" />
                  : <div className="h-10 w-20 rounded border border-dashed border-border flex items-center justify-center text-xs text-muted-foreground">No logo</div>
                }
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="gap-1.5"
                >
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {uploading ? 'Uploading…' : logoUrl ? 'Replace' : 'Upload PNG'}
                </Button>
                {logoUrl && (
                  <button type="button" onClick={() => setLogoUrl('')} className="text-xs text-muted-foreground hover:text-destructive">
                    Remove
                  </button>
                )}
              </div>
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
