import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CalendarDays, ChevronRight } from 'lucide-react';

export function TodayJobsWidget() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: jobs = [] } = useQuery({
    queryKey: ['today-jobs-widget', user?.id, role],
    enabled: !!user,
    queryFn: async () => {
      let query = supabase
        .from('jobs')
        .select('id, scheduled_time, status, properties(property_name)')
        .eq('scheduled_date', today)
        .in('status', ['scheduled', 'confirmed', 'in_progress', 'completed'])
        .order('scheduled_time', { ascending: true });

      if (role === 'cleaner' || role === 'head_cleaner') {
        query = query.or(`cleaner_1_id.eq.${user!.id},cleaner_2_id.eq.${user!.id}`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const nextJob = jobs.find((j: any) => j.status === 'scheduled' || j.status === 'confirmed' || j.status === 'in_progress');

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-extrabold text-foreground">Today's Jobs</h2>
          </div>
          <span className="text-xs font-bold text-muted-foreground">{format(new Date(), 'EEEE, d MMMM')}</span>
        </div>

        <p className="text-sm font-semibold text-foreground">
          {jobs.length === 0 ? 'No jobs scheduled today' : `${jobs.length} job${jobs.length === 1 ? '' : 's'} today`}
        </p>

        {nextJob && (
          <div className="bg-card rounded-xl p-3 border border-border">
            <p className="text-sm font-bold text-foreground">
              {(nextJob as any).properties?.property_name ?? 'Property'} — {(nextJob as any).scheduled_time?.slice(0, 5) ?? 'TBC'}
            </p>
          </div>
        )}

        <Button
          onClick={() => navigate('/my-jobs')}
          className="w-full h-12 text-base font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
        >
          View Today's Jobs <ChevronRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
