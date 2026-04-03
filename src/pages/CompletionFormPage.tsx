import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ArrowLeft, CheckCircle2, Camera, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import SignaturePad from '@/components/clean-workflow/SignaturePad';
import { toast } from 'sonner';

// ─── Photo field definition ───
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

// ─── Build dynamic sections ───
function buildSections(property: any): Section[] {
  const bedrooms = property?.bedrooms || 1;
  const bathrooms = property?.bathrooms || 1;
  const hasOutdoor = property?.has_outdoor_area || property?.outdoor_areas || false;

  const sections: Section[] = [];

  // Bedrooms
  for (let i = 1; i <= bedrooms; i++) {
    sections.push({
      id: `bedroom_${i}`,
      title: `Bedroom ${i}`,
      fields: [
        { key: 'wide_shot', label: `Bedroom ${i} — wide shot`, required: true },
        { key: 'bed_made', label: 'Bed made — linen and pillows close-up', required: true },
        { key: 'wardrobe', label: 'Wardrobe/closet — open, wiped and clear', required: true },
        { key: 'surfaces', label: 'Bedside tables/surfaces — dusted and clear', required: true },
      ],
    });
  }

  // Bathrooms
  for (let i = 1; i <= bathrooms; i++) {
    sections.push({
      id: `bathroom_${i}`,
      title: `Bathroom ${i}`,
      fields: [
        { key: 'wide_shot', label: `Bathroom ${i} — wide shot`, required: true },
        { key: 'shower', label: 'Shower interior — clean', required: true },
        { key: 'toilet', label: 'Inside toilet bowl — clean', required: true },
        { key: 'vanity', label: 'Bathroom bench/vanity — clean and clear', required: true },
        { key: 'mirror', label: 'Mirror — streak-free', required: true },
        { key: 'towels', label: 'Towels — folded and placed', required: true },
      ],
    });
  }

  // Kitchen
  sections.push({
    id: 'kitchen',
    title: 'Kitchen',
    fields: [
      { key: 'wide_shot', label: 'Kitchen — wide shot', required: true },
      { key: 'oven', label: 'Oven — door open, interior clean', required: true },
      { key: 'stovetop', label: 'Stovetop/cooktop — clean', required: true },
      { key: 'microwave', label: 'Microwave — door open, interior clean', required: true },
      { key: 'coffee_machine', label: 'Coffee machine — clean and descaled', required: true },
      { key: 'toaster', label: 'Toaster — emptied and clean', required: true },
      { key: 'sink', label: 'Sink — clean and dry', required: true },
      { key: 'dishwasher', label: 'Dishwasher — empty and clean', required: true },
      { key: 'benchtops', label: 'Benchtops/counters — wiped and clear', required: true },
      { key: 'fridge', label: 'Fridge — exterior and interior clean', required: true },
    ],
  });

  // Living & Dining
  sections.push({
    id: 'living_dining',
    title: 'Living & Dining',
    fields: [
      { key: 'wide_shot', label: 'Living area — wide shot', required: true },
      { key: 'couch', label: 'Couch and cushions — arranged', required: true },
      { key: 'dining_table', label: 'Dining table — clean and set', required: true },
    ],
  });

  // Laundry
  sections.push({
    id: 'laundry',
    title: 'Laundry',
    fields: [
      { key: 'washing_machine', label: 'Washing machine — clean exterior', required: true },
      { key: 'washing_filter', label: 'Washing machine filter — removed and photographed clean', required: true },
      { key: 'dryer', label: 'Dryer — clean exterior', required: true },
      { key: 'dryer_filter', label: 'Dryer lint filter — removed and photographed clean', required: true },
      { key: 'vacuum_filter', label: 'In-house vacuum filter — removed and photographed clean', required: true },
    ],
  });

  // Outdoor
  if (hasOutdoor) {
    sections.push({
      id: 'outdoor',
      title: 'Outdoor / Balcony',
      fields: [
        { key: 'wide_shot', label: 'Balcony/outdoor area — wide shot', required: true },
        { key: 'furniture', label: 'Outdoor furniture — wiped and arranged', required: true },
      ],
    });
  }

  // General completion
  sections.push({
    id: 'general',
    title: 'General Completion',
    fields: [
      { key: 'bins', label: 'All bins emptied — photo of empty bins', required: true },
      { key: 'entry', label: 'Entry/front door area — clean', required: true },
      { key: 'locked', label: 'Property locked and secured — photo of door/lock', required: true },
    ],
  });

  return sections;
}

