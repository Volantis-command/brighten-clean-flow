import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Clock, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import type { WorkflowStep } from '@/pages/CleanWorkflowPage';
import { seedDefaultChecklist } from './defaultChecklist';
import PreJobAssessmentModal from './PreJobAssessmentModal';

interface Props {
  job: any;
  property: any;
  userId: string;
  onNext: (step: WorkflowStep) => void;
  onBack: () => void;
}

export default function ClockOnStep({ job, property, userId, onNext, onBack }: Props) {
  const [clockingOn, setClockingOn] = useState(false);
  // If already clocked on but assessment not done, show modal immediately
  const alreadyClockedOn = !!job.clock_on;
  const [showAssessment, setShowAssessment] = useState(alreadyClockedOn);
  const jobDate = new Date(job.scheduled_date + 'T' + (job.scheduled_time ?? '00:00'));

  async function handleClockOn() {
    setClockingOn(true);
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('jobs')
      .update({ clock_on: now })
      .eq('id', job.id);

    if (error) {
      toast.error('Failed to clock on');
      setClockingOn(false);
      return;
    }

    // Seed default checklist if none exist for this property
    await seedDefaultChecklist(property.id);

    // Create time_entry
    await supabase.from('time_entries').insert({
      job_id: job.id,
      user_id: userId,
      clock_in_time: now,
      geo_override: false,
    });

    toast.success('Clocked on! Timer started.');
    setClockingOn(false);
    // Show pre-job assessment modal instead of proceeding directly
    setShowAssessment(true);
  }

  function handleAssessmentComplete() {
    setShowAssessment(false);
    onNext('in_progress');
  }

  if (showAssessment) {
    return (
      <PreJobAssessmentModal
        job={job}
        property={property}
        userId={userId}
        onComplete={handleAssessmentComplete}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
      <div className="bg-primary text-primary-foreground px-5 py-5 safe-area-top">
        <button onClick={onBack} className="flex items-center gap-1 text-primary-foreground/70 text-sm mb-2">
          <ArrowLeft className="h-4 w-4" /> My Cleans
        </button>
        <h1 className="text-xl font-extrabold">Clock On</h1>
        <p className="text-primary-foreground/70 text-sm mt-1">{property?.property_name}</p>
      </div>

      <main className="flex-1 px-4 py-5 space-y-5">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
            <p className="font-bold text-foreground">Location captured ✓</p>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="text-foreground font-medium">{property?.address ?? 'No address'}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4 shrink-0" />
              <span className="text-foreground font-medium">{format(jobDate, 'h:mm a')}</span>
            </div>
          </CardContent>
        </Card>

        <Button
          size="lg"
          className="w-full h-16 text-lg font-extrabold rounded-2xl bg-green-600 hover:bg-green-700 text-white"
          onClick={handleClockOn}
          disabled={clockingOn}
        >
          {clockingOn ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : <Clock className="h-6 w-6 mr-2" />}
          Clock On
        </Button>
      </main>
    </div>
  );
}
