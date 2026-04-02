import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Clock, Camera, FileText } from 'lucide-react';
import type { WorkflowStep } from '@/pages/CleanWorkflowPage';

interface Props {
  job: any;
  property: any;
  userId: string;
  onNext: (step: WorkflowStep) => void;
  onBack: () => void;
}

export default function DoneStep({ job, property, onBack }: Props) {
  const duration = job.duration_minutes ?? 0;
  const hours = Math.floor(duration / 60);
  const mins = duration % 60;
  const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  const preCleanNotes = Array.isArray(job.pre_clean_notes) ? job.pre_clean_notes : [];

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center max-w-lg mx-auto px-4">
      <div className="text-center space-y-4 w-full">
        <div className="mx-auto w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="h-12 w-12 text-green-600" />
        </div>

        <h1 className="text-2xl font-extrabold text-foreground">Job Complete ✅</h1>
        <p className="text-muted-foreground">Great work! Here's your summary.</p>

        {/* Summary card */}
        <Card className="border-border text-left">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Time on site</p>
                <p className="font-bold text-foreground text-lg">{timeStr}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Property</p>
                <p className="font-bold text-foreground">{property?.property_name}</p>
              </div>
            </div>
            {preCleanNotes.length > 0 && (
              <div className="flex items-start gap-3">
                <Camera className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Pre-clean notes</p>
                  {preCleanNotes.map((n: any, i: number) => (
                    <p key={i} className="text-sm text-foreground">{n.type}: {n.note}</p>
                  ))}
                </div>
              </div>
            )}
            {job.completion_notes && (
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Completion notes</p>
                  <p className="text-sm text-foreground">{job.completion_notes}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Button
          size="lg"
          className="w-full h-14 text-base font-extrabold rounded-2xl"
          onClick={onBack}
        >
          Back to My Cleans
        </Button>
      </div>
    </div>
  );
}
