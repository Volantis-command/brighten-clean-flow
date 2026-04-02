import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import ArrivalStep from '@/components/clean-workflow/ArrivalStep';
import PreCleanStep from '@/components/clean-workflow/PreCleanStep';
import InProgressStep from '@/components/clean-workflow/InProgressStep';
import CompletionStep from '@/components/clean-workflow/CompletionStep';
import DoneStep from '@/components/clean-workflow/DoneStep';

export type WorkflowStep = 'arrival' | 'pre_clean' | 'in_progress' | 'completion' | 'done';

function resolveStep(job: any): WorkflowStep {
  if (job.status === 'completed') return 'done';
  if (job.clock_on && !job.clock_off) {
    // Check if they've started checklist work — show in_progress
    return 'in_progress';
  }
  if (job.arrived_at && !job.clock_on) return 'pre_clean';
  if (job.status === 'in_progress' && job.arrived_at) return 'pre_clean';
  if (job.arrived_at) return 'pre_clean';
  return 'arrival';
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

  const [step, setStep] = useState<WorkflowStep>('arrival');

  useEffect(() => {
    if (job) setStep(resolveStep(job));
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
    case 'arrival':
      return <ArrivalStep {...stepProps} />;
    case 'pre_clean':
      return <PreCleanStep {...stepProps} />;
    case 'in_progress':
      return <InProgressStep {...stepProps} />;
    case 'completion':
      return <CompletionStep {...stepProps} />;
    case 'done':
      return <DoneStep {...stepProps} />;
    default:
      return <ArrivalStep {...stepProps} />;
  }
}
