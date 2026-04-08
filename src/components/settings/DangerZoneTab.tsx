import DangerZoneSection from './DangerZoneSection';
import { Button } from '@/components/ui/button';
import { Download, ScrollText, Trash2, Loader2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useState } from 'react';

export default function DangerZoneTab() {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const tables = ['jobs', 'properties', 'profiles', 'leads', 'clean_requests', 'job_feedback'];
      const csvParts: string[] = [];

      for (const table of tables) {
        const { data, error } = await supabase.from(table as any).select('*');
        if (error) continue;
        if (!data || (data as any[]).length === 0) continue;
        const rows = data as any[];
        const headers = Object.keys(rows[0]);
        const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))].join('\n');
        csvParts.push(`\n--- ${table.toUpperCase()} ---\n${csv}`);
      }

      const blob = new Blob([csvParts.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `brightly-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Data exported');
    } catch (e: any) {
      toast.error(e.message);
    }
    setExporting(false);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-destructive">Danger Zone</h2>

      <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <Button variant="outline" className="gap-2" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Export All Data (CSV)
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => toast.info('Audit log coming soon')}>
            <ScrollText className="w-4 h-4" /> View Audit Log
          </Button>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="gap-2">
              <Trash2 className="w-4 h-4" /> Delete Account
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Account</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete your account and all associated data. This action cannot be undone. Contact support to proceed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => toast.info('Please contact support to delete your account.')} className="bg-destructive text-destructive-foreground">
                I understand, proceed
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <DangerZoneSection />
    </div>
  );
}
