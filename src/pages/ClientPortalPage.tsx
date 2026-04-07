import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Loader2, Home, CalendarDays, FileText, User, Phone, Mail, ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { format, subMonths, isAfter } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type PortalTab = 'properties' | 'cleans' | 'quotes' | 'account';

function getPropertyStatus(jobs: any[]) {
  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  const todayJob = jobs.find((j: any) => j.scheduled_date === todayStr && ['scheduled', 'confirmed', 'in_progress'].includes(j.status));
  if (todayJob) return { label: 'Clean Today', color: 'bg-primary/10 text-primary', dot: 'bg-primary' };

  const lastComplete = jobs.find((j: any) => j.status === 'complete');
  if (lastComplete) {
    const completedDate = new Date(lastComplete.scheduled_date + 'T00:00:00');
    const daysDiff = Math.floor((today.getTime() - completedDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff <= 2) return { label: 'Recently Cleaned', color: 'bg-primary/10 text-primary', dot: 'bg-primary' };
  }

  const nextScheduled = jobs.find((j: any) => ['scheduled', 'confirmed'].includes(j.status) && j.scheduled_date >= todayStr);
  if (nextScheduled) return { label: 'Scheduled', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' };

  return { label: 'Awaiting Clean', color: 'bg-muted text-muted-foreground', dot: 'bg-gray-400' };
}

export default function ClientPortalPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<PortalTab>('properties');

  // Cleans filters
  const [cleanStatusFilter, setCleanStatusFilter] = useState('all');
  const [cleanDateFilter, setCleanDateFilter] = useState('all');
  // Cleans expand
  const [expandedClean, setExpandedClean] = useState<string | null>(null);

  // Properties data — match via client_properties link OR client_id/client_name/client_phone
  const { data: clientProps = [], isLoading: loadingLinks } = useQuery({
    queryKey: ['client-properties', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_properties' as any)
        .select('property_id, guest_ready_sms, show_invoices, portal_active')
        .eq('client_id', user!.id)
        .eq('portal_active', true);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const linkedPropertyIds = clientProps.map((cp: any) => cp.property_id);

  // Also fetch properties where client_id, client_name or client_phone matches the profile
  const { data: directProperties = [] } = useQuery({
    queryKey: ['client-direct-properties', user?.id, profile?.full_name, (profile as any)?.phone],
    queryFn: async () => {
      const conditions: string[] = [];
      if (user?.id) conditions.push(`client_id.eq.${user.id}`);
      if (profile?.full_name) conditions.push(`client_name.eq.${profile.full_name}`);
      if ((profile as any)?.phone) conditions.push(`client_phone.eq.${(profile as any).phone}`);
      if (conditions.length === 0) return [];
      const { data } = await supabase.from('properties').select('*').or(conditions.join(','));
      return data || [];
    },
    enabled: !!user,
  });

  // Merge linked + direct, dedup by id
  const propertyIds = [...new Set([...linkedPropertyIds, ...directProperties.map((p: any) => p.id)])];

  const { data: linkedDetails = [], isLoading: loadingProps } = useQuery({
    queryKey: ['client-property-details', linkedPropertyIds],
    queryFn: async () => {
      if (!linkedPropertyIds.length) return [];
      const { data, error } = await supabase.from('properties').select('*').in('id', linkedPropertyIds);
      if (error) throw error;
      return data || [];
    },
    enabled: linkedPropertyIds.length > 0,
  });

  // Merge linked details with direct properties, dedup
  const properties = (() => {
    const map = new Map<string, any>();
    [...linkedDetails, ...directProperties].forEach(p => { if (!map.has(p.id)) map.set(p.id, p); });
    return Array.from(map.values());
  })();

  // Jobs across all properties
  const { data: jobs = [] } = useQuery({
    queryKey: ['client-portal-jobs', propertyIds],
    queryFn: async () => {
      if (!propertyIds.length) return [];
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .in('property_id', propertyIds)
        .order('scheduled_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: propertyIds.length > 0,
  });

  // Cleaner profiles
  const cleanerIds = [...new Set(jobs.flatMap((j: any) => [j.cleaner_1_id, j.cleaner_2_id]).filter(Boolean))];
  const { data: cleanerProfiles = [] } = useQuery({
    queryKey: ['client-cleaners', cleanerIds],
    queryFn: async () => {
      if (!cleanerIds.length) return [];
      const { data } = await supabase.from('profiles').select('id, full_name').in('id', cleanerIds);
      return data || [];
    },
    enabled: cleanerIds.length > 0,
  });

  // QC audits
  const { data: audits = [] } = useQuery({
    queryKey: ['client-audits', propertyIds],
    queryFn: async () => {
      if (!propertyIds.length) return [];
      const { data } = await supabase
        .from('qc_audits')
        .select('property_id, percentage, audit_date')
        .in('property_id', propertyIds)
        .order('audit_date', { ascending: false });
      return data || [];
    },
    enabled: propertyIds.length > 0,
  });

  // Quotes for this client
  const { data: quotes = [] } = useQuery({
    queryKey: ['client-portal-quotes', user?.id, profile?.email, (profile as any)?.phone],
    queryFn: async () => {
      const phone = (profile as any)?.phone;
      const email = profile?.email;
      if (!phone && !email) return [];

      let allQuotes: any[] = [];
      if (phone) {
        const { data } = await supabase
          .from('quotes')
          .select('*')
          .eq('client_phone', phone)
          .order('created_at', { ascending: false });
        allQuotes = data || [];
      }
      if (email) {
        const { data } = await supabase
          .from('quotes')
          .select('*')
          .eq('client_email', email)
          .order('created_at', { ascending: false });
        const existingIds = new Set(allQuotes.map(q => q.id));
        (data || []).forEach(q => { if (!existingIds.has(q.id)) allQuotes.push(q); });
      }
      return allQuotes;
    },
    enabled: !!user,
  });

  const isLoading = loadingLinks || loadingProps;
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const getCleanerName = (id: string) => {
    const p = cleanerProfiles.find((c: any) => c.id === id);
    return p?.full_name?.split(' ')[0] || null;
  };

  const getPropertyName = (propId: string) => {
    const p = properties.find((pr: any) => pr.id === propId);
    return p?.property_name || p?.address || 'Property';
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const firstName = profile?.full_name?.split(' ')[0] || 'there';

  // Filter cleans
  const filteredCleans = jobs.filter((j: any) => {
    if (cleanStatusFilter !== 'all') {
      if (cleanStatusFilter === 'completed' && j.status !== 'complete') return false;
      if (cleanStatusFilter === 'scheduled' && !['scheduled', 'confirmed'].includes(j.status)) return false;
      if (cleanStatusFilter === 'cancelled' && j.status !== 'cancelled') return false;
    }
    if (cleanDateFilter !== 'all') {
      const jobDate = new Date(j.scheduled_date + 'T00:00:00');
      const now = new Date();
      if (cleanDateFilter === 'this_month' && !isAfter(jobDate, subMonths(now, 1))) return false;
      if (cleanDateFilter === '3_months' && !isAfter(jobDate, subMonths(now, 3))) return false;
    }
    return true;
  });

  const cleanStatusBadge = (status: string) => {
    if (status === 'complete') return { label: 'Completed', cls: 'bg-green-100 text-green-800' };
    if (['scheduled', 'confirmed'].includes(status)) return { label: 'Scheduled', cls: 'bg-blue-100 text-blue-800' };
    if (status === 'in_progress') return { label: 'In Progress', cls: 'bg-yellow-100 text-yellow-800' };
    if (status === 'cancelled') return { label: 'Cancelled', cls: 'bg-red-100 text-red-800' };
    return { label: status, cls: 'bg-muted text-muted-foreground' };
  };

  const quoteStatusBadge = (status: string) => {
    if (status === 'draft') return { label: 'Draft', cls: 'bg-muted text-muted-foreground' };
    if (status === 'quote_sent') return { label: 'Sent', cls: 'bg-blue-100 text-blue-800' };
    if (status === 'client_accepted') return { label: 'Accepted', cls: 'bg-green-100 text-green-800' };
    if (['quote_declined', 'declined'].includes(status)) return { label: 'Declined', cls: 'bg-red-100 text-red-800' };
    return { label: status, cls: 'bg-muted text-muted-foreground' };
  };

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20">
      {/* Header */}
      <div className="bg-primary px-5 pt-6 pb-5">
        <h1 className="text-2xl font-extrabold text-primary-foreground tracking-tight" style={{ fontFamily: 'Nunito, sans-serif' }}>
          Brightly<span className="text-accent">.</span>
        </h1>
        <p className="text-primary-foreground/80 text-sm mt-1">Welcome back, {firstName}</p>
      </div>

      {/* Tab content */}
      <div className="flex-1 px-4 py-5 space-y-4">
        {/* PROPERTIES TAB */}
        {activeTab === 'properties' && (
          <>
            <h2 className="text-lg font-bold text-foreground">Your Properties</h2>
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
                  const statusInfo = getPropertyStatus(propJobs);
                  const lastCompleteJob = propJobs.find((j: any) => j.status === 'complete');
                  const nextScheduledJob = propJobs.find((j: any) =>
                    ['scheduled', 'confirmed', 'in_progress'].includes(j.status) && j.scheduled_date >= todayStr
                  );
                  const latestAudit = audits.find((a: any) => a.property_id === prop.id);
                  const nextCleanerName = nextScheduledJob?.cleaner_1_id ? getCleanerName(nextScheduledJob.cleaner_1_id) : null;

                  return (
                    <button
                      key={prop.id}
                      onClick={() => navigate(`/portal/property/${prop.id}`)}
                      className="bg-card rounded-2xl shadow-sm border border-border/50 p-5 text-left hover:shadow-md transition-shadow w-full"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="text-lg font-bold text-foreground">{prop.property_name}</h3>
                          <p className="text-sm text-muted-foreground">{[prop.address, prop.suburb].filter(Boolean).join(', ')}</p>
                        </div>
                        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${statusInfo.color}`}>
                          <div className={`w-2 h-2 rounded-full ${statusInfo.dot}`} />
                          {statusInfo.label}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                        <span>{prop.bedrooms || 0} bed / {prop.bathrooms || 0} bath</span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground">Next clean</span>
                          <p className="font-semibold text-foreground">
                            {nextScheduledJob
                              ? format(new Date(nextScheduledJob.scheduled_date + 'T00:00:00'), 'EEE, d MMM') +
                                (nextScheduledJob.scheduled_time ? ' at ' + nextScheduledJob.scheduled_time.slice(0, 5) : '')
                              : '—'}
                          </p>
                          {nextCleanerName && (
                            <p className="text-xs text-muted-foreground mt-0.5">Your cleaner: {nextCleanerName}</p>
                          )}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Last cleaned</span>
                          <p className="font-semibold text-foreground">
                            {lastCompleteJob ? format(new Date(lastCompleteJob.scheduled_date + 'T00:00:00'), 'dd MMM yyyy') : '—'}
                          </p>
                        </div>
                        {latestAudit && (
                          <div>
                            <span className="text-muted-foreground">QC Score</span>
                            <p className={`font-bold ${(latestAudit.percentage || 0) >= 80 ? 'text-primary' : (latestAudit.percentage || 0) >= 60 ? 'text-orange-500' : 'text-destructive'}`}>
                              {latestAudit.percentage}%
                            </p>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* CLEANS TAB */}
        {activeTab === 'cleans' && (
          <>
            <h2 className="text-lg font-bold text-foreground">Your Cleans</h2>
            <div className="flex gap-2 flex-wrap">
              <Select value={cleanStatusFilter} onValueChange={setCleanStatusFilter}>
                <SelectTrigger className="w-36 rounded-xl h-9 text-xs">
                  <Filter className="w-3 h-3 mr-1" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={cleanDateFilter} onValueChange={setCleanDateFilter}>
                <SelectTrigger className="w-36 rounded-xl h-9 text-xs">
                  <CalendarDays className="w-3 h-3 mr-1" />
                  <SelectValue placeholder="Date range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="3_months">Last 3 Months</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filteredCleans.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No cleans found.</div>
            ) : (
              <div className="space-y-3">
                {filteredCleans.map((job: any) => {
                  const status = cleanStatusBadge(job.status);
                  const cleanerName = job.cleaner_1_id ? getCleanerName(job.cleaner_1_id) : null;
                  const isExpanded = expandedClean === job.id;

                  return (
                    <div key={job.id} className="bg-card rounded-2xl border border-border/50 overflow-hidden">
                      <button
                        onClick={() => setExpandedClean(isExpanded ? null : job.id)}
                        className="w-full p-4 text-left"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-bold text-sm text-foreground">
                              {format(new Date(job.scheduled_date + 'T00:00:00'), 'EEE, dd MMM yyyy')}
                              {job.scheduled_time ? ` at ${job.scheduled_time.slice(0, 5)}` : ''}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {getPropertyName(job.property_id)}
                              {cleanerName ? ` — ${cleanerName}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={`${status.cls} text-[10px]`}>{status.label}</Badge>
                            {job.feedback_score && (
                              <span className="text-xs font-bold text-primary">{job.feedback_score}/5</span>
                            )}
                            {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                          </div>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-2 text-sm">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-muted-foreground text-xs">Clean Type</span>
                              <p className="font-semibold">{job.clean_type || '—'}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground text-xs">Property</span>
                              <p className="font-semibold">{getPropertyName(job.property_id)}</p>
                            </div>
                            {cleanerName && (
                              <div>
                                <span className="text-muted-foreground text-xs">Cleaner</span>
                                <p className="font-semibold">{cleanerName}</p>
                              </div>
                            )}
                            {job.notes && (
                              <div className="col-span-2">
                                <span className="text-muted-foreground text-xs">Notes</span>
                                <p className="text-foreground">{job.notes}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* QUOTES TAB */}
        {activeTab === 'quotes' && (
          <>
            <h2 className="text-lg font-bold text-foreground">Your Quotes</h2>
            {quotes.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No quotes found.</div>
            ) : (
              <div className="space-y-3">
                {quotes.map((quote: any) => {
                  const status = quoteStatusBadge(quote.status);
                  return (
                    <div key={quote.id} className="bg-card rounded-2xl border border-border/50 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-sm text-foreground">
                            {quote.clean_type || 'Clean'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {quote.created_at ? format(new Date(quote.created_at), 'dd MMM yyyy') : '—'}
                            {quote.property_address ? ` — ${quote.property_address}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {quote.price_inc_gst && (
                            <span className="font-bold text-primary text-sm">${quote.price_inc_gst}</span>
                          )}
                          <Badge className={`${status.cls} text-[10px]`}>{status.label}</Badge>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ACCOUNT TAB */}
        {activeTab === 'account' && (
          <>
            <h2 className="text-lg font-bold text-foreground">Your Account</h2>
            <div className="bg-card rounded-2xl border border-border/50 p-5 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl">
                  {(profile?.full_name || '?')[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-lg text-foreground">{profile?.full_name || '—'}</p>
                </div>
              </div>

              {(profile as any)?.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span className="text-foreground">{(profile as any).phone}</span>
                </div>
              )}
              {profile?.email && (
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span className="text-foreground">{profile.email}</span>
                </div>
              )}
            </div>

            <Button
              className="w-full h-14 rounded-2xl font-bold bg-primary text-primary-foreground"
              onClick={() => {
                window.location.href = 'sms:0418878707';
              }}
            >
              <Phone className="w-4 h-4 mr-2" /> Contact Us
            </Button>
          </>
        )}
      </div>

      {/* Bottom Nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 safe-area-bottom">
        <div className="grid grid-cols-4 max-w-lg mx-auto">
          {[
            { key: 'properties' as PortalTab, icon: Home, label: 'Properties' },
            { key: 'cleans' as PortalTab, icon: CalendarDays, label: 'Cleans' },
            { key: 'quotes' as PortalTab, icon: FileText, label: 'Quotes' },
            { key: 'account' as PortalTab, icon: User, label: 'Account' },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex flex-col items-center gap-0.5 py-3 text-xs font-semibold transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <Icon className="w-5 h-5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
