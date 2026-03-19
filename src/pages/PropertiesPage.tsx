import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Plus, BedDouble, Bath } from 'lucide-react';

export default function PropertiesPage() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [search, setSearch] = useState('');

  const { data: properties = [], isLoading } = useQuery({
    queryKey: ['properties'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('*')
        .order('property_name', { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = properties.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.property_name.toLowerCase().includes(q) ||
      (p.suburb || '').toLowerCase().includes(q) ||
      (p.client_name || '').toLowerCase().includes(q) ||
      (p.address || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-extrabold text-primary">Properties</h1>
        {role === 'admin' && (
          <Button variant="accent" size="default" onClick={() => navigate('/properties/new')} className="gap-2">
            <Plus className="h-5 w-5" />
            Add Property
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          placeholder="Search by name, suburb, or client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-12 h-14 rounded-2xl text-base"
        />
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <p className="text-primary font-bold">Loading properties…</p>
        </div>
      )}

      {/* Empty */}
      {!isLoading && filtered.length === 0 && (
        <div className="bg-card rounded-2xl shadow-md p-8 text-center">
          <p className="text-4xl mb-3">🏠</p>
          <p className="text-lg font-bold text-foreground mb-1">
            {search ? 'No properties match your search.' : 'No properties yet.'}
          </p>
          <p className="text-muted-foreground text-sm">
            {!search && role === 'admin' && 'Tap "+ Add Property" to get started.'}
          </p>
        </div>
      )}

      {/* Grid */}
      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((property) => (
            <button
              key={property.id}
              onClick={() => navigate(`/properties/${property.id}`)}
              className="w-full text-left bg-card rounded-2xl shadow-md p-5 hover:shadow-lg transition-shadow border border-border"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="text-lg font-bold text-foreground leading-tight">{property.property_name}</h3>
                <span
                  className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full ${
                    property.status === 'active'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {property.status === 'active' ? 'Active' : 'Inactive'}
                </span>
              </div>

              {(property.address || property.suburb) && (
                <p className="text-sm text-muted-foreground mb-3 truncate">
                  {[property.address, property.suburb, property.state, property.postcode].filter(Boolean).join(', ')}
                </p>
              )}

              <div className="flex items-center gap-4 mb-3">
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <BedDouble className="h-4 w-4" />
                  <span className="font-semibold">{property.bedrooms || 0}</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Bath className="h-4 w-4" />
                  <span className="font-semibold">{property.bathrooms || 0}</span>
                </div>
              </div>

              {property.client_name && (
                <p className="text-sm font-semibold text-muted-foreground">
                  Client: {property.client_name}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
