import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function DangerZoneSection() {
  const [cutoffDate, setCutoffDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [deleting, setDeleting] = useState(false);
  const [preview, setPreview] = useState<{ jobs: number; requests: number } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const previewDeletion = async () => {
    setPreviewLoading(true);
    try {
      const { count: jobCount } = await supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .lt('created_at', cutoffDate + 'T00:00:00Z');

      const { count: reqCount } = await supabase
        .from('clean_requests')
        .select('id', { count: 'exact', head: true })
        .lt('created_at', cutoffDate + 'T00:00:00Z');

      setPreview({ jobs: jobCount || 0, requests: reqCount || 0 });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const clearTestData = async () => {
    setDeleting(true);
    try {
      // Delete job_forms linked to old jobs first
      const { data: oldJobs } = await supabase
        .from('jobs')
        .select('id')
        .lt('created_at', cutoffDate + 'T00:00:00Z');

      const jobIds = (oldJobs || []).map(j => j.id);

      if (jobIds.length > 0) {
        // Delete related records in batches
        for (let i = 0; i < jobIds.length; i += 50) {
          const batch = jobIds.slice(i, i + 50);
          await supabase.from('job_forms').delete().in('job_id', batch);
          await supabase.from('job_acceptances').delete().in('job_id', batch);
          await supabase.from('time_entries').delete().in('job_id', batch);
          await supabase.from('job_feedback').delete().in('job_id', batch);
          await supabase.from('photos').delete().in('job_id', batch);
          await supabase.from('qc_audits').delete().in('job_id', batch);
        }

        // Delete the jobs
        await supabase.from('jobs').delete().lt('created_at', cutoffDate + 'T00:00:00Z');
      }

      // Delete old clean requests
      await supabase.from('clean_requests').delete().lt('created_at', cutoffDate + 'T00:00:00Z');

      toast.success(`Cleared ${jobIds.length} jobs and related data created before ${cutoffDate}`);
      setPreview(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-card rounded-2xl border-2 border-destructive/30 p-6 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-5 h-5 text-destructive" />
        <h3 className="font-bold text-destructive text-lg">Danger Zone</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Permanently delete all jobs, booking requests, and related data created before a specific date.
        This cannot be undone.
      </p>

      <div className="flex items-end gap-3">
        <div className="flex-1 max-w-xs">
          <Label className="text-sm">Delete data created before</Label>
          <Input
            type="date"
            value={cutoffDate}
            onChange={e => { setCutoffDate(e.target.value); setPreview(null); }}
            className="rounded-xl"
          />
        </div>
        <Button variant="outline" onClick={previewDeletion} disabled={previewLoading}>
          {previewLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
          Preview
        </Button>
      </div>

      {preview && (
        <div className="bg-destructive/5 rounded-xl p-4 text-sm space-y-1">
          <p className="font-semibold text-destructive">This will delete:</p>
          <p>• <strong>{preview.jobs}</strong> jobs (and all linked forms, time entries, photos, QC audits, acceptances, feedback)</p>
          <p>• <strong>{preview.requests}</strong> clean requests</p>
        </div>
      )}

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" disabled={!preview || (preview.jobs === 0 && preview.requests === 0)} className="gap-2">
            <Trash2 className="w-4 h-4" /> Clear Test Data
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {preview?.jobs || 0} jobs and {preview?.requests || 0} clean requests
              created before {cutoffDate}, along with all related forms, time entries, photos, and feedback.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={clearTestData} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Yes, delete everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
