import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function GuestReadyReportPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) { setNotFound(true); setLoading(false); return; }

    (async () => {
      const { data: job } = await supabase
        .from('jobs')
        .select('*, properties(property_name, address, suburb, client_type, bedrooms, bathrooms)')
        .eq('id', jobId)
        .maybeSingle();

      if (!job) { setNotFound(true); setLoading(false); return; }

      const property = (job as any).properties;
      const cleanerId = job.cleaner_1_id;
      let cleanerName = 'Cleaner';
      let cleanerScore: number | null = null;
      let cleanerJobCount = 0;

      if (cleanerId) {
        const { data: profile } = await supabase.from('profiles').select('full_name, audit_scores').eq('id', cleanerId).maybeSingle();
        if (profile) {
          cleanerName = profile.full_name || 'Cleaner';
          const scores = profile.audit_scores || [];
          if (scores.length > 0) cleanerScore = parseFloat((scores.reduce((a: number, b: number) => a + b, 0) / scores.length).toFixed(1));
        }
        const { count } = await supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('cleaner_1_id', cleanerId).eq('status', 'completed');
        cleanerJobCount = count || 0;
      }

      const { data: photos } = await supabase.from('job_photos').select('*').eq('job_id', job.id).order('room_label');

      setData({ job, property, cleanerName, cleanerScore, cleanerJobCount, photos: photos || [] });
      setLoading(false);
    })();
  }, [jobId]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (notFound || !data) return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-bold text-foreground">Report not found</h1>
      <p className="text-muted-foreground mt-2">This link may be invalid.</p>
    </div>
  );

  const { job, property, cleanerName, cleanerScore, cleanerJobCount, photos } = data;

  // Group photos by room
  const photosByRoom: Record<string, any[]> = {};
  photos.forEach((p: any) => {
    const room = p.room_label || 'General';
    if (!photosByRoom[room]) photosByRoom[room] = [];
    photosByRoom[room].push(p);
  });

  const completedTime = job.check_out_time ? format(new Date(job.check_out_time), 'h:mmaaa') : null;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="bg-primary px-5 pt-6 pb-4">
        <h1 className="text-xl font-extrabold text-primary-foreground tracking-tight" style={{ fontFamily: 'Nunito, sans-serif' }}>
          Brightly<span className="text-accent">.</span>
        </h1>
      </div>

      {/* Guest Ready banner */}
      <div className="bg-green-500 px-5 py-4 text-white flex items-center gap-3">
        <span className="text-2xl">✅</span>
        <div>
          <p className="font-bold text-sm">Property Guest Ready</p>
          {completedTime && <p className="text-xs text-white/80">Completed at {completedTime}</p>}
        </div>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto space-y-5">
        {/* Property info */}
        <div>
          <h2 className="text-lg font-bold text-foreground">{property?.property_name || 'Property'}</h2>
          <p className="text-sm text-muted-foreground">{[property?.address, property?.suburb].filter(Boolean).join(', ')}</p>
          <p className="text-sm text-muted-foreground">{job.scheduled_date ? format(new Date(job.scheduled_date + 'T00:00:00'), 'EEEE, d MMMM yyyy') : ''}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-sm font-semibold text-foreground">{cleanerName}</span>
            {cleanerScore && <span className="text-sm text-amber-500 font-bold">★ {cleanerScore}</span>}
            {cleanerJobCount > 0 && <span className="text-xs text-muted-foreground">· {cleanerJobCount} cleans</span>}
          </div>
        </div>

        {/* Photo gallery */}
        {photos.length > 0 ? (
          Object.entries(photosByRoom).map(([room, roomPhotos]) => (
            <div key={room}>
              <h3 className="text-base font-bold text-foreground mb-2">{room}</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {roomPhotos.map((p: any) => (
                  <button key={p.id} onClick={() => setLightboxUrl(p.public_url)}
                    className="aspect-square rounded-xl overflow-hidden border border-border">
                    <img src={p.public_url} alt={room} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
              {roomPhotos[0]?.uploaded_at && (
                <p className="text-xs text-muted-foreground mt-1">
                  Completed at {format(new Date(roomPhotos[0].uploaded_at), 'h:mmaaa')}
                </p>
              )}
            </div>
          ))
        ) : (
          <div className="text-center py-8 bg-card rounded-xl border border-border">
            <p className="text-muted-foreground">No photos available for this clean.</p>
          </div>
        )}

        {/* Footer text */}
        <footer className="text-center pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">Clean history · Terms · Contact</p>
        </footer>
      </div>

      {/* Sticky rebook CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur border-t border-border px-4 py-4 z-20">
        <div className="max-w-lg mx-auto">
          <Button className="w-full h-[60px] rounded-xl font-bold text-base"
            onClick={() => {
              const params = new URLSearchParams();
              if (property?.property_name) params.set('property', property.property_name);
              if (property?.suburb) params.set('suburb', property.suburb);
              if (property?.bedrooms) params.set('beds', property.bedrooms);
              if (property?.bathrooms) params.set('baths', property.bathrooms);
              window.location.href = `/airbnb?${params.toString()}`;
            }}>
            Book same cleaner for next turnover →
          </Button>
        </div>
      </div>

      {/* Lightbox */}
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
