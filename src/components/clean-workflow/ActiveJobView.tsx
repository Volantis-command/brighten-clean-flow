import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { MapPin, Navigation, Key, Pause, Play, Plus, Camera, Loader2, X, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  job: any;
  property: any;
  userId: string;
  onRefresh: () => void;
}

function openMaps(address: string) {
  const encoded = encodeURIComponent(address);
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
  window.open(
    isIos ? `maps://maps.apple.com/?q=${encoded}` : `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    '_blank',
  );
}

export default function ActiveJobView({ job, property, userId, onRefresh }: Props) {
  const navigate = useNavigate();
  const [elapsed, setElapsed] = useState('00:00:00');
  const [isPaused, setIsPaused] = useState(!!job.paused_at);
  const [pausing, setPausing] = useState(false);
  const [accessOpen, setAccessOpen] = useState(true);

  // Quick note state
  const [showNote, setShowNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [notePhoto, setNotePhoto] = useState<string | null>(null);
  const [uploadingNote, setUploadingNote] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const noteFileRef = useRef<HTMLInputElement>(null);

  // Timer
  useEffect(() => {
    if (!job.clock_on) return;
    const clockOnMs = new Date(job.clock_on).getTime();
    const totalPaused = (job.total_pause_seconds || 0) * 1000;

    const update = () => {
      let now = Date.now();
      if (job.paused_at) {
        // When paused, freeze at pause time
        now = new Date(job.paused_at).getTime();
      }
      const netMs = Math.max(0, now - clockOnMs - totalPaused);
      const totalSec = Math.floor(netMs / 1000);
      const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
      const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
      const s = String(totalSec % 60).padStart(2, '0');
      setElapsed(`${h}:${m}:${s}`);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [job.clock_on, job.total_pause_seconds, job.paused_at]);

  async function handlePause() {
    setPausing(true);
    if (isPaused) {
      // Resume
      const pausedAt = new Date(job.paused_at).getTime();
      const elapsed = Math.floor((Date.now() - pausedAt) / 1000);
      const newTotal = (job.total_pause_seconds || 0) + elapsed;
      await supabase.from('jobs').update({
        paused_at: null,
        total_pause_seconds: newTotal,
      }).eq('id', job.id);
      setIsPaused(false);
    } else {
      // Pause
      await supabase.from('jobs').update({
        paused_at: new Date().toISOString(),
      }).eq('id', job.id);
      setIsPaused(true);
    }
    setPausing(false);
    onRefresh();
  }

  async function handleNotePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingNote(true);
    const path = `jobs/${job.id}/note_${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('job-photos').upload(path, file, { contentType: file.type });
    if (!error) {
      const { data } = supabase.storage.from('job-photos').getPublicUrl(path);
      setNotePhoto(data.publicUrl);
    }
    setUploadingNote(false);
    e.target.value = '';
  }

  async function saveQuickNote() {
    if (!noteText.trim()) return;
    setSavingNote(true);
    // Append to cleaner_notes JSON array
    let existing: any[] = [];
    try { existing = JSON.parse(job.cleaner_notes || '[]'); } catch { existing = []; }
    existing.push({ note: noteText, photo_url: notePhoto ?? undefined, at: new Date().toISOString() });
    await supabase.from('jobs').update({ cleaner_notes: JSON.stringify(existing) }).eq('id', job.id);
    
    if (notePhoto) {
      const storagePath = notePhoto.split('/job-photos/')[1] ?? '';
      await supabase.from('job_photos').insert({
        job_id: job.id, storage_path: storagePath, public_url: notePhoto, room_label: 'Mid-Clean Note',
      });
    }

    setNoteText('');
    setNotePhoto(null);
    setShowNote(false);
    setSavingNote(false);
    toast.success('Note saved');
    onRefresh();
  }

  const address = property?.address || '';

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto pb-24">
      {/* Sticky amber header */}
      <div className="sticky top-0 z-50 bg-amber-500 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 font-mono font-bold text-lg">
          ⏱ {isPaused ? 'PAUSED' : elapsed}
        </div>
        <p className="text-sm font-bold truncate max-w-[140px]">{property?.property_name}</p>
        <Button
          variant="outline"
          size="sm"
          className="border-white text-white hover:bg-white/20 bg-transparent gap-1 font-bold"
          onClick={handlePause}
          disabled={pausing}
        >
          {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          {isPaused ? 'Resume' : 'Pause'}
        </Button>
      </div>

      <main className="flex-1 px-4 py-4 space-y-4">
        {/* Address + maps */}
        {address && (
          <Card className="border-border">
            <CardContent className="p-4 space-y-3">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0" /> {address}
              </p>
              <Button variant="outline" className="w-full h-12 rounded-xl gap-2 font-bold" onClick={() => openMaps(address)}>
                <Navigation className="h-4 w-4" /> 📍 Open in Maps
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Access info — always expanded, yellow background */}
        <Collapsible open={accessOpen} onOpenChange={setAccessOpen}>
          <Card className="border-border bg-amber-50 dark:bg-amber-500/10">
            <CollapsibleTrigger className="w-full">
              <CardContent className="p-4 flex items-center justify-between">
                <span className="font-bold text-foreground flex items-center gap-2">
                  <Key className="h-4 w-4" /> 🔑 Access Info
                </span>
                {accessOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </CardContent>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 pb-4 space-y-2">
                {property?.access_code && (
                  <p className="text-sm font-mono font-bold text-foreground bg-amber-100 dark:bg-amber-500/20 px-3 py-2 rounded-lg">Code: {property.access_code}</p>
                )}
                {property?.lockbox_code && (
                  <p className="text-sm font-mono font-bold text-foreground bg-amber-100 dark:bg-amber-500/20 px-3 py-2 rounded-lg">Lockbox: {property.lockbox_code}</p>
                )}
                {property?.access_notes ? (
                  <p className="text-sm text-foreground whitespace-pre-wrap">{property.access_notes}</p>
                ) : (
                  !property?.access_code && !property?.lockbox_code && (
                    <p className="text-sm text-muted-foreground italic">No access notes</p>
                  )
                )}
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Cleaner Notes — yellow card */}
        {(property as any)?.property_notes && (
          <Card className="border-border bg-amber-50 dark:bg-amber-500/10">
            <CardContent className="p-4">
              <p className="text-xs font-bold text-muted-foreground uppercase mb-1">Cleaner Note</p>
              <p className="text-sm text-foreground">{(property as any).property_notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Add Note/Photo */}
        {showNote ? (
          <Card className="border-border">
            <CardContent className="p-4 space-y-3">
              <Textarea placeholder="Add a note…" value={noteText} onChange={e => setNoteText(e.target.value)} className="text-base rounded-xl" />
              <input ref={noteFileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleNotePhoto} />
              <div className="flex items-center gap-2">
                {notePhoto ? (
                  <div className="relative">
                    <img src={notePhoto} className="w-16 h-16 object-cover rounded-lg" />
                    <button onClick={() => setNotePhoto(null)} className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"><X className="h-3 w-3" /></button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => noteFileRef.current?.click()} disabled={uploadingNote}>
                    {uploadingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  </Button>
                )}
                <Button size="sm" onClick={saveQuickNote} disabled={!noteText.trim() || savingNote}>Save</Button>
                <Button variant="ghost" size="sm" onClick={() => { setShowNote(false); setNoteText(''); setNotePhoto(null); }}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Button variant="outline" className="w-full h-12 rounded-2xl gap-2" onClick={() => setShowNote(true)}>
            <Plus className="h-4 w-4" /> Add Note / Photo
          </Button>
        )}
      </main>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4 safe-area-bottom z-50">
        <Button
          size="lg"
          className="w-full h-16 text-lg font-extrabold rounded-2xl bg-amber-500 hover:bg-amber-600 text-white max-w-lg mx-auto block"
          onClick={() => navigate(`/clean/${job.id}/complete`)}
        >
          Complete Job →
        </Button>
      </div>
    </div>
  );
}
