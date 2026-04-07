import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, MapPin, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PropertiesSection() {
  const navigate = useNavigate();

  const { data: properties = [], isLoading } = useQuery({
    queryKey: ['settings-properties'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('id, property_name, address, suburb, status')
        .order('property_name');
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-primary">Properties</h2>
        <Button onClick={() => navigate('/onboard')} className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold rounded-xl gap-2">
          <Plus className="w-5 h-5" />
          Add Property
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : properties.length === 0 ? (
        <div className="bg-card rounded-2xl shadow-md p-6 text-center text-muted-foreground">No properties yet.</div>
      ) : (
        <div className="space-y-2">
          {properties.map((p) => (
            <button
              key={p.id}
              onClick={() => navigate(`/properties/${p.id}`)}
              className="w-full bg-card rounded-xl shadow-sm p-4 flex items-center justify-between border border-border hover:shadow-md transition-shadow text-left"
            >
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-primary shrink-0" />
                <div>
                  <div className="font-semibold text-foreground">{p.property_name}</div>
                  <div className="text-sm text-muted-foreground">{[p.address, p.suburb].filter(Boolean).join(', ')}</div>
                </div>
              </div>
              <Badge variant={p.status === 'active' ? 'default' : 'secondary'}>
                {p.status || 'active'}
              </Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
