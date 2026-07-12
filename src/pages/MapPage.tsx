import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MapPin, Phone, Users, Building2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

import { GOOGLE_MAPS_API_KEY } from '@/lib/config';

const MAPS_KEY = GOOGLE_MAPS_API_KEY;

export default function MapPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'cleaners' | 'properties' | 'all'>('all');
  const [selectedCleaner, setSelectedCleaner] = useState<any>(null);
  const [selectedProperty, setSelectedProperty] = useState<any>(null);

  // Active cleaners (clocked on, not clocked off)
  const { data: activeClock = [] } = useQuery({
    queryKey: ['map-active-cleaners'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('id, user_id, job_id, clock_in_time, clock_in_lat, clock_in_lng')
        .is('clock_out_time', null);
      if (error) throw error;
      if (!data || data.length === 0) return [];

      const userIds = [...new Set(data.map((t: any) => t.user_id))];
      const jobIds = data.map((t: any) => t.job_id).filter(Boolean);

      const [profilesRes, jobsRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, phone, avatar_url').in('id', userIds),
        jobIds.length > 0
          ? supabase.from('jobs').select('id, property_id, properties(property_name, address)').in('id', jobIds)
          : Promise.resolve({ data: [] }),
      ]);

      const profileMap: Record<string, any> = {};
      (profilesRes.data || []).forEach((p: any) => { profileMap[p.id] = p; });
      const jobMap: Record<string, any> = {};
      ((jobsRes as any).data || []).forEach((j: any) => { jobMap[j.id] = j; });

      return data.map((t: any) => ({
        ...t,
        profile: profileMap[t.user_id],
        job: jobMap[t.job_id],
      }));
    },
    refetchInterval: 30_000,
  });

  // All properties with lat/lng
  const { data: properties = [] } = useQuery({
    queryKey: ['map-properties'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('id, property_name, address, lat, lng, client_name, client_phone')
        .eq('active', true)
        .not('lat', 'is', null)
        .not('lng', 'is', null);
      if (error) throw error;
      return data || [];
    },
  });

  const showCleaners = filter === 'cleaners' || filter === 'all';
  const showProperties = filter === 'properties' || filter === 'all';

  // No API key — placeholder
  if (!MAPS_KEY) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold text-foreground">Map</h1>
          <FilterToggles filter={filter} setFilter={setFilter} />
        </div>

        <div
          className="rounded-2xl border border-border flex flex-col items-center justify-center text-center"
          style={{
            background: '#1C1C1E',
            minHeight: 'calc(100vh - 200px)',
          }}
        >
          <MapPin className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-lg font-bold text-foreground mb-2">Google Maps API key required</p>
          <p className="text-sm text-muted-foreground max-w-md">
            Add your API key in Settings → Integrations → Google Maps to enable the live map view.
          </p>

          {/* Show data summary even without map */}
          <div className="mt-8 grid grid-cols-2 gap-4 max-w-sm w-full">
            <div className="bg-card rounded-xl p-4 border border-border">
              <Users className="w-5 h-5 text-primary mb-2" />
              <p className="text-2xl font-extrabold text-foreground">{activeClock.length}</p>
              <p className="text-xs text-muted-foreground">Cleaners On Now</p>
            </div>
            <div className="bg-card rounded-xl p-4 border border-border">
              <Building2 className="w-5 h-5 text-muted-foreground mb-2" />
              <p className="text-2xl font-extrabold text-foreground">{properties.length}</p>
              <p className="text-xs text-muted-foreground">Properties</p>
            </div>
          </div>

          {/* Active cleaners list */}
          {activeClock.length > 0 && (
            <div className="mt-6 w-full max-w-md space-y-2">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Active Cleaners</h3>
              {activeClock.map((c: any) => (
                <div key={c.id} className="bg-card rounded-xl p-3 border border-border flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full bg-primary animate-pulse shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{c.profile?.full_name || 'Cleaner'}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.job?.properties?.property_name || 'Unknown property'} · Since {format(new Date(c.clock_in_time), 'h:mm a')}
                    </p>
                  </div>
                  {c.profile?.phone && (
                    <a href={`tel:${c.profile.phone}`} className="shrink-0">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <Phone className="w-4 h-4 text-primary" />
                      </Button>
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // With API key — iframe map
  const center = properties.length > 0
    ? `${properties[0].lat},${properties[0].lng}`
    : '-28.0027,153.4310'; // Broadbeach default
  const focusedCoordinates = selectedProperty
    ? `${selectedProperty.lat},${selectedProperty.lng}`
    : selectedCleaner?.clock_in_lat && selectedCleaner?.clock_in_lng
      ? `${selectedCleaner.clock_in_lat},${selectedCleaner.clock_in_lng}`
      : null;
  const mapSrc = focusedCoordinates
    ? `https://www.google.com/maps/embed/v1/place?key=${MAPS_KEY}&q=${encodeURIComponent(focusedCoordinates)}&zoom=16&maptype=roadmap`
    : `https://www.google.com/maps/embed/v1/view?key=${MAPS_KEY}&center=${center}&zoom=12&maptype=roadmap`;

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-extrabold text-foreground">Map</h1>
        <FilterToggles filter={filter} setFilter={setFilter} />
      </div>

      <div className="relative rounded-2xl overflow-hidden border border-border" style={{ minHeight: 'calc(100vh - 200px)' }}>
        <iframe
          className="w-full h-full absolute inset-0"
          style={{ minHeight: 'calc(100vh - 200px)', border: 0 }}
          loading="lazy"
          title="Brightly live operations map"
          src={mapSrc}
        />

        {/* Overlay cards */}
        <div className="absolute top-4 left-4 z-10 space-y-2 max-h-[60vh] overflow-y-auto">
          {showCleaners && activeClock.map((c: any) => (
            <div role="button" tabIndex={0} onClick={() => { setSelectedCleaner(c); setSelectedProperty(null); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { setSelectedCleaner(c); setSelectedProperty(null); } }} key={c.id} className="block w-full bg-card/95 backdrop-blur rounded-xl p-3 border border-border shadow-lg max-w-xs text-left hover:border-primary/50">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-primary animate-pulse shrink-0" />
                <p className="text-sm font-bold text-foreground truncate">{c.profile?.full_name || 'Cleaner'}</p>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {c.job?.properties?.property_name || 'Unknown'} · Since {format(new Date(c.clock_in_time), 'h:mm a')}
              </p>
              {c.profile?.phone && (
                <a href={`tel:${c.profile.phone}`} onClick={(event) => event.stopPropagation()}>
                  <Button variant="outline" size="sm" className="mt-2 h-7 text-xs gap-1">
                    <Phone className="w-3 h-3" /> Call
                  </Button>
                </a>
              )}
            </div>
          ))}
          {showProperties && properties.map((property: any) => (
            <button type="button" onClick={() => { setSelectedProperty(property); setSelectedCleaner(null); }} key={property.id} className="block w-full max-w-xs rounded-xl border border-border bg-card/95 p-3 text-left shadow-lg backdrop-blur hover:border-primary/50">
              <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div className="min-w-0"><p className="truncate text-sm font-bold text-foreground">{property.property_name}</p><p className="truncate text-xs text-muted-foreground">{property.address}</p></div></div>
            </button>
          ))}
        </div>

        {selectedProperty && (
          <div className="absolute right-4 top-4 z-10 max-w-[calc(100%-2rem)] rounded-2xl border border-border bg-card/95 p-4 shadow-xl backdrop-blur sm:max-w-sm">
            <p className="font-extrabold text-foreground">{selectedProperty.property_name}</p>
            <p className="mt-1 text-xs text-muted-foreground">{selectedProperty.address}</p>
            <div className="mt-3 flex gap-2"><Button size="sm" onClick={() => navigate(`/properties/${selectedProperty.id}`)}>Open property</Button><Button size="sm" variant="outline" asChild><a href={`https://www.google.com/maps/dir/?api=1&destination=${selectedProperty.lat},${selectedProperty.lng}`} target="_blank" rel="noreferrer">Directions</a></Button></div>
          </div>
        )}

        {/* Summary strip */}
        <div className="absolute bottom-4 left-4 right-4 z-10 flex gap-3 justify-center">
          <div className="bg-card/95 backdrop-blur rounded-xl px-4 py-2 border border-border flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold text-foreground">{activeClock.length} active</span>
          </div>
          <div className="bg-card/95 backdrop-blur rounded-xl px-4 py-2 border border-border flex items-center gap-2">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-bold text-foreground">{properties.length} properties</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterToggles({ filter, setFilter }: { filter: string; setFilter: (f: any) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1 bg-secondary rounded-xl p-1">
      <button
        onClick={() => setFilter('all')}
        className={`min-h-11 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
          filter === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        All
      </button>
      <button
        onClick={() => setFilter('cleaners')}
        className={`min-h-11 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
          filter === 'cleaners' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        Cleaners
      </button>
      <button
        onClick={() => setFilter('properties')}
        className={`min-h-11 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
          filter === 'properties' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        Properties
      </button>
    </div>
  );
}
