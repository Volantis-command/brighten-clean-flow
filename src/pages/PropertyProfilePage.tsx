import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Pencil, BedDouble, Bath, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';

function CollapsibleSection({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-card rounded-2xl shadow-md overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 text-left"
      >
        <h2 className="text-lg font-bold text-primary">{title}</h2>
        {open ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
      </button>
      {open && <div className="px-5 pb-5 pt-0">{children}</div>}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="py-2 border-b border-border last:border-b-0">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function SensitiveField({ label, value }: { label: string; value: string | null | undefined }) {
  const [revealed, setRevealed] = useState(false);
  if (!value) return null;
  return (
    <div className="py-2 border-b border-border last:border-b-0">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
      <div className="flex items-center gap-2">
        <p className={`text-sm font-semibold text-foreground ${!revealed ? 'blur-sm select-none' : ''}`}>
          {value}
        </p>
        <button onClick={() => setRevealed(!revealed)} className="text-muted-foreground hover:text-foreground">
          {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export default function PropertyProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();

  const { data: property, isLoading } = useQuery({
    queryKey: ['property', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('properties').select('*').eq('id', id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch default cleaner name
  const { data: defaultCleaner } = useQuery({
    queryKey: ['cleaner-profile', property?.default_cleaner_id],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('full_name').eq('id', property!.default_cleaner_id!).single();
      if (error) return null;
      return data;
    },
    enabled: !!property?.default_cleaner_id,
  });

  // Job history
  const { data: jobs = [] } = useQuery({
    queryKey: ['property-jobs', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, scheduled_date, status, cleaner_1_id, cleaner_2_id')
        .eq('property_id', id!)
        .order('scheduled_date', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  // Photos
  const { data: photos = [] } = useQuery({
    queryKey: ['property-photos', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('photos')
        .select('id, file_url, room_label, taken_at')
        .eq('property_id', id!)
        .order('taken_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-primary font-bold text-lg">Loading property…</p>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="text-center py-20">
        <p className="text-lg font-bold text-foreground mb-2">Property not found</p>
        <Button variant="outline" onClick={() => navigate('/properties')}>Back to Properties</Button>
      </div>
    );
  }

  const statusConfig: Record<string, { label: string; className: string }> = {
    scheduled: { label: 'Scheduled', className: 'bg-muted text-muted-foreground' },
    in_progress: { label: 'In Progress', className: 'bg-accent text-accent-foreground' },
    complete: { label: 'Complete', className: 'bg-primary text-primary-foreground' },
    flagged: { label: 'Flagged', className: 'bg-destructive text-destructive-foreground' },
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back & Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/properties')} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-primary">{property.property_name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {[property.address, property.suburb, property.state, property.postcode].filter(Boolean).join(', ')}
          </p>
        </div>
        {role === 'admin' && (
          <Button variant="outline" onClick={() => navigate(`/properties/${id}/edit`)} className="gap-2 shrink-0">
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        )}
      </div>

      {/* Property Details */}
      <CollapsibleSection title="Property Details">
        <DetailRow label="Property Type" value={property.property_type} />
        <DetailRow label="Address" value={[property.address, property.suburb, property.state, property.postcode].filter(Boolean).join(', ')} />
        <div className="flex gap-6 py-2">
          <div className="flex items-center gap-2">
            <BedDouble className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-bold text-foreground">{property.bedrooms || 0} beds</span>
          </div>
          <div className="flex items-center gap-2">
            <Bath className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-bold text-foreground">{property.bathrooms || 0} baths</span>
          </div>
        </div>
      </CollapsibleSection>

      {/* Access */}
      <CollapsibleSection title="Access">
        <DetailRow label="Access Method" value={property.access_method} />
        <SensitiveField label="Access Code" value={property.access_code} />
        <SensitiveField label="Access Notes" value={property.access_notes} />
      </CollapsibleSection>

      {/* Client Info */}
      <CollapsibleSection title="Client Info">
        <DetailRow label="Client Name" value={property.client_name} />
        <DetailRow label="Billing Email" value={property.billing_email} />
        <DetailRow label="Payment Terms" value={property.payment_terms} />
      </CollapsibleSection>

      {/* Operations */}
      <CollapsibleSection title="Operations">
        <DetailRow label="Clean Frequency" value={property.clean_frequency} />
        <DetailRow label="Turnaround Window" value={property.turnaround_window} />
        <DetailRow label="Default Cleaner" value={defaultCleaner?.full_name || (property.default_cleaner_id ? 'Assigned' : 'None')} />
        <DetailRow label="Status" value={property.status === 'active' ? 'Active' : 'Inactive'} />
      </CollapsibleSection>

      {/* Pricing — Admin only */}
      {role === 'admin' && (
        <CollapsibleSection title="Pricing">
          {[
            { label: 'Airbnb / Short-Stay Turnover', value: property.price_turnover },
            { label: 'Deep Clean', value: property.price_deep_clean },
            { label: 'Bond / End of Lease Clean', value: property.price_end_of_lease },
            { label: 'Post-Renovation Clean', value: property.price_post_build },
          ].map(({ label, value }) => (
            <div key={label} className="py-2 border-b border-border last:border-b-0">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
              {value ? (
                <p className="text-sm font-semibold text-foreground">
                  ${Number(value).toFixed(2)} ex GST · ${(Number(value) * 1.1).toFixed(2)} inc GST
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Not set</p>
              )}
            </div>
          ))}
          <DetailRow label="Notes" value={property.pricing_notes} />
          <Button variant="outline" size="sm" onClick={() => navigate(`/properties/${id}/edit`)} className="mt-2 gap-1.5">
            <Pencil className="h-3.5 w-3.5" /> Edit Pricing
          </Button>
        </CollapsibleSection>
      )}

      {/* Host Preferences */}
      <CollapsibleSection title="Host Preferences">
        <DetailRow label="Host Preferences" value={property.host_preferences} />
        <DetailRow label="Product Restrictions" value={property.product_restrictions} />
        <DetailRow label="Linen Fold Style" value={property.linen_fold_style} />
        <DetailRow label="Amenities Notes" value={property.amenities_notes} />
      </CollapsibleSection>

      {/* Job History */}
      <CollapsibleSection title="Job History" defaultOpen={false}>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No jobs recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => {
              const s = statusConfig[job.status] || statusConfig.scheduled;
              return (
                <div key={job.id} className="flex items-center justify-between py-2 border-b border-border last:border-b-0">
                  <span className="text-sm font-semibold text-foreground">{job.scheduled_date}</span>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${s.className}`}>{s.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </CollapsibleSection>

      {/* Photo Library */}
      <CollapsibleSection title="Photo Library" defaultOpen={false}>
        {photos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No photos uploaded yet.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {photos.map((photo) => (
              <div key={photo.id} className="aspect-square rounded-xl overflow-hidden bg-muted">
                {photo.file_url ? (
                  <img src={photo.file_url} alt={photo.room_label || 'Property photo'} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">No image</div>
                )}
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}
