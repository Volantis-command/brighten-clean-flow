// ============================================================================
// GUIDED CLEAN COMPLETION — room-by-room, camera-first
//
// Replaces the "one long scrolling list of upload boxes" form. The cleaner is
// walked through the property in the order they actually clean it:
//
//   room → all its photos (camera stays open, prompt changes) → its tick
//   questions one at a time → a single "final look" for that room → next room
//
// …then a pack-up gate (put the gear away, mop your way out), the lock-up
// questions, and signatures. Everything autosaves locally as they go, so a
// dropped signal in a lift never loses their work.
//
// Runs at /clean/:jobId/guided alongside the existing form until it's approved.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Loader2, ArrowRight, Check, X, MinusCircle, Camera, Sparkles,
  CircleCheck, Trash2, PenLine, CloudOff, ShieldCheck,
} from 'lucide-react';
import GuidedCamera from '@/components/clean/GuidedCamera';
import SignaturePad from '@/components/clean-workflow/SignaturePad';
import { buildChecklist, type ChecklistArea, type ChecklistItem } from '@/lib/cleanChecklist';

type Answer = 'yes' | 'no' | 'na';
interface CheckAnswer { answer: Answer; note?: string; at: string }
interface Draft {
  photos: Record<string, string>;        // "area.item" -> public URL
  checks: Record<string, CheckAnswer>;   // "area.item" -> answer (+ timestamps for integrity)
  areaIdx: number;
  phase: Phase;
}
type Phase = 'intro' | 'gate' | 'photos' | 'checks' | 'recap' | 'handoff' | 'sign' | 'done';

const key = (a: string, i: string) => `${a}.${i}`;
const draftKey = (jobId: string) => `brightly-clean-draft-${jobId}`;

