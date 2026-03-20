import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2, MapPin } from 'lucide-react';
import { MapsActionSheet } from '@/components/MapsActionSheet';

interface NextJob {
  propertyName: string;
  address: string | null;
  scheduledTime: string | null;
}

interface JobCompletionModalProps {
  open: boolean;
  onClose: () => void;
  firstName: string;
  nextJob: NextJob | null;
  onBackToDashboard: () => void;
}

export function JobCompletionModal({
  open,
  onClose,
  firstName,
  nextJob,
  onBackToDashboard,
}: JobCompletionModalProps) {
  const [mapsOpen, setMapsOpen] = useState(false);

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="sm:max-w-md rounded-2xl p-8 text-center [&>button]:hidden">
          <div className="flex flex-col items-center gap-5">
            <div className="animate-scale-in">
              <CheckCircle2 className="h-20 w-20 text-primary" strokeWidth={1.5} />
            </div>

            <h2 className="text-2xl font-extrabold text-foreground">
              Job Complete! Great work, {firstName}. 🎉
            </h2>

            {nextJob ? (
              <>
                <p className="text-muted-foreground text-base">
                  Your next job is <span className="font-bold text-foreground">{nextJob.propertyName}</span>
                  {nextJob.scheduledTime && <> at <span className="font-bold text-foreground">{nextJob.scheduledTime}</span></>}.
                </p>

                <div className="flex flex-col gap-3 w-full mt-2">
                  {nextJob.address && (
                    <Button
                      onClick={() => setMapsOpen(true)}
                      className="w-full h-14 rounded-2xl gap-2 bg-accent text-accent-foreground hover:bg-accent/90 font-extrabold"
                    >
                      <MapPin className="h-5 w-5" />
                      Navigate There
                    </Button>
                  )}
                  <Button
                    onClick={onBackToDashboard}
                    variant="outline"
                    className="w-full h-14 rounded-2xl border-primary text-primary font-extrabold hover:bg-primary/5"
                  >
                    Back to Dashboard
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-muted-foreground text-base">
                  That's all your jobs for today. See you tomorrow! 🌟
                </p>
                <Button
                  onClick={onBackToDashboard}
                  variant="outline"
                  className="w-full h-14 rounded-2xl border-primary text-primary font-extrabold hover:bg-primary/5 mt-2"
                >
                  Back to Dashboard
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {nextJob?.address && (
        <MapsActionSheet
          open={mapsOpen}
          onClose={() => setMapsOpen(false)}
          address={nextJob.address}
        />
      )}
    </>
  );
}
