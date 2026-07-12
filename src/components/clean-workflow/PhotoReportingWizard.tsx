/**
 * End-of-Clean Master Form — matches Brendan's paper checklist exactly
 * (see Downloads/MASTER FORM Cleaning Checklist PDF).
 *
 * Cleaner taps "Complete Job" → this form opens → walks section by section:
 *   Lounge → Kitchen → Dining → Bedrooms × N → Bathrooms × N → General
 *   → Final (bin liners Y/N + extra images + signatures + comments) → Submit
 *
 * Sections are driven by property.bedrooms / property.bathrooms so the form
 * scales to the property. Lounge/Dining always shown — if the property
 * doesn't have one, cleaner takes a wide shot of whatever is there (Brendan's
 * guidance 2026-04-22: we'll do property-specific forms later).
 *
 * On submit: photos → job_photos (with room_label for Forms tab grouping);
 * bin liners / extras / signatures / comments → jobs.completion_form_data
 * + jobs.completion_signatures + jobs.completion_form_completed_at.
 * Job status → completed. Existing FormsTab on PropertyProfilePage reads
 * from these fields with no changes needed.
 */

import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { sendJobSms } from '@/lib/sendJobSms';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Camera, Loader2, X, ChevronRight, CheckCircle2, Pen, Check } from 'lucide-react';
import { toast } from 'sonner';
import SignaturePadCanvas from '@/components/clean-workflow/SignaturePad';

// ─── Types ───

interface PhotoField {
  key: string;
  label: string;
  required: boolean;
}

interface Section {
  id: string;
  title: string;
  fields: PhotoField[];
}

interface Props {
  job: any;
  property: any;
  sections: Section[];
  cleanerProfiles: { id: string; full_name: string }[];
  userId: string;
  onComplete: () => void;
}

// ─── Build sections matching the Master Form PDF ───

export function buildPhotoSections(property: any, _cleanType?: string | null): Section[] {
  const bedrooms = Math.max(1, property?.bedrooms || 1);
  const bathrooms = Math.max(1, property?.bathrooms || 1);

  const sections: Section[] = [];

  // 1. Lounge
  sections.push({
    id: 'lounge',
    title: 'Lounge',
    fields: [
      { key: 'lounge_wide', label: 'Photo of lounge area — capturing couch and surroundings', required: true },
      { key: 'lounge_angle', label: 'Different angle of lounge', required: true },
    ],
  });

  // 2. Kitchen (11 prompts from PDF)
  sections.push({
    id: 'kitchen',
    title: 'Kitchen',
    fields: [
      { key: 'sink', label: 'Sink — clearly showing no crumbs', required: true },
      { key: 'stovetop', label: 'Stove top — clean, no crumbs', required: true },
      { key: 'microwave', label: 'Microwave — clean, no crumbs', required: true },
      { key: 'fridge', label: 'Fridge — no crumbs, including in door storage', required: true },
      { key: 'freezer', label: 'Freezer — cleaned and empty', required: true },
      { key: 'dishwasher', label: 'Dishwasher — empty and clean', required: true },
      { key: 'oven_inside', label: 'Inside oven — showing new foil on tray', required: true },
      { key: 'coffee_machine', label: 'Coffee machine', required: true },
      { key: 'coffee_machine_inside', label: 'Inside coffee machine — NO POD inside', required: true },
      { key: 'toaster_top', label: 'Toaster from top — no crumbs inside', required: true },
      { key: 'benchtop', label: 'Main bench top — no crumbs', required: true },
    ],
  });

  // 3. Dining Room
  sections.push({
    id: 'dining',
    title: 'Dining Room',
    fields: [
      { key: 'dining_table', label: 'Dining room table — no crumbs', required: true },
      { key: 'dining_under', label: 'Under dining table — no crumbs', required: true },
    ],
  });

  // 4. Bedrooms — one photo per bedroom ("bed made + towels")
  for (let i = 1; i <= bedrooms; i++) {
    const title = i === 1 ? 'Main Bedroom' : `Bedroom ${i}`;
    sections.push({
      id: `bedroom_${i}`,
      title,
      fields: [
        { key: 'bed_made', label: `${title} — bed made and towels on bed`, required: true },
      ],
    });
  }

  // 5. Bathrooms — Main: 6 photos, others: 4 photos
  for (let i = 1; i <= bathrooms; i++) {
    const isMain = i === 1;
    const title = isMain ? 'Main Bathroom' : `Bathroom ${i}`;
    const fields: PhotoField[] = [
      { key: 'wide', label: `${title} — wide angle`, required: true },
      { key: 'shower', label: `${title} — shower area`, required: true },
      { key: 'toilet', label: `${title} — toilet and bin, seat up, no stains`, required: true },
      { key: 'sinks', label: `${title} — sinks, clean, no marks`, required: true },
    ];
    if (isMain) {
      fields.push(
        { key: 'toothbrush_area', label: 'Toothbrush holder and surroundings — clean', required: true },
        { key: 'bath', label: 'Bath — clean', required: true },
      );
    }
    sections.push({ id: `bathroom_${i}`, title, fields });
  }

  // 6. General (4 photos — bin-liner Y/N is on the Final step)
  sections.push({
    id: 'general',
    title: 'General',
    fields: [
      { key: 'vacuum_filter', label: 'Guest vacuum filter — empty', required: true },
      { key: 'dryer_lint', label: 'Dryer lint filter — empty', required: true },
      { key: 'washing_machine_filter', label: 'Washing machine filter', required: true },
      { key: 'guest_keys', label: 'Guest keys', required: true },
    ],
  });

  return sections;
}

