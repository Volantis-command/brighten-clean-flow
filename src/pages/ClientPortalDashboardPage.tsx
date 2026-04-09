import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Loader2, LogOut, Home, CalendarDays, FileText, Receipt, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PropertyCard from '@/components/client-portal/PropertyCard';
import CleanHistoryList from '@/components/client-portal/CleanHistoryList';
import InvoiceList from '@/components/client-portal/InvoiceList';
import QuoteHistoryList from '@/components/client-portal/QuoteHistoryList';

type PortalTab = 'overview' | 'properties' | 'cleans' | 'invoices' | 'quotes';

export default function ClientPortalDashboardPage() {
  const navigate = useNavigate();
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientType, setClientType] = useState('profile');
  const [activeTab, setActiveTab] = useState<PortalTab>('overview');
  const [cleanPropertyFilter, setCleanPropertyFilter] = useState('all');

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

  const today = format(new Date(), 'yyyy-MM-dd');
  const jobs = data?.jobs || [];
  const properties = data?.properties || [];
  const cleaners = data?.cleaners || [];
  const feedback = data?.feedback || [];

  const upcomingJobs = jobs.filter(
    (j: any) => ['scheduled', 'confirmed', 'in_progress'].includes(j.status) && j.scheduled_date >= today
  );

  const firstName = (data?.clientName || clientName || 'there').split(' ')[0];

  const getCleanerName = (id: string) => {
    const c = cleaners.find((cl: any) => cl.id === id);
    return c?.full_name || '';
  };

  const tabs: { key: PortalTab; icon: any; label: string }[] = [
    { key: 'overview', icon: Home, label: 'Overview' },
    { key: 'properties', icon: Home, label: 'Properties' },
    { key: 'cleans', icon: CalendarDays, label: 'Cleans' },
    { key: 'invoices', icon: Receipt, label: 'Invoices' },
    { key: 'quotes', icon: FileText, label: 'Quotes' },
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="bg-primary text-primary-foreground px-4 py-6">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <h1
            className="text-2xl font-extrabold tracking-tight"
            style={{ fontFamily: 'Nunito, sans-serif' }}
          >
            Brightly<span className="text-accent">.</span>
          </h1>
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

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Tab bar */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-muted-foreground border border-border hover:bg-muted'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-extrabold text-foreground">
              Hi {firstName}, here are your cleans.
            </h2>

            {/* Upcoming */}
            <section className="space-y-3">
              <h3 className="text-lg font-bold text-foreground">Upcoming Cleans</h3>
              {upcomingJobs.length === 0 ? (
                <div className="bg-card rounded-2xl border border-border/50 p-6 text-center">
                  <p className="text-muted-foreground mb-3">No upcoming cleans booked.</p>
                  <Button asChild className="rounded-2xl">
                    <a href="/book">Book Now →</a>
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
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {properties.find((p: any) => p.id === job.property_id)?.property_name || properties.find((p: any) => p.id === job.property_id)?.address || ''}
                      </p>
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

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-card rounded-2xl border border-border/50 p-4 text-center">
                <p className="text-2xl font-extrabold text-primary">{properties.length}</p>
                <p className="text-xs text-muted-foreground">Properties</p>
              </div>
              <div className="bg-card rounded-2xl border border-border/50 p-4 text-center">
                <p className="text-2xl font-extrabold text-primary">{upcomingJobs.length}</p>
                <p className="text-xs text-muted-foreground">Upcoming</p>
              </div>
              <div className="bg-card rounded-2xl border border-border/50 p-4 text-center">
                <p className="text-2xl font-extrabold text-primary">
                  {jobs.filter((j: any) => j.status === 'complete' || j.status === 'completed').length}
                </p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
            </div>
          </div>
        )}

        {/* PROPERTIES */}
        {activeTab === 'properties' && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-foreground">Your Properties</h3>
            {properties.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-4xl mb-3">🏠</p>
                <p className="text-lg font-bold text-foreground">No properties linked yet.</p>
                <p className="text-sm text-muted-foreground mt-1">Contact Brightly to get started.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {properties.map((prop: any) => {
                  const propJobs = jobs.filter((j: any) => j.property_id === prop.id);
                  return (
                    <PropertyCard
                      key={prop.id}
                      property={prop}
                      jobs={propJobs}
                      cleanerProfiles={cleaners}
                      onClick={() => navigate(`/client-portal/property/${prop.id}`)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* CLEANS */}
        {activeTab === 'cleans' && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-foreground">Your Cleans</h3>
            <CleanHistoryList
              jobs={jobs}
              properties={properties}
              cleanerProfiles={cleaners}
              feedback={feedback}
              propertyFilter={cleanPropertyFilter}
              onPropertyFilterChange={setCleanPropertyFilter}
            />
          </div>
        )}

        {/* INVOICES */}
        {activeTab === 'invoices' && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-foreground">Your Invoices</h3>
            <InvoiceList jobs={jobs} properties={properties} />
          </div>
        )}

        {/* QUOTES */}
        {activeTab === 'quotes' && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-foreground">Your Quotes</h3>
            <QuoteHistoryList quotes={data?.quotes || []} />
          </div>
        )}
      </div>
    </div>
  );
}
