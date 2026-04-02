import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import GeofenceStep from '@/components/clean-workflow/GeofenceStep';
import ClockOnStep from '@/components/clean-workflow/ClockOnStep';
import DamageCheckStep from '@/components/clean-workflow/DamageCheckStep';
import ExtraTimeStep from '@/components/clean-workflow/ExtraTimeStep';
import InProgressStep from '@/components/clean-workflow/InProgressStep';
import CompletionStep from '@/components/clean-workflow/CompletionStep';
import DoneStep from '@/components/clean-workflow/DoneStep';

export type WorkflowStep = 'geofence' | 'clock_on' | 'damage_check' | 'extra_time' | 'in_progress' | 'completion' | 'done';

function resolveStep(job: any): WorkflowStep {
  if (job.status === 'completed') return 'done';
  if (job.clock_on && !job.clock_off) {
    // Check if pre-clean questions have been answered
    if (job.pre_clean_notes === null || job.pre_clean_notes === undefined) return 'damage_check';
    if (job.extra_time_requested === null || job.extra_time_requested === undefined) return 'extra_time';
    return 'in_progress';
  }
  if (job.arrived_at && !job.clock_on) return 'clock_on';
  return 'geofence';
}

export default function CleanWorkflowPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: job, isLoading, refetch } = useQuery({
    queryKey: ['clean-workflow-job', jobId],
    enabled: !!jobId && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('*, properties(*)')
        .eq('id', jobId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [step, setStep] = useState<WorkflowStep | null>(null);
  const manualStepRef = useRef<WorkflowStep | null>(null);

  useEffect(() => {
    if (job && !manualStepRef.current) {
      setStep(resolveStep(job));
    }
  }, [job]);

  const refreshJob = async () => {
    await refetch();
    queryClient.invalidateQueries({ queryKey: ['my-cleans'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-jobs'] });
    queryClient.invalidateQueries({ queryKey: ['schedule-jobs'] });
  };

  if (isLoading || !job) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const property = job.properties as any;

  const stepProps = {
    job,
    property,
    userId: user!.id,
    onNext: (nextStep: WorkflowStep) => {
      setStep(nextStep);
      refreshJob();
    },
    onBack: () => navigate('/my-cleans'),
  };

  switch (step) {
    case 'geofence':
      return <GeofenceStep {...stepProps} />;
    case 'clock_on':
      return <ClockOnStep {...stepProps} />;
    case 'damage_check':
      return <DamageCheckStep {...stepProps} />;
    case 'extra_time':
      return <ExtraTimeStep {...stepProps} />;
    case 'in_progress':
      return <InProgressStep {...stepProps} />;
    case 'completion':
      return <CompletionStep {...stepProps} />;
    case 'done':
      return <DoneStep {...stepProps} />;
    default:
      return <GeofenceStep {...stepProps} />;
  }
}
