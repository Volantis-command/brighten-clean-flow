// In-app account deletion — required by App Store Guideline 5.1.1(v).
// Two-step confirm (they must type DELETE) so it can't happen by accident,
// and it states plainly what is removed and what is legally retained.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Trash2, AlertTriangle } from 'lucide-react';

export default function DeleteAccountButton({ redirectTo = '/login' }: { redirectTo?: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-my-account');
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      await supabase.auth.signOut();
      toast.success('Your account has been deleted.');
      navigate(redirectTo, { replace: true });
    } catch (e: any) {
      toast.error(e.message || 'Could not delete your account — call 0418 878 707.');
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => { setOpen(true); setConfirmText(''); }}
        className="flex items-center gap-2 text-sm font-bold text-destructive underline"
      >
        <Trash2 className="w-4 h-4" /> Delete my account
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
          <div className="w-full max-w-sm rounded-3xl bg-card p-5 shadow-xl">
            <AlertTriangle className="w-7 h-7 text-destructive" />
            <h3 className="mt-3 text-lg font-extrabold text-foreground">Delete your account?</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              This permanently removes your login and personal details (name, email, phone).
              You won't be able to sign in again.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Completed cleans, photo reports and invoices are kept — they're business and
              tax records we're legally required to retain, and they belong to the property
              rather than to you.
            </p>

            <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Type DELETE to confirm
            </label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
              placeholder="DELETE"
              className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm font-bold tracking-widest outline-none"
            />

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="h-12 flex-1 rounded-xl border border-border text-sm font-bold text-muted-foreground"
              >
                Keep my account
              </button>
              <button
                onClick={remove}
                disabled={busy || confirmText !== 'DELETE'}
                className="flex h-12 flex-[1.4] items-center justify-center gap-2 rounded-xl bg-destructive text-sm font-extrabold text-destructive-foreground disabled:opacity-40"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Delete for good
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
