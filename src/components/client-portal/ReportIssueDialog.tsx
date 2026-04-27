import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface ReportIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  propertyId: string;
  propertyName: string;
}

const ROOMS = [
  'Kitchen', 'Bathroom', 'Bedroom', 'Lounge',
  'Balcony', 'Entry', 'Laundry', 'Outdoor', 'Other',
];

export default function ReportIssueDialog({
  open, onOpenChange, token, propertyId, propertyName,
}: ReportIssueDialogProps) {
  const queryClient = useQueryClient();
  const [room, setRoom] = useState<string>('Other');
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setRoom('Other');
    setDescription('');
    setPhotoUrl('');
  };

  const submit = async () => {
    if (!description.trim()) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('report-property-issue', {
        body: {
          token,
          property_id: propertyId,
          room,
          description: description.trim(),
          photo_url: photoUrl.trim() || null,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Reported — we'll be in touch.");
      reset();
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ['magic-issues', propertyId] });
    } catch (e: any) {
      toast.error(e.message || 'Could not report issue. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) onOpenChange(o); }}>
      <DialogContent className="rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" /> Report an issue
          </DialogTitle>
          <DialogDescription>
            Tell us what's wrong at <span className="font-semibold">{propertyName}</span>. Admin and your cleaner will be notified.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs font-bold uppercase tracking-wide">Room</Label>
            <Select value={room} onValueChange={setRoom}>
              <SelectTrigger className="rounded-xl mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROOMS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs font-bold uppercase tracking-wide">What's the issue?</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="e.g. Glass shower screen is cracked, dishwasher won't drain…"
              className="mt-1 rounded-xl"
            />
          </div>

          <div>
            <Label className="text-xs font-bold uppercase tracking-wide">Photo URL (optional)</Label>
            <input
              type="url"
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              placeholder="https://… (paste a link to a photo)"
              className="w-full mt-1 px-3 py-2 rounded-xl border border-border bg-background text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Tip: open Photos, share, copy link, paste here.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={!description.trim() || submitting} className="gap-1">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