export default function GuidedCompletionPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>('intro');
  const [areaIdx, setAreaIdx] = useState(0);
  const [itemIdx, setItemIdx] = useState(0);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<Record<string, CheckAnswer>>({});
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [noteFor, setNoteFor] = useState<ChecklistItem | null>(null);
  const [noteText, setNoteText] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<ChecklistItem | null>(null);
  const [sig1, setSig1] = useState<string | null>(null);
  const [sig2, setSig2] = useState<string | null>(null);
  const [solo, setSolo] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  const restored = useRef(false);

  useEffect(() => {
    const on = () => setOffline(false), off = () => setOffline(true);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  /* ── Job + property + what this property has taught us ── */
  const { data, isLoading } = useQuery({
    queryKey: ['guided-job', jobId],
    queryFn: async () => {
      const { data: job } = await supabase
        .from('jobs')
        .select('id, property_id, scheduled_date, status, cleaner_1_id, cleaner_2_id, clock_on, properties(*)')
        .eq('id', jobId!)
        .single();
      const property: any = (job as any)?.properties ?? null;
      let overrides: any[] = [];
      if (property?.id) {
        const { data: ov } = await supabase
          .from('property_checklist_overrides' as any)
          .select('area_id, item_key, kind, action, label')
          .eq('property_id', property.id);
        overrides = (ov as any[]) || [];
      }
      return { job, property, overrides };
    },
    enabled: !!jobId,
  });

  const cleanType = (data?.property as any)?.clean_frequency
    ? undefined
    : undefined; // clean type comes off the property/job below
  const areas: ChecklistArea[] = useMemo(() => {
    if (!data?.property) return [];
    const type = (data.property as any)?.clean_standard || (data.job as any)?.clean_type || 'Airbnb Turnover';
    return buildChecklist(data.property, type, data.overrides as any);
  }, [data]);

  /* ── Restore a draft (dropped signal, app closed, phone locked) ── */
  useEffect(() => {
    if (restored.current || !jobId || !areas.length) return;
    restored.current = true;
    try {
      const raw = localStorage.getItem(draftKey(jobId));
      if (!raw) return;
      const d: Draft = JSON.parse(raw);
      if (!Object.keys(d.photos || {}).length && !Object.keys(d.checks || {}).length) return;
      setPhotos(d.photos || {});
      setChecks(d.checks || {});
      setAreaIdx(Math.min(d.areaIdx || 0, areas.length - 1));
      setPhase(d.phase && d.phase !== 'done' ? d.phase : 'intro');
      toast.success('Picked up where you left off');
    } catch { /* corrupt draft — start fresh */ }
  }, [jobId, areas.length]);

  /* ── Autosave every change, instantly, on the device ── */
  useEffect(() => {
    if (!jobId) return;
    try {
      localStorage.setItem(draftKey(jobId), JSON.stringify({ photos, checks, areaIdx, phase }));
    } catch { /* storage full — keep going, DB save still happens */ }
  }, [jobId, photos, checks, areaIdx, phase]);

  const area = areas[areaIdx];
  const livePhotos = useMemo(
    () => (area?.items || []).filter(i => i.kind === 'photo' && !excluded.has(key(area.id, i.key))),
    [area, excluded],
  );
  const liveChecks = useMemo(
    () => (area?.items || []).filter(i => i.kind === 'check' && !excluded.has(key(area.id, i.key))),
    [area, excluded],
  );

  /* ── Progress across every required item in the whole clean ── */
  const progress = useMemo(() => {
    const all = areas.flatMap(a => a.items.filter(i => i.required).map(i => ({ a: a.id, i })));
    const done = all.filter(({ a, i }) =>
      i.kind === 'photo' ? !!photos[key(a, i.key)] : !!checks[key(a, i.key)]).length;
    return all.length ? Math.round((done / all.length) * 100) : 0;
  }, [areas, photos, checks]);

  /* ── Upload one photo ── */
  const uploadPhoto = useCallback(async (item: ChecklistItem, blob: Blob) => {
    if (!jobId || !area) return;
    setSaving(true);
    try {
      const path = `${jobId}/${area.id}_${item.key}_${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('job-photos').upload(path, blob, { contentType: 'image/jpeg' });
      if (error) throw error;
      const { data: pub } = supabase.storage.from('job-photos').getPublicUrl(path);
      setPhotos(p => ({ ...p, [key(area.id, item.key)]: pub.publicUrl }));

      // The client-facing report reads from job_photos and groups by room_label,
      // so every shot needs a row here or the report comes out empty. Grouped by
      // ROOM (not one group per photo) so the report reads room by room.
      await supabase.from('job_photos').insert({
        job_id: jobId,
        storage_path: path,
        public_url: pub.publicUrl,
        room_label: area.title,
      } as any);
      if (itemIdx + 1 < livePhotos.length) setItemIdx(i => i + 1);
      else { setItemIdx(0); setPhase(liveChecks.length ? 'checks' : 'recap'); }
    } catch (e: any) {
      toast.error('Photo did not save — try again');
    } finally {
      setSaving(false);
    }
  }, [jobId, area, itemIdx, livePhotos.length, liveChecks.length]);

  /* ── Answer a tick question ── */
  const answer = (item: ChecklistItem, a: Answer, note?: string) => {
    if (!area) return;
    setChecks(c => ({ ...c, [key(area.id, item.key)]: { answer: a, note, at: new Date().toISOString() } }));
    if (itemIdx + 1 < liveChecks.length) setItemIdx(i => i + 1);
    else { setItemIdx(0); setPhase('recap'); }
  };

  /* ── "Not in this property" — teaches the checklist, with an audit trail ── */
  const removeItem = async (item: ChecklistItem) => {
    if (!area || !data?.property?.id) return;
    setExcluded(s => new Set(s).add(key(area.id, item.key)));
    setConfirmRemove(null);
    try {
      const { data: me } = await supabase.auth.getUser();
      await supabase.from('property_checklist_overrides' as any).upsert({
        property_id: data.property.id,
        area_id: area.id,
        item_key: item.key,
        kind: item.kind,
        action: 'exclude',
        created_by: me?.user?.id ?? null,
        job_id: jobId,
      }, { onConflict: 'property_id,area_id,item_key' });
      toast.success(`Removed for this property — we won't ask again`);
    } catch {
      toast.error('Saved for this clean, but we could not remember it');
    }
    // Step past it without losing our place.
    if (item.kind === 'photo' && itemIdx >= livePhotos.length - 1) {
      setItemIdx(0); setPhase(liveChecks.length ? 'checks' : 'recap');
    }
  };

  const nextArea = () => {
    if (areaIdx + 1 < areas.length) {
      setAreaIdx(i => i + 1);
      setItemIdx(0);
      const nxt = areas[areaIdx + 1];
      setPhase(nxt.gate ? 'gate' : 'handoff');
      window.scrollTo(0, 0);
    } else {
      setPhase('sign');
    }
  };

  const startArea = () => {
    if (!area) return;
    setItemIdx(0);
    setPhase(livePhotos.length ? 'photos' : liveChecks.length ? 'checks' : 'recap');
  };

  /* ── Submit ── */
  const submit = async () => {
    if (!jobId) return;
    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      const formData: any = { areas: {}, completed_via: 'guided_flow', integrity: {} };
      for (const a of areas) {
        formData.areas[a.id] = {
          title: a.title,
          photos: Object.fromEntries(a.items.filter(i => i.kind === 'photo')
            .map(i => [i.key, photos[key(a.id, i.key)] || null]).filter(([, v]) => v)),
          // The label is stored WITH the answer so the client report is
          // self-describing — it never has to re-derive what was asked, even if
          // the property or the template changes later.
          checks: Object.fromEntries(a.items.filter(i => i.kind === 'check')
            .map(i => {
              const ans = checks[key(a.id, i.key)];
              return ans ? [i.key, { ...ans, label: i.label }] : [i.key, null];
            }).filter(([, v]) => v)),
        };
      }
      const sigs: any = {};
      if (sig1) sigs.cleaner_1 = { name: 'Cleaner 1', signature_data_url: sig1, signed_at: now };
      if (!solo && sig2) sigs.cleaner_2 = { name: 'Cleaner 2', signature_data_url: sig2, signed_at: now };
      else if (solo) sigs.cleaner_2 = { name: 'N/A — solo clean', signature_data_url: '', signed_at: now };

      const { error } = await supabase.from('jobs').update({
        completion_form_data: formData,
        completion_signatures: sigs,
        completion_form_completed_at: now,
        completion_photos: Object.values(photos),
        status: 'completed',
      } as any).eq('id', jobId);
      if (error) throw error;

      localStorage.removeItem(draftKey(jobId));
      setPhase('done');
    } catch (e: any) {
      toast.error(e.message || 'Could not submit — your work is saved, try again');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Render ── */
  if (isLoading) return <Center><Loader2 className="w-7 h-7 animate-spin text-primary" /></Center>;
  if (!areas.length) return <Center><p className="text-muted-foreground">No checklist for this job.</p></Center>;

  const propName = (data?.property as any)?.property_name || 'this property';

  // Camera takes over the whole screen
  if (phase === 'photos' && area) {
    const item = livePhotos[itemIdx];
    if (!item) { startArea(); return null; }
    return (
      <GuidedCamera
        prompt={item.label}
        subtitle={`${area.title} · photo ${itemIdx + 1} of ${livePhotos.length}`}
        canRemove={!item.core}
        saving={saving}
        onCapture={(blob) => uploadPhoto(item, blob)}
        onNotPresent={() => setConfirmRemove(item)}
        onBack={() => setPhase('handoff')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Progress */}
      <div className="sticky top-0 z-30 bg-background/90 backdrop-blur px-5 pt-4 pb-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-extrabold text-foreground">{progress}% complete</p>
          {offline && (
            <span className="flex items-center gap-1 text-[11px] font-bold text-amber-600">
              <CloudOff className="w-3.5 h-3.5" /> Offline — saved on your phone
            </span>
          )}
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="mx-auto max-w-md px-5 py-6">
        {phase === 'intro' && (
          <Stack>
            <Sparkles className="w-8 h-8 text-primary" />
            <h1 className="text-2xl font-extrabold text-foreground">Let's finish {propName}</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              I'll take you room by room. The camera stays open and tells you what to shoot,
              then a few quick questions per room. Should take about {estimate(areas)} minutes.
            </p>
            <Big onClick={() => setPhase(area?.gate ? 'gate' : 'handoff')}>
              Start with {areas[0].title} <ArrowRight className="w-5 h-5" />
            </Big>
          </Stack>
        )}

        {phase === 'gate' && area?.gate && (
          <Stack>
            <div className="rounded-2xl border border-primary/40 bg-primary/5 p-5">
              <p className="text-[11px] font-extrabold uppercase tracking-widest text-primary">{progress}% done</p>
              <h2 className="mt-1 text-xl font-extrabold text-foreground">{area.gate.headline}</h2>
              <p className="mt-2 text-sm leading-relaxed text-foreground/80">{area.gate.body}</p>
            </div>
            <Big onClick={startArea}>{area.gate.cta}</Big>
          </Stack>
        )}

        {phase === 'handoff' && area && (
          <Stack>
            <p className="text-[11px] font-extrabold uppercase tracking-widest text-primary">
              Next room · {areaIdx + 1} of {areas.length}
            </p>
            <h2 className="text-2xl font-extrabold text-foreground">{area.title}</h2>
            {area.blurb && <p className="text-sm text-muted-foreground">{area.blurb}</p>}
            <p className="text-sm text-muted-foreground">
              {livePhotos.length} photo{livePhotos.length === 1 ? '' : 's'} · {liveChecks.length} quick question{liveChecks.length === 1 ? '' : 's'}
            </p>
            <Big onClick={startArea}>
              <Camera className="w-5 h-5" /> Start {area.title}
            </Big>
          </Stack>
        )}

        {phase === 'checks' && area && (() => {
          const item = liveChecks[itemIdx];
          if (!item) { setPhase('recap'); return null; }
          return (
            <Stack>
              <p className="text-[11px] font-extrabold uppercase tracking-widest text-primary">
                {area.title} · question {itemIdx + 1} of {liveChecks.length}
              </p>
              <h2 className="text-2xl font-extrabold leading-snug text-foreground">{item.label}</h2>
              <div className="mt-2 space-y-3">
                <button onClick={() => answer(item, 'yes')}
                  className="flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-primary text-lg font-extrabold text-primary-foreground">
                  <Check className="w-6 h-6" /> Yes, done
                </button>
                <button onClick={() => { setNoteFor(item); setNoteText(''); }}
                  className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl border-2 border-destructive/40 text-base font-extrabold text-destructive">
                  <X className="w-5 h-5" /> No / there's a problem
                </button>
                {item.na && (
                  <button onClick={() => answer(item, 'na')}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-border text-sm font-bold text-muted-foreground">
                    <MinusCircle className="w-4 h-4" /> Not applicable here
                  </button>
                )}
                {!item.core && (
                  <button onClick={() => setConfirmRemove(item)}
                    className="w-full pt-1 text-xs font-bold text-muted-foreground underline">
                    Not in this property
                  </button>
                )}
              </div>
            </Stack>
          );
        })()}

        {phase === 'recap' && area && (
          <Stack>
            <CircleCheck className="w-8 h-8 text-primary" />
            <h2 className="text-2xl font-extrabold text-foreground">{area.title} done</h2>
            <p className="text-sm text-muted-foreground">
              One last look before you move on — anything missed?
            </p>
            <div className="rounded-2xl border border-border bg-card divide-y divide-border">
              {[...livePhotos, ...liveChecks].map(i => {
                const a = i.kind === 'photo' ? (photos[key(area.id, i.key)] ? 'yes' : null) : checks[key(area.id, i.key)]?.answer;
                return (
                  <div key={i.kind + i.key} className="flex items-center gap-3 px-4 py-2.5">
                    {a === 'yes' ? <Check className="w-4 h-4 text-primary shrink-0" />
                      : a === 'na' ? <MinusCircle className="w-4 h-4 text-muted-foreground shrink-0" />
                      : a === 'no' ? <X className="w-4 h-4 text-destructive shrink-0" />
                      : <span className="w-4 h-4 rounded-full border-2 border-muted shrink-0" />}
                    <span className="text-sm text-foreground">{i.label}</span>
                  </div>
                );
              })}
            </div>
            <Big onClick={nextArea}>
              {areaIdx + 1 < areas.length ? <>Looks good — next room <ArrowRight className="w-5 h-5" /></> : <>Looks good — sign off <PenLine className="w-5 h-5" /></>}
            </Big>
            <button onClick={startArea} className="w-full text-sm font-bold text-muted-foreground underline">
              Go back through {area.title}
            </button>
          </Stack>
        )}

        {phase === 'sign' && (
          <Stack>
            <ShieldCheck className="w-8 h-8 text-primary" />
            <h2 className="text-2xl font-extrabold text-foreground">Sign off</h2>
            <p className="text-sm text-muted-foreground">
              {new Date().toLocaleString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
              {' '}— recorded automatically.
            </p>

            <div className="space-y-2">
              <p className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Cleaner 1</p>
              <SignaturePad onEnd={setSig1} existingSignature={sig1 || undefined} />
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
              <input id="solo" type="checkbox" checked={solo} onChange={e => setSolo(e.target.checked)}
                className="h-5 w-5 accent-[hsl(var(--primary))]" />
              <label htmlFor="solo" className="text-sm font-semibold text-foreground">
                I cleaned this on my own (no second cleaner)
              </label>
            </div>

            {!solo && (
              <div className="space-y-2">
                <p className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Cleaner 2</p>
                <SignaturePad onEnd={setSig2} existingSignature={sig2 || undefined} />
              </div>
            )}

            <Big onClick={submit} disabled={!sig1 || (!solo && !sig2) || submitting}>
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              Submit clean
            </Big>
          </Stack>
        )}

        {phase === 'done' && (
          <Stack>
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/15">
              <Check className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-center text-2xl font-extrabold text-foreground">Clean submitted</h2>
            <p className="text-center text-sm text-muted-foreground">
              Nice work. The photo report has gone to the office.
            </p>
            <Big onClick={() => navigate('/my-jobs')}>Back to my jobs</Big>
          </Stack>
        )}
      </div>

      {/* "No / problem" note sheet */}
      {noteFor && (
        <Sheet>
          <h3 className="text-lg font-extrabold text-foreground">What's the problem?</h3>
          <p className="mt-1 text-sm text-muted-foreground">{noteFor.label}</p>
          <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={3}
            placeholder="Tell the office what happened…"
            className="mt-3 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none" />
          <div className="mt-3 flex gap-2">
            <button onClick={() => setNoteFor(null)}
              className="h-12 flex-1 rounded-xl border border-border text-sm font-bold text-muted-foreground">Cancel</button>
            <button onClick={() => { answer(noteFor, 'no', noteText.trim() || undefined); setNoteFor(null); }}
              className="h-12 flex-[1.4] rounded-xl bg-destructive text-sm font-extrabold text-destructive-foreground">
              Report it
            </button>
          </div>
        </Sheet>
      )}

      {/* "Not in this property" confirm */}
      {confirmRemove && (
        <Sheet>
          <Trash2 className="w-6 h-6 text-destructive" />
          <h3 className="mt-2 text-lg font-extrabold text-foreground">
            Remove "{confirmRemove.label.split('—')[0].trim()}" for {propName}?
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Only do this if it genuinely isn't in this property. We'll stop asking for it here,
            and the office is told.
          </p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setConfirmRemove(null)}
              className="h-12 flex-1 rounded-xl border border-border text-sm font-bold text-muted-foreground">
              No, keep it
            </button>
            <button onClick={() => removeItem(confirmRemove)}
              className="h-12 flex-[1.4] rounded-xl bg-destructive text-sm font-extrabold text-destructive-foreground">
              Yes, not here
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

/* ── little layout helpers ── */
const Center = ({ children }: any) => (
  <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">{children}</div>
);
const Stack = ({ children }: any) => <div className="space-y-4">{children}</div>;
const Big = ({ children, onClick, disabled }: any) => (
  <button onClick={onClick} disabled={disabled}
    className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-extrabold text-primary-foreground disabled:opacity-50">
    {children}
  </button>
);
const Sheet = ({ children }: any) => (
  <div className="fixed inset-0 z-50 flex items-end bg-black/60 px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
    <div className="w-full rounded-3xl bg-card p-5 shadow-xl">{children}</div>
  </div>
);

function estimate(areas: ChecklistArea[]) {
  const req = areas.flatMap(a => a.items.filter(i => i.required));
  const secs = req.filter(i => i.kind === 'photo').length * 6 + req.filter(i => i.kind === 'check').length * 2;
  return Math.max(2, Math.round(secs / 60));
}
