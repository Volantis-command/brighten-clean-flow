import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ReportIssueModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  propertyId: string;
  roomLabels: string[];
}

export function ReportIssueModal({ open, onOpenChange, jobId, propertyId, roomLabels }: ReportIssueModalProps) {
  const { user } = useAuth();
  const [room, setRoom] = useState('');
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const uploadPhoto = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploading(true);
      const fileName = `issues/${jobId}/${Date.now()}.${file.name.split('.').pop() || 'jpg'}`;
      const { error } = await supabase.storage.from('job-photos').upload(fileName, file, { contentType: file.type });
      if (error) { toast.error('Upload failed'); setUploading(false); return; }
      const { data } = supabase.storage.from('job-photos').getPublicUrl(fileName);
      setPhotoUrl(data.publicUrl);
      setUploading(false);
    };
    input.click();
  };

  const handleSubmit = async () => {
    if (!room || !description) { toast.error('Please fill in room and description'); return; }
    setSubmitting(true);

    const { error } = await supabase.from('property_issues' as any).insert({
      job_id: jobId,
      property_id: propertyId,
      room,
      description,
      photo_url: photoUrl || null,
      reported_by: user!.id,
    } as any);

    if (error) { toast.error('Failed to report issue'); setSubmitting(false); return; }

    // Notify admins
    await (await import('@/lib/alerts')).createAlert({
      event_type: 'damage_reported',
      title: 'Issue Reported',
      body: `Issue reported at ${room}: ${description}`,
    });

    toast.success('Issue reported');
    setRoom(''); setDescription(''); setPhotoUrl('');
    onOpenChange(false);
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Report Issue</DialogTitle>
          <DialogDescription>Flag a problem for the property owner and admin.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Room *</Label>
            <Select value={room} onValueChange={setRoom}>
              <SelectTrigger><SelectValue placeholder="Select room" /></SelectTrigger>
              <SelectContent>
                {roomLabels.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Description *</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the issue..." />
          </div>
          <div>
            <Label>Photo</Label>
            <div className="flex items-center gap-3 mt-1">
              {photoUrl ? (
                <img src={photoUrl} alt="Issue" className="w-20 h-20 object-cover rounded-xl" />
              ) : (
                <Button variant="outline" onClick={uploadPhoto} disabled={uploading} className="gap-2">
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                  {uploading ? 'Uploading...' : 'Take Photo'}
                </Button>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting || !room || !description} className="bg-destructive text-destructive-foreground font-bold gap-2">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Report Issue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