// ─── Types for form data ───
type FormData = Record<string, Record<string, string>>;
type SignatureData = {
  cleaner_1?: { name: string; signature_data_url: string };
  cleaner_2?: { name: string; signature_data_url: string };
};

export default function CompletionFormPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<FormData>({});
  const [signatures, setSignatures] = useState<SignatureData>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Fetch job + property
  const { data: job, isLoading } = useQuery({
    queryKey: ['completion-form-job', jobId],
    enabled: !!jobId && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('*, properties(*)')
        .eq('id', jobId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Fetch cleaner profiles
  const cleanerIds = [job?.cleaner_1_id, job?.cleaner_2_id].filter(Boolean) as string[];
  const { data: profiles = [] } = useQuery({
    queryKey: ['completion-profiles', cleanerIds.join(',')],
    enabled: cleanerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name').in('id', cleanerIds);
      return (data ?? []).map((p: any) => ({ id: p.id, full_name: p.full_name || 'Unknown' }));
    },
  });

  const property = job?.properties as any;
  const sections = property ? buildSections(property) : [];

  // Load existing form data on mount
  useEffect(() => {
    if (!job) return;
    if (job.completion_form_data && typeof job.completion_form_data === 'object') {
      setFormData(job.completion_form_data as FormData);
    }
    if (job.completion_signatures && typeof job.completion_signatures === 'object') {
      setSignatures(job.completion_signatures as SignatureData);
    }
    // Set started_at
    if (!job.completion_form_started_at) {
      supabase.from('jobs').update({
        completion_form_started_at: new Date().toISOString(),
      }).eq('id', job.id).then(() => {});
    }
  }, [job?.id]);

  // Save form data to DB
  const saveFormData = useCallback(async (newData: FormData) => {
    if (!job) return;
    await supabase.from('jobs').update({
      completion_form_data: newData as any,
    }).eq('id', job.id);
  }, [job?.id]);

  // Upload photo
  async function handlePhotoUpload(sectionId: string, fieldKey: string, file: File) {
    if (!job) return;
    const uploadKey = `${sectionId}_${fieldKey}`;
    setUploading(prev => ({ ...prev, [uploadKey]: true }));

    const path = `jobs/${job.id}/completion/${sectionId}_${fieldKey}_${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('job-photos').upload(path, file, { contentType: file.type });

    if (error) {
      toast.error('Photo upload failed');
      setUploading(prev => ({ ...prev, [uploadKey]: false }));
      return;
    }

    const { data: urlData } = supabase.storage.from('job-photos').getPublicUrl(path);
    const url = urlData.publicUrl;

    const newData = { ...formData };
    if (!newData[sectionId]) newData[sectionId] = {};
    newData[sectionId][fieldKey] = url;
    setFormData(newData);
    await saveFormData(newData);

    // Also insert into job_photos
    const storagePath = url.split('/job-photos/')[1] ?? '';
    await supabase.from('job_photos').insert({
      job_id: job.id,
      storage_path: storagePath,
      public_url: url,
      room_label: `${sectionId} - ${fieldKey}`,
    });

    setUploading(prev => ({ ...prev, [uploadKey]: false }));
  }

  function handleFileChange(sectionId: string, fieldKey: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handlePhotoUpload(sectionId, fieldKey, file);
      e.target.value = '';
    };
  }

  function removePhoto(sectionId: string, fieldKey: string) {
    const newData = { ...formData };
    if (newData[sectionId]) {
      delete newData[sectionId][fieldKey];
    }
    setFormData(newData);
    saveFormData(newData);
  }

  // Stats
  const totalRequired = sections.reduce((sum, s) => sum + s.fields.filter(f => f.required).length, 0);
  const totalUploaded = sections.reduce((sum, s) => {
    return sum + s.fields.filter(f => f.required && formData[s.id]?.[f.key]).length;
  }, 0);
  const progressPct = totalRequired > 0 ? Math.round((totalUploaded / totalRequired) * 100) : 0;

  function isSectionComplete(section: Section): boolean {
    return section.fields.every(f => !f.required || formData[section.id]?.[f.key]);
  }

  // Signature check
  const requiredSigCount = cleanerIds.length || 1;
  const hasSig1 = !!signatures.cleaner_1?.signature_data_url;
  const hasSig2 = requiredSigCount >= 2 ? !!signatures.cleaner_2?.signature_data_url : true;
  const allSigned = hasSig1 && hasSig2;

  const canSubmit = totalUploaded >= totalRequired && allSigned;

  // Find first incomplete section for default open
  const firstIncomplete = sections.find(s => !isSectionComplete(s));
  const defaultOpen = firstIncomplete?.id || sections[0]?.id || '';

  // Handle signature change
  async function handleSignatureChange(slot: 'cleaner_1' | 'cleaner_2', name: string, dataUrl: string) {
    const newSigs = { ...signatures, [slot]: { name, signature_data_url: dataUrl } };
    setSignatures(newSigs);
    if (job) {
      await supabase.from('jobs').update({ completion_signatures: newSigs as any }).eq('id', job.id);
    }
  }

  function clearSignature(slot: 'cleaner_1' | 'cleaner_2') {
    const newSigs = { ...signatures };
    delete newSigs[slot];
    setSignatures(newSigs);
    if (job) {
      supabase.from('jobs').update({ completion_signatures: newSigs as any }).eq('id', job.id);
    }
  }

  async function handleSubmit() {
    if (!job) return;
    setSubmitting(true);
    setShowConfirm(false);

    await supabase.from('jobs').update({
      completion_form_completed_at: new Date().toISOString(),
      completion_form_data: formData as any,
      completion_signatures: signatures as any,
    }).eq('id', job.id);

    queryClient.invalidateQueries({ queryKey: ['clean-workflow-job', jobId] });
    toast.success('Completion form saved');
    setSubmitting(false);
    // Navigate back — Part 3 will handle clock-off from here
    navigate(`/clean/${job.id}`);
  }

  if (isLoading || !job) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto pb-28">
      {/* Sticky progress header */}
      <div className="sticky top-0 z-50 bg-card border-b border-border px-4 py-3 space-y-2">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/clean/${job.id}`)} className="text-muted-foreground hover:text-foreground p-1">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-bold text-foreground text-base flex-1">Complete Your Clean</h1>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground font-medium">
            <span>Photos: {totalUploaded} of {totalRequired} uploaded</span>
            <span>{progressPct}%</span>
          </div>
          <Progress value={progressPct} className="h-2" />
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 px-4 py-4">
        <Accordion type="single" collapsible defaultValue={defaultOpen}>
          {sections.map(section => {
            const complete = isSectionComplete(section);
            return (
              <AccordionItem key={section.id} value={section.id} className="border rounded-2xl mb-3 overflow-hidden border-border">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-2 w-full">
                    {complete && <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />}
                    <span className="font-bold text-foreground text-sm">{section.title}</span>
                    <span className="text-xs text-muted-foreground ml-auto mr-2">
                      {section.fields.filter(f => f.required && formData[section.id]?.[f.key]).length}/{section.fields.filter(f => f.required).length}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-3">
                    {section.fields.map(field => {
                      const uploadKey = `${section.id}_${field.key}`;
                      const photoUrl = formData[section.id]?.[field.key];
                      const isUploading = uploading[uploadKey];

                      return (
                        <div key={field.key} className="space-y-1.5">
                          <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                            {photoUrl && <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
                            {field.label}
                            {field.required && <span className="text-destructive">*</span>}
                          </label>
                          <input
                            ref={el => { fileRefs.current[uploadKey] = el; }}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={handleFileChange(section.id, field.key)}
                          />
                          {photoUrl ? (
                            <div className="relative w-full">
                              <img
                                src={photoUrl}
                                alt={field.label}
                                className="w-full h-32 object-cover rounded-xl border border-border"
                                onClick={() => fileRefs.current[uploadKey]?.click()}
                              />
                              <div className="absolute top-1 right-1 flex gap-1">
                                <button
                                  onClick={() => removePhoto(section.id, field.key)}
                                  className="bg-destructive text-destructive-foreground rounded-full p-1"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              <div className="absolute bottom-1 left-1 bg-green-600 text-white rounded-full p-0.5">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => fileRefs.current[uploadKey]?.click()}
                              disabled={isUploading}
                              className="w-full h-24 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center text-muted-foreground hover:bg-secondary/50 transition-colors"
                            >
                              {isUploading ? (
                                <Loader2 className="h-6 w-6 animate-spin" />
                              ) : (
                                <Camera className="h-6 w-6" />
                              )}
                              <span className="text-[10px] font-bold mt-1">
                                {isUploading ? 'Uploading...' : 'Take Photo'}
                              </span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>

        {/* Team Sign-Off */}
        <div className="mt-6 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Team Sign-Off</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Both cleaners must sign to confirm they have cross-checked the entire property and are satisfied with the standard of clean.
            </p>
          </div>

          {/* Cleaner 1 */}
          <SignatureBlock
            slot="cleaner_1"
            label="Cleaner 1"
            defaultName={profiles.find(p => p.id === job.cleaner_1_id)?.full_name || ''}
            signatureData={signatures.cleaner_1}
            onChange={(name, dataUrl) => handleSignatureChange('cleaner_1', name, dataUrl)}
            onClear={() => clearSignature('cleaner_1')}
          />

          {/* Cleaner 2 — only if 2 cleaners assigned */}
          {cleanerIds.length >= 2 && (
            <SignatureBlock
              slot="cleaner_2"
              label="Cleaner 2"
              defaultName={profiles.find(p => p.id === job.cleaner_2_id)?.full_name || ''}
              signatureData={signatures.cleaner_2}
              onChange={(name, dataUrl) => handleSignatureChange('cleaner_2', name, dataUrl)}
              onClear={() => clearSignature('cleaner_2')}
            />
          )}
        </div>
      </main>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4 safe-area-bottom z-50">
        <Button
          size="lg"
          className={`w-full h-16 text-lg font-extrabold rounded-2xl max-w-lg mx-auto block ${
            canSubmit
              ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          }`}
          onClick={() => canSubmit && setShowConfirm(true)}
          disabled={!canSubmit || submitting}
        >
          {submitting ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : <CheckCircle2 className="h-6 w-6 mr-2" />}
          Clock Off & Submit
        </Button>
      </div>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ready to clock off?</AlertDialogTitle>
            <AlertDialogDescription>
              Make sure you have completed all areas and both cleaners have signed off.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmit}>Yes, Clock Off</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Signature Block sub-component ───
interface SignatureBlockProps {
  slot: string;
  label: string;
  defaultName: string;
  signatureData?: { name: string; signature_data_url: string };
  onChange: (name: string, dataUrl: string) => void;
  onClear: () => void;
}

function SignatureBlock({ slot, label, defaultName, signatureData, onChange, onClear }: SignatureBlockProps) {
  const [name, setName] = useState(signatureData?.name || defaultName);
  const hasSig = !!signatureData?.signature_data_url;

  useEffect(() => {
    if (!signatureData?.name && defaultName) setName(defaultName);
  }, [defaultName]);

  return (
    <div className="border border-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        {hasSig && <CheckCircle2 className="h-5 w-5 text-green-600" />}
        <h3 className="font-bold text-foreground text-sm">{label}</h3>
      </div>
      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Full name"
        className="w-full border border-input rounded-xl px-3 py-2 text-sm bg-background text-foreground"
      />
      <SignaturePad
        onEnd={(dataUrl) => onChange(name, dataUrl)}
        existingSignature={signatureData?.signature_data_url}
      />
      {hasSig && (
        <button onClick={onClear} className="text-xs text-destructive font-medium hover:underline">
          Clear Signature
        </button>
      )}
    </div>
  );
}
