import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import PropertyCard from '@/components/client-portal/PropertyCard';

export default function MagicLinkPortalPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  // Resolve the token to a client_id, then load ALL of that client's
  // portal-active properties — not just the row matching this token.
  // portal_token is unique per client_properties row, so a single-token
  // query would only ever return one property (the bug we're fixing).
  const { data: clientProp, isLoading: loadingToken, error: tokenError } = useQuery({
    queryKey: ['magic-link', token],
    queryFn: async () => {
      const { data: tokenRow, error: tokenErr } = await supabase
        .from('client_properties' as any)
        .select('client_id')
        .eq('portal_token', token!)
        .eq('portal_active', true)
        .maybeSingle();
      if (tokenErr) throw tokenErr;
      if (!tokenRow) return [];

      const { data, error } = await supabase
        .from('client_properties' as any)
        .select('*')
        .eq('client_id', (tokenRow as any).client_id)
        .eq('portal_active', true);
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!token,
  });

  const propertyIds = (clientProp || []).map((cp: any) => cp.property_id);
  const clientId = clientProp?.[0]?.client_id;

  const { data: properties = [], isLoading: loadingProps } = useQuery({
    queryKey: ['magic-properties', propertyIds],
    queryFn: async () => {
      if (!propertyIds.length) return [];
      const { data, error } = await supabase.from('properties').select('*').in('id', propertyIds);
      if (error) throw error;
      return data || [];
    },
    enabled: propertyIds.length > 0,
  });

  const { data: profile } = useQuery({
    queryKey: ['magic-profile', clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const { data } = await supabase.from('profiles').select('full_name').eq('id', clientId).single();
      return data;
    },
    enabled: !!clientId,
  });

  const { data: jobs = [] } = useQuery({
    queryKey: ['magic-jobs', propertyIds],
    queryFn: async () => {
      if (!propertyIds.length) return [];
      const { data } = await supabase.from('jobs').select('*').in('property_id', propertyIds).order('scheduled_date', { ascending: false });
      return data || [];
    },
    enabled: propertyIds.length > 0,
  });

  const cleanerIds = [...new Set(jobs.flatMap((j: any) => [j.cleaner_1_id, j.cleaner_2_id]).filter(Boolean))];
  const { data: cleanerProfiles = [] } = useQuery({
    queryKey: ['magic-cleaners', cleanerIds],
    queryFn: async () => {
      if (!cleanerIds.length) return [];
      const { data } = await supabase.from('profiles').select('id, full_name').in('id', cleanerIds);
      return data || [];
    },
    enabled: cleanerIds.length > 0,
  });

  const { data: audits = [] } = useQuery({
    queryKey: ['magic-audits', propertyIds],
    queryFn: async () => {
      if (!propertyIds.length) return [];
      const { data } = await supabase.from('qc_audits').select('property_id, percentage, audit_date').in('property_id', propertyIds).order('audit_date', { ascending: false });
      return data || [];
    },
    enabled: propertyIds.length > 0,
  });

  const isLoading = loadingToken || loadingProps;
  const firstName = profile?.full_name?.split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex justify-center items-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!clientProp?.length || tokenError) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
        <p className="text-4xl mb-3">🔒</p>
        <p className="text-lg font-bold text-foreground">Invalid or inactive portal link</p>
        <p className="text-sm text-muted-foreground mt-1">Contact Brightly for a new link.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border/50 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <h1 className="text-2xl font-extrabold text-primary" style={{ fontFamily: 'Nunito, sans-serif' }}>
            Brightly<span className="text-accent">.</span>
          </h1>
          <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Portal</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h2 className="text-2xl font-extrabold text-primary">Good {greeting}, {firstName}</h2>
          <p className="text-sm text-muted-foreground mt-1">Here's your properties</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {properties.map((prop: any) => {
            const propJobs = jobs.filter((j: any) => j.property_id === prop.id);
            const latestAudit = audits.find((a: any) => a.property_id === prop.id);
            return (
              <PropertyCard
                key={prop.id}
                property={prop}
                jobs={propJobs}
                cleanerProfiles={cleanerProfiles}
                latestAuditPct={latestAudit?.percentage}
                onClick={() => navigate(`/client/${token}/property/${prop.id}`)}
                rebookHref={`/client/${token}/property/${prop.id}/rebook`}
              />
            );
          })}
        </div>

        <p className="text-center text-muted-foreground text-xs pt-8">Powered by Brightly</p>
      </main>
    </div>
  );
}
