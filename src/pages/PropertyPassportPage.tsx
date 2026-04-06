import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, X } from 'lucide-react';
import { format } from 'date-fns';

export default function PropertyPassportPage() {
  const { propertyId } = useParams<{ propertyId: string }>();
  const [property, setProperty] = useState<any>(null);
  const [jobHistory, setJobHistory] = useState<any[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!propertyId) { setNotFound(true); setLoading(false); return; }

    (async () => {
      const { data: prop } = await supabase.from('properties').select('*').eq('id', propertyId).maybeSingle();
      if (!prop) { setNotFound(true); setLoading(false); return; }
      setProperty(prop);

      // Job history
      const { data: jobs } = await supabase
        .from('jobs')
        .select('id, scheduled_date, status, cleaner_1_id, cleaner_notes, feedback_score, duration_minutes')
        .eq('property_id', propertyId)
        .in('status', ['completed', 'in_progress'])
        .order('scheduled_date', { ascending: false })
        .limit(50);

      // Fetch cleaner names
      const cleanerIds = new Set<string>();
      (jobs || []).forEach((j: any) => { if (j.cleaner_1_id) cleanerIds.add(j.cleaner_1_id); });
      let profileMap: Record<string, string> = {};
      if (cleanerIds.size > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', Array.from(cleanerIds));
        (profiles || []).forEach((p: any) => { profileMap[p.id] = p.full_name || '?'; });
      }

      setJobHistory((jobs || []).map((j: any) => ({
        ...j,
        cleanerName: j.cleaner_1_id ? profileMap[j.cleaner_1_id] || '—' : '—',
      })));

      // Photos from most recent jobs
      const jobIds = (jobs || []).slice(0, 5).map((j: any) => j.id);
      if (jobIds.length > 0) {
        const { data: jobPhotos } = await supabase.from('job_photos').select('*').in('job_id', jobIds).order('uploaded_at', { ascending: false });
        setPhotos(jobPhotos || []);
      }

      setLoading(false);
    })();
  }, [propertyId]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (notFound || !property) return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-bold text-foreground">Property not found</h1>
    </div>
  );

  const totalCleans = jobHistory.filter(j => j.status === 'completed').length;
  const avgRating = (() => {
    const rated = jobHistory.filter(j => j.feedback_score);
    if (rated.length === 0) return null;
    return (rated.reduce((s, j) => s + j.feedback_score, 0) / rated.length).toFixed(1);
  })();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary px-5 pt-6 pb-5">
        <h1 className="text-xl font-extrabold text-primary-foreground tracking-tight" style={{ fontFamily: 'Nunito, sans-serif' }}>
          Brightly<span className="text-accent">.</span>
        </h1>
        <h2 className="text-lg font-bold text-primary-foreground mt-3">{property.property_name}</h2>
        <p className="text-primary-foreground/70 text-sm">{property.address}</p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5">
        <Tabs defaultValue="details">
          <TabsList className="w-full grid grid-cols-5 h-auto">
            <TabsTrigger value="details" className="text-xs py-2">Details</TabsTrigger>
            <TabsTrigger value="access" className="text-xs py-2">Access</TabsTrigger>
            <TabsTrigger value="preferences" className="text-xs py-2">Prefs</TabsTrigger>
            <TabsTrigger value="history" className="text-xs py-2">History</TabsTrigger>
            <TabsTrigger value="photos" className="text-xs py-2">Photos</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 mt-4">
            <InfoRow label="Address" value={property.address} />
            <InfoRow label="Property type" value={property.property_type} />
            <InfoRow label="Bedrooms" value={property.bedrooms} />
            <InfoRow label="Bathrooms" value={property.bathrooms} />
            <InfoRow label="Parking" value={property.parking_instructions} />
            {totalCleans > 0 && <InfoRow label="Total cleans" value={`${totalCleans}`} />}
            {avgRating && <InfoRow label="Avg rating" value={`★ ${avgRating}`} />}
          </TabsContent>

          <TabsContent value="access" className="space-y-4 mt-4">
            <InfoRow label="Access method" value={property.access_method} />
            <InfoRow label="Lockbox / Key code" value={property.lockbox_code || property.access_code} />
            <InfoRow label="Alarm code" value={property.alarm_code} />
            <InfoRow label="Access notes" value={property.access_notes} />
            <InfoRow label="Parking" value={property.parking_instructions} />
          </TabsContent>

          <TabsContent value="preferences" className="space-y-4 mt-4">
            <div className="bg-card rounded-xl border border-border p-4">
              <h3 className="text-sm font-bold text-foreground mb-2">Things we should always do / never do</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {property.special_instructions || property.host_preferences || property.property_notes || 'No preferences set yet.'}
              </p>
            </div>
            {property.pet_situation && <InfoRow label="Pet situation" value={property.pet_situation} />}
            {property.fragrance_preference && <InfoRow label="Fragrance preference" value={property.fragrance_preference} />}
            {property.product_restrictions && <InfoRow label="Product restrictions" value={property.product_restrictions} />}
            {property.skip_areas && <InfoRow label="Areas to skip" value={property.skip_areas} />}
          </TabsContent>

          <TabsContent value="history" className="space-y-3 mt-4">
            {jobHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No clean history yet.</p>
            ) : (
              jobHistory.map((j: any) => (
                <div key={j.id} className="bg-card rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-foreground">
                        {j.scheduled_date ? format(new Date(j.scheduled_date + 'T00:00:00'), 'EEE, d MMM yyyy') : '—'}
                      </p>
                      <p className="text-xs text-muted-foreground">Cleaned by {j.cleanerName}</p>
                    </div>
                    <div className="text-right">
                      {j.feedback_score && <span className="text-amber-500 text-sm font-bold">★ {j.feedback_score}</span>}
                      {j.duration_minutes && <p className="text-xs text-muted-foreground">{j.duration_minutes} min</p>}
                    </div>
                  </div>
                  {j.cleaner_notes && <p className="text-xs text-muted-foreground mt-2 bg-muted rounded-lg p-2">{j.cleaner_notes}</p>}
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="photos" className="mt-4">
            {photos.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No photos yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((p: any) => (
                  <button key={p.id} onClick={() => setLightboxUrl(p.public_url)}
                    className="aspect-square rounded-xl overflow-hidden border border-border">
                    <img src={p.public_url} alt={p.room_label || 'Photo'} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {lightboxUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={() => setLightboxUrl(null)}>
          <button className="absolute top-4 right-4 text-white" onClick={() => setLightboxUrl(null)}>
            <X className="h-6 w-6" />
          </button>
          <img src={lightboxUrl} alt="Full size" className="max-h-[90vh] max-w-[95vw] object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  if (!value) return null;
  return (
    <div className="bg-card rounded-xl border border-border px-4 py-3 flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-foreground text-right max-w-[60%]">{value}</span>
    </div>
  );
}
