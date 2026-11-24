import { useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import ClientFeedbackForm from './ClientFeedbackForm';

interface Props {
  reportToken: string;
  jobDone: boolean;
  /** e.g. "Thu 13 Nov" — shown so the client knows which clean they're on. */
  cleanLabel?: string;
  children: ReactNode; // the trigger button, styled by the page that uses it
}

/** The same feedback form as the clean report, opened from any portal list. */
export default function ClientFeedbackDialog({ reportToken, jobDone, cleanLabel, children }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{jobDone ? 'Feedback on this clean' : 'A request for this clean'}</DialogTitle>
          <DialogDescription>
            {cleanLabel ? `${cleanLabel}. ` : ''}Your cleaner sees this before they start, and ticks it off.
          </DialogDescription>
        </DialogHeader>
        <ClientFeedbackForm reportToken={reportToken} jobDone={jobDone} onSent={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