// ─── Component ───

export default function PhotoReportingWizard({ job, property, sections, cleanerProfiles, userId, onComplete }: Props) {
  const totalRoomSteps = sections.length;
  const TOTAL_EXTRA_STEPS = 1; // one Final step (bin liners + extras + signatures + comments)
  const totalSteps = totalRoomSteps + TOTAL_EXTRA_STEPS;
  const [currentStep, setCurrentStep] = useState(0);
  const [photos, setPhotos] = useState<Record<string, Record<string, string>>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const currentFieldRef = useRef<{ sectionId: string; fieldKey: string }>({ sectionId: '', fieldKey: '' });

  // Extras gallery input (for "Any extra images?")
  const extrasFileRef = useRef<HTMLInputElement>(null);
  const [extrasUploading, setExtrasUploading] = useState(false);
  const [extraImages, setExtraImages] = useState<string[]>([]);

  // Final step state
  const [binLinersIn, setBinLinersIn] = useState<boolean | null>(null);
  const [binLinersNote, setBinLinersNote] = useState('');
  const [comments, setComments] = useState('');

  // Signature state
  const [sig1Name, setSig1Name] = useState(cleanerProfiles[0]?.full_name || '');
  const [sig2Name, setSig2Name] = useState(cleanerProfiles[1]?.full_name || '');
  const [sig1DataUrl, setSig1DataUrl] = useState('');
  const [sig2DataUrl, setSig2DataUrl] = useState('');
  const [sig1Walkthrough, setSig1Walkthrough] = useState(false);
  const [sig2Walkthrough, setSig2Walkthrough] = useState(false);
  const hasTwoCleaners = cleanerProfiles.length >= 2;

  const isOnFinalStep = currentStep >= totalRoomSteps;
  const currentSection = !isOnFinalStep ? sections[currentStep] : null;
  const progress = ((currentStep + 1) / totalSteps) * 100;

  const getPhoto = (sectionId: string, fieldKey: string) => photos[sectionId]?.[fieldKey] || '';
  const setPhoto = (sectionId: string, fieldKey: string, url: string) => {
    setPhotos(prev => ({
      ...prev,
      [sectionId]: { ...(prev[sectionId] || {}), [fieldKey]: url },
    }));
  };

  const canProceed = useCallback(() => {
    if (!currentSection) return true;
    return currentSection.fields
      .filter(f => f.required)
      .every(f => !!getPhoto(currentSection.id, f.key));
  }, [currentSection, photos]);

  const canSubmit = (() => {
    if (binLinersIn === null) return false;
    if (!sig1DataUrl || !sig1Walkthrough) return false;
    if (hasTwoCleaners && (!sig2DataUrl || !sig2Walkthrough)) return false;
    return true;
  })();

  const handleTakePhoto = (sectionId: string, fieldKey: string) => {
    currentFieldRef.current = { sectionId, fieldKey };
    fileRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { sectionId, fieldKey } = currentFieldRef.current;
    const uploadKey = `${sectionId}_${fieldKey}`;
    setUploading(uploadKey);

    const storagePath = `jobs/${job.id}/${sectionId}_${fieldKey}_${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('job-photos').upload(storagePath, file, { contentType: file.type });
    if (error) {
      toast.error('Upload failed');
      setUploading(null);
      e.target.value = '';
      return;
    }

    const { data } = supabase.storage.from('job-photos').getPublicUrl(storagePath);
    setPhoto(sectionId, fieldKey, data.publicUrl);

    // Save to job_photos so the property's Forms tab can display grouped by room.
    const sectionTitle = sections.find(s => s.id === sectionId)?.title || sectionId;
    const fieldLabel = sections.find(s => s.id === sectionId)?.fields.find(f => f.key === fieldKey)?.label || fieldKey;
    await supabase.from('job_photos').insert({
      job_id: job.id,
      storage_path: storagePath,
      public_url: data.publicUrl,
      room_label: `${sectionTitle} — ${fieldLabel}`,
    });

    setUploading(null);
    e.target.value = '';
  };

  const handleExtrasFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setExtrasUploading(true);
    for (const file of files) {
      const storagePath = `jobs/${job.id}/extra_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`;
      const { error } = await supabase.storage.from('job-photos').upload(storagePath, file, { contentType: file.type });
      if (error) continue;
      const { data } = supabase.storage.from('job-photos').getPublicUrl(storagePath);
      setExtraImages(prev => [...prev, data.publicUrl]);
      await supabase.from('job_photos').insert({
        job_id: job.id,
        storage_path: storagePath,
        public_url: data.publicUrl,
        room_label: 'Extra Images',
      });
    }
    setExtrasUploading(false);
    e.target.value = '';
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const now = new Date();
      const signatures: any = {};
      if (sig1DataUrl) {
        signatures.cleaner_1 = {
          name: sig1Name,
          signature_data_url: sig1DataUrl,
          walkthrough_confirmed: sig1Walkthrough,
          signed_at: now.toISOString(),
        };
      }
      if (hasTwoCleaners && sig2DataUrl) {
        signatures.cleaner_2 = {
          name: sig2Name,
          signature_data_url: sig2DataUrl,
          walkthrough_confirmed: sig2Walkthrough,
          signed_at: now.toISOString(),
        };
      }

      // completion_form_data holds the whole form: per-section photos,
      // bin liners, extras, comments. FormsTab reads this for display.
      const completionFormData = {
        photos,
        bin_liners_in: binLinersIn,
        bin_liners_note: binLinersNote || null,
        extra_images: extraImages,
        comments: comments || null,
      };

      // Finish the clean — but DON'T clock off. The cleaner stays clocked on so
      // she can finish her mop-out and then tap "Clock Out" when she actually
      // leaves. (Jess's feedback: photos are taken BEFORE mopping, so finishing
      // the report ≠ leaving the property.) Clock-off is now a separate step,
      // handled by the persistent ActiveClockBanner, which closes the time entry
      // and stamps jobs.clock_off when she taps it on her way out.
      await supabase.from('jobs').update({
        completion_form_completed_at: now.toISOString(),
        completion_form_data: completionFormData as any,
        completion_signatures: signatures,
        status: 'completed',
      } as any).eq('id', job.id);

      // SMS notifications (non-blocking)
      try {
        await sendJobSms({ job_id: job.id });
      } catch { /* non-blocking */ }
      try {
        await supabase.functions.invoke('job-completed-sms', { body: { job_id: job.id } });
      } catch { /* non-blocking */ }

      if (property?.client_type === 'airbnb') {
        try {
          await supabase.functions.invoke('guest-ready-sms', { body: { job_id: job.id } });
        } catch { /* non-blocking */ }
      }

      // Xero auto-invoice
      const { triggerJobAutoInvoice } = await import('@/lib/jobInvoice');
      await triggerJobAutoInvoice(job.id);

      toast.success('Clean finished ✓ Mop your way out, then tap Clock Out when you leave.');
      onComplete();
    } catch (e: any) {
      toast.error(e.message || 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col max-w-lg mx-auto">
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileSelected} />
      <input ref={extrasFileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleExtrasFileSelected} />

      {/* Header */}
      <div className="bg-primary text-primary-foreground px-5 py-4">
        <p className="text-xs font-semibold text-primary-foreground/60 uppercase tracking-wider">
          {isOnFinalStep ? 'Final Check' : `Section ${currentStep + 1} of ${totalRoomSteps}`}
        </p>
        <h1 className="text-xl font-extrabold mt-1">
          {isOnFinalStep ? 'Sign Off & Submit' : currentSection?.title}
        </h1>
        <p className="text-xs text-primary-foreground/70 mt-0.5">{property?.property_name}</p>
      </div>

      {/* Progress */}
      <div className="px-5 py-2">
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${progress}%`, background: '#FEDB00' }}
          />
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {!isOnFinalStep && currentSection && (
          <>
            {currentSection.fields.map(field => {
              const photoUrl = getPhoto(currentSection.id, field.key);
              const isUploading = uploading === `${currentSection.id}_${field.key}`;
              return (
                <div key={field.key} className="bg-card rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-bold text-foreground">
                      {field.label}
                      {field.required && <span className="text-destructive ml-1">*</span>}
                    </p>
                    {photoUrl && <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: '#FEDB00' }} />}
                  </div>
                  {photoUrl ? (
                    <div className="relative">
                      <img src={photoUrl} alt={field.label} className="w-full aspect-video object-cover rounded-lg" />
                      <button
                        onClick={() => setPhoto(currentSection.id, field.key, '')}
                        className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleTakePhoto(currentSection.id, field.key)}
                      disabled={isUploading}
                      className="w-full h-24 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
                    >
                      {isUploading ? (
                        <Loader2 className="h-6 w-6 animate-spin" />
                      ) : (
                        <>
                          <Camera className="h-6 w-6" />
                          <span className="text-xs font-bold mt-1">Take Photo</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </>
        )}

        {isOnFinalStep && (
          <div className="space-y-5">
            {/* Bin liners Y/N */}
            <div className="bg-card rounded-xl border border-border p-4 space-y-3">
              <p className="font-bold text-foreground">All bin liners in?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setBinLinersIn(true)}
                  className={`flex-1 h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border-2 transition-colors ${
                    binLinersIn === true
                      ? 'border-transparent text-foreground'
                      : 'border-border bg-background text-muted-foreground'
                  }`}
                  style={binLinersIn === true ? { background: '#FEDB00', color: '#0A0F0E' } : undefined}
                >
                  <Check className="h-4 w-4" /> Yes
                </button>
                <button
                  onClick={() => setBinLinersIn(false)}
                  className={`flex-1 h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border-2 transition-colors ${
                    binLinersIn === false
                      ? 'bg-destructive text-destructive-foreground border-transparent'
                      : 'border-border bg-background text-muted-foreground'
                  }`}
                >
                  <X className="h-4 w-4" /> No
                </button>
              </div>
              {binLinersIn === false && (
                <Textarea
                  value={binLinersNote}
                  onChange={e => setBinLinersNote(e.target.value)}
                  placeholder="Why? (e.g. out of liners, will restock next visit)"
                  className="rounded-xl text-sm"
                  rows={2}
                />
              )}
            </div>

            {/* Extra images gallery (optional) */}
            <div className="bg-card rounded-xl border border-border p-4 space-y-3">
              <p className="font-bold text-foreground">Any extra images? <span className="text-xs text-muted-foreground font-normal">(optional)</span></p>
              <div className="grid grid-cols-3 gap-2">
                {extraImages.map((url, i) => (
                  <div key={i} className="relative">
                    <img src={url} alt="" className="w-full aspect-square object-cover rounded-lg" />
                    <button
                      onClick={() => setExtraImages(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => extrasFileRef.current?.click()}
                  disabled={extrasUploading}
                  className="aspect-square border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
                >
                  {extrasUploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Camera className="h-5 w-5" /><span className="text-[10px] font-bold mt-1">Add</span></>}
                </button>
              </div>
            </div>

            {/* Cleaner 1 signature */}
            <div className="bg-card rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Pen className="h-4 w-4 text-primary" />
                <p className="font-bold text-foreground">Cleaner 1 Sign-Off</p>
              </div>
              <input
                type="text"
                value={sig1Name}
                onChange={e => setSig1Name(e.target.value)}
                placeholder="Full name"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sig1Walkthrough}
                  onChange={e => setSig1Walkthrough(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded"
                />
                <span className="text-sm text-foreground font-semibold">I HAVE DONE A FULL WALK THROUGH</span>
              </label>
              <SignaturePadCanvas onEnd={(dataUrl) => setSig1DataUrl(dataUrl)} />
              <p className="text-xs text-muted-foreground">
                {new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                {' · '}
                {new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>

            {hasTwoCleaners && (
              <div className="bg-card rounded-xl border border-border p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Pen className="h-4 w-4 text-primary" />
                  <p className="font-bold text-foreground">Cleaner 2 Sign-Off</p>
                </div>
                <input
                  type="text"
                  value={sig2Name}
                  onChange={e => setSig2Name(e.target.value)}
                  placeholder="Full name"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={sig2Walkthrough}
                    onChange={e => setSig2Walkthrough(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded"
                  />
                  <span className="text-sm text-foreground font-semibold">I HAVE DONE A FULL WALK THROUGH</span>
                </label>
                <SignaturePadCanvas onEnd={(dataUrl) => setSig2DataUrl(dataUrl)} />
                <p className="text-xs text-muted-foreground">
                  {new Date().toLocaleDateString('en-AU')} · {new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            )}

            {/* Comments */}
            <div className="bg-card rounded-xl border border-border p-4 space-y-3">
              <p className="font-bold text-foreground">Any comments? <span className="text-xs text-muted-foreground font-normal">(optional)</span></p>
              <Textarea
                value={comments}
                onChange={e => setComments(e.target.value)}
                placeholder="Anything admin or the client should know…"
                className="rounded-xl text-sm"
                rows={3}
              />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <div className="border-t border-border p-4 bg-background safe-area-bottom">
        <div className="flex gap-2 max-w-lg mx-auto">
          {currentStep > 0 && (
            <Button
              variant="outline"
              onClick={() => setCurrentStep(s => s - 1)}
              className="flex-1 h-14 rounded-xl font-bold"
            >
              ← Back
            </Button>
          )}

          {!isOnFinalStep ? (
            <Button
              onClick={() => setCurrentStep(s => s + 1)}
              disabled={!canProceed()}
              className="flex-1 h-14 rounded-xl font-bold text-base gap-2"
              style={{ background: '#FEDB00', color: '#0A0F0E' }}
            >
              {currentStep === totalRoomSteps - 1 ? 'Final Check' : 'Next Section'}
              <ChevronRight className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={submitting || !canSubmit}
              className="flex-1 h-14 rounded-xl font-bold text-base"
              style={{ background: '#FEDB00', color: '#0A0F0E' }}
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <CheckCircle2 className="h-5 w-5 mr-2" />}
              Finish Clean
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
