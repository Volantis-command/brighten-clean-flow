import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, User, Clock, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

export default function FormDetailPage() {
  const { formId } = useParams();
  const navigate = useNavigate();
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const { data: form, isLoading } = useQuery({
    queryKey: ['form-detail', formId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_forms')
        .select('*, jobs(property_id, scheduled_date, scheduled_time, cleaner_1_id, cleaner_2_id, properties(property_name, bedrooms, bathrooms))')
        .eq('id', formId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!formId,
  });

  // Fetch cleaner profiles
  const cleanerIds = form ? [form.cleaner_id, form.second_cleaner_id].filter(Boolean) : [];
  const { data: profiles } = useQuery({
    queryKey: ['form-detail-profiles', cleanerIds],
    queryFn: async () => {
      if (cleanerIds.length === 0) return [];
      const { data } = await supabase.from('profiles').select('id, full_name').in('id', cleanerIds as string[]);
      return data || [];
    },
    enabled: cleanerIds.length > 0,
  });

  // Fetch QC audit for this job
  const { data: qcAudit } = useQuery({
    queryKey: ['form-detail-qc', form?.job_id],
    queryFn: async () => {
      if (!form?.job_id) return null;
      const { data } = await supabase
        .from('qc_audits')
        .select('*')
        .eq('job_id', form.job_id)
        .maybeSingle();
      return data;
    },
    enabled: !!form?.job_id,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/forms')} className="flex items-center gap-2 text-primary font-bold">
          <ArrowLeft className="h-5 w-5" /> Back to Forms
        </button>
        <p className="text-muted-foreground">Form not found.</p>
      </div>
    );
  }

  const job = form.jobs as any;
  const formData = (form.form_data || {}) as any;
  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p.full_name || 'Unknown']));
  const propertyName = job?.properties?.property_name || 'Unknown Property';

  const formatTime = (t: string) => {
    if (!t) return '--:--';
    try { return format(parseISO(t), 'h:mm a'); } catch { return t; }
  };

  const yesNoFields = [
    { key: 'property_vacant', label: 'Property Vacant' },
    { key: 'linen_delivered', label: 'Linen Delivered' },
    { key: 'final_windows', label: 'Windows Locked' },
    { key: 'final_doors', label: 'Doors Locked' },
  ];

  const roomPhotos: Record<string, string[]> = formData.room_photos || {};
  const roomComplete: Record<string, boolean> = formData.room_complete || {};

  return (
    <div className="space-y-4 pb-8">
      <button onClick={() => navigate('/forms')} className="flex items-center gap-2 text-primary font-bold text-sm">
        <ArrowLeft className="h-4 w-4" /> Back to Forms
      </button>

      {/* Header */}
      <div className="bg-card rounded-2xl shadow-md p-5 space-y-3">
        <h1 className="text-xl font-extrabold text-primary">{propertyName}</h1>
        {form.submitted_at && (
          <p className="text-sm text-muted-foreground">
            Submitted {format(parseISO(form.submitted_at), 'EEEE d MMMM yyyy, h:mm a')}
          </p>
        )}
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <User className="h-4 w-4" />
            <span>
              {form.cleaner_id ? profileMap.get(form.cleaner_id) || 'Unknown' : '--'}
              {form.second_cleaner_id ? ` & ${profileMap.get(form.second_cleaner_id) || 'Unknown'}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>{formatTime(formData.time_in)} → {formatTime(formData.time_out)}</span>
          </div>
        </div>
      </div>

      {/* Checklist Answers */}
      <div className="bg-card rounded-2xl shadow-md p-5 space-y-3">
        <h2 className="text-lg font-bold text-foreground">Checklist</h2>
        <div className="grid grid-cols-2 gap-3">
          {yesNoFields.map(({ key, label }) => {
            const val = formData[key];
            return (
              <div key={key} className="flex items-center gap-2">
                {val === 'yes' ? (
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                ) : val === 'no' ? (
                  <XCircle className="h-4 w-4 text-destructive shrink-0" />
                ) : (
                  <div className="h-4 w-4 rounded-full bg-muted shrink-0" />
                )}
                <span className="text-sm text-foreground">{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Damage */}
      {formData.damage_noted === 'yes' && (
        <div className="bg-card rounded-2xl shadow-md p-5 space-y-2 border border-destructive/30">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <h2 className="text-lg font-bold text-destructive">Damage Reported</h2>
          </div>
          <p className="text-sm text-foreground">{formData.damage_description || 'No description provided.'}</p>
          {formData.damage_photo_url && (
            <img
              src={formData.damage_photo_url}
              alt="Damage"
              className="rounded-xl max-h-48 object-cover cursor-pointer"
              onClick={() => setLightboxUrl(formData.damage_photo_url)}
            />
          )}
        </div>
      )}

      {/* Issues */}
      {formData.issues_to_report && (
        <div className="bg-card rounded-2xl shadow-md p-5 space-y-2">
          <h2 className="text-lg font-bold text-foreground">Issues Reported</h2>
          <p className="text-sm text-foreground">{formData.issues_to_report}</p>
        </div>
      )}

      {/* Room Photos */}
      {Object.keys(roomPhotos).length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-foreground">Room Photos</h2>
          {Object.entries(roomPhotos).map(([room, photos]) => (
            <div key={room} className="bg-card rounded-2xl shadow-md p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-foreground capitalize">{room.replace(/_/g, ' ')}</h3>
                {roomComplete[room] ? (
                  <Badge className="bg-primary text-primary-foreground">Complete</Badge>
                ) : (
                  <Badge variant="secondary">Incomplete</Badge>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(photos || []).map((url: string, i: number) => (
                  <img
                    key={i}
                    src={url}
                    alt={`${room} photo ${i + 1}`}
                    className="rounded-xl aspect-square object-cover cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => setLightboxUrl(url)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sign-off */}
      <div className="bg-card rounded-2xl shadow-md p-5 space-y-2">
        <h2 className="text-lg font-bold text-foreground">Sign-off</h2>
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            {formData.cleaner1_signoff ? (
              <CheckCircle2 className="h-4 w-4 text-primary" />
            ) : (
              <div className="h-4 w-4 rounded-full bg-muted" />
            )}
            <span>Cleaner 1: {formData.cleaner1_signoff ? formatTime(formData.cleaner1_signoff_time) : 'Not signed'}</span>
          </div>
          <div className="flex items-center gap-2">
            {formData.cleaner2_signoff ? (
              <CheckCircle2 className="h-4 w-4 text-primary" />
            ) : (
              <div className="h-4 w-4 rounded-full bg-muted" />
            )}
            <span>Cleaner 2: {formData.cleaner2_signoff ? formatTime(formData.cleaner2_signoff_time) : 'Not signed'}</span>
          </div>
        </div>
      </div>

      {/* QC Report */}
      {qcAudit && (
        <div className="bg-card rounded-2xl shadow-md p-5 space-y-3 border border-primary/20">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-primary">QC Report</h2>
            <Badge className={qcAudit.result === 'pass' ? 'bg-primary text-primary-foreground' : 'bg-destructive text-destructive-foreground'}>
              {qcAudit.result === 'pass' ? 'Pass' : 'Fail'} — {qcAudit.percentage}%
            </Badge>
          </div>
          <div className="text-sm space-y-1">
            <p className="text-muted-foreground">Score: {qcAudit.total_score} / {qcAudit.max_score}</p>
            {qcAudit.positive_feedback && <p className="text-foreground"><strong>Positive:</strong> {qcAudit.positive_feedback}</p>}
            {qcAudit.improvement_feedback && <p className="text-foreground"><strong>Improvement:</strong> {qcAudit.improvement_feedback}</p>}
            {qcAudit.issues_text && <p className="text-destructive"><strong>Issues:</strong> {qcAudit.issues_text}</p>}
          </div>
          {/* Section scores */}
          {qcAudit.scores && typeof qcAudit.scores === 'object' && (
            <div className="space-y-1">
              {Object.entries(qcAudit.scores as Record<string, any>).map(([section, score]) => (
                <div key={section} className="flex justify-between text-sm">
                  <span className="text-foreground capitalize">{section.replace(/_/g, ' ')}</span>
                  <span className="font-bold text-foreground">{typeof score === 'number' ? score : JSON.stringify(score)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Photo Lightbox */}
      <Dialog open={!!lightboxUrl} onOpenChange={() => setLightboxUrl(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-1 bg-black/90 border-none">
          {lightboxUrl && (
            <img
              src={lightboxUrl}
              alt="Full size"
              className="w-full h-full object-contain max-h-[90vh]"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
