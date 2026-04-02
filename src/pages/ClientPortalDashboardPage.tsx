import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, isBefore, startOfDay } from 'date-fns';
import { Loader2, LogOut, CalendarPlus, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function ClientPortalDashboardPage() {
  const navigate = useNavigate();
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientType, setClientType] = useState('profile');

  useEffect(() => {
    const id = localStorage.getItem('brightly_client_id');
    const name = localStorage.getItem('brightly_client_name');
    const type = localStorage.getItem('brightly_client_type');
    if (!id) {
      navigate('/client-portal', { replace: true });
      return;
    }
    setClientId(id);
    setClientName(name || '');
    setClientType(type || 'profile');
  }, [navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ['client-portal-data', clientId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('client-portal-data', {
        body: { client_id: clientId, client_type: clientType },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  const handleLogout = () => {
    localStorage.removeItem('brightly_client_id');
    localStorage.removeItem('brightly_client_name');
    localStorage.removeItem('brightly_client_type');
    navigate('/client-portal', { replace: true });
  };

  if (!clientId || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const today = startOfDay(new Date());
  const todayStr = format(today, 'yyyy-MM-dd');

  const jobs = data?.jobs || [];
  const properties = data?.properties || [];
  const cleaners = data?.cleaners || [];
  const feedback = data?.feedback || [];

  const upcomingJobs = jobs.filter(
    (j: any) => ['scheduled', 'confirmed', 'in_progress'].includes(j.status) && j.scheduled_date >= todayStr
  );
  const pastJobs = jobs.filter(
    (j: any) => j.status === 'complete' || (j.status === 'completed') || (j.scheduled_date < todayStr && !['scheduled', 'confirmed', 'in_progress', 'cancelled'].includes(j.status))
  );

  const getPropertyName = (propertyId: string) => {
    const p = properties.find((prop: any) => prop.id === propertyId);
    return p ? (p.address || p.property_name) : 'Unknown';
  };

  const getCleanerName = (cleanerId: string) => {
    const c = cleaners.find((cl: any) => cl.id === cleanerId);
    return c?.full_name || '';
  };

  const getFeedbackScore = (jobId: string) => {
    const fb = feedback.find((f: any) => f.job_id === jobId);
    return fb?.score || null;
  };

  const firstName = (data?.clientName || clientName || 'there').split(' ')[0];

  const statusBadge = (status: string) => {
    if (status === 'confirmed') return <Badge className="bg-primary/10 text-primary border-0 font-semibold">Confirmed</Badge>;
    if (status === 'scheduled') return <Badge className="bg-accent/20 text-accent-foreground border-0 font-semibold">Scheduled</Badge>;
    if (status === 'in_progress') return <Badge className="bg-blue-100 text-blue-700 border-0 font-semibold">In Progress</Badge>;
    return <Badge variant="secondary" className="font-semibold">{status}</Badge>;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground px-4 py-6">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1
              className="text-2xl font-extrabold tracking-tight"
              style={{ fontFamily: 'Nunito, sans-serif' }}
            >
              Brightly<span className="text-accent">.</span>
            </h1>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10"
          >
            <LogOut className="w-4 h-4 mr-1" /> Logout
          </Button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        <div>
          <h2 className="text-2xl font-extrabold text-foreground">
            Hi {firstName}, here are your cleans.
          </h2>
        </div>

        {/* Upcoming */}
        <section className="space-y-3">
          <h3 className="text-lg font-bold text-foreground">Upcoming Cleans</h3>
          {upcomingJobs.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border/50 p-6 text-center">
              <p className="text-muted-foreground mb-3">No upcoming cleans booked.</p>
              <p className="text-sm text-muted-foreground mb-4">Ready to book your next clean?</p>
              <Button asChild className="rounded-2xl">
                <Link to="/book">Book Now →</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingJobs.map((job: any) => (
                <div key={job.id} className="bg-card rounded-2xl border border-border/50 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-bold text-foreground">
                        {format(new Date(job.scheduled_date + 'T00:00:00'), 'EEEE, d MMMM yyyy')}
                      </p>
                      {job.scheduled_time && (
                        <p className="text-sm text-muted-foreground">
                          {job.scheduled_time.slice(0, 5)}
                        </p>
                      )}
                    </div>
                    {statusBadge(job.status)}
                  </div>
                  <p className="text-sm text-muted-foreground">{getPropertyName(job.property_id)}</p>
                  {job.cleaner_1_id && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Cleaner: {getCleanerName(job.cleaner_1_id)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Past */}
        <section className="space-y-3">
          <h3 className="text-lg font-bold text-foreground">Past Cleans</h3>
          {pastJobs.length === 0 ? (
            <p className="text-muted-foreground text-sm">No past cleans yet.</p>
          ) : (
            <div className="space-y-3">
              {pastJobs.slice(0, 20).map((job: any) => {
                const score = getFeedbackScore(job.id);
                return (
                  <div key={job.id} className="bg-card rounded-2xl border border-border/50 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-foreground">
                          {format(new Date(job.scheduled_date + 'T00:00:00'), 'd MMM yyyy')}
                        </p>
                        <p className="text-sm text-muted-foreground">{getPropertyName(job.property_id)}</p>
                      </div>
                      <div className="text-right">
                        {score && (
                          <div className="flex items-center gap-1 text-accent">
                            <Star className="w-4 h-4 fill-current" />
                            <span className="text-sm font-bold">{score}/5</span>
                          </div>
                        )}
                        {job.price_inc_gst && (
                          <p className="text-sm font-semibold text-foreground">
                            ${Number(job.price_inc_gst).toFixed(2)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Book another */}
        <div className="text-center pb-8">
          <Button asChild className="rounded-2xl h-12 px-8" size="lg">
            <Link to="/book">
              <CalendarPlus className="w-4 h-4 mr-2" /> Book Another Clean
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
