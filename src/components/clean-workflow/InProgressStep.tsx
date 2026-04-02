import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Camera, Loader2, ArrowLeft, Clock, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import type { WorkflowStep } from '@/pages/CleanWorkflowPage';

const DEFAULT_CHECKLIST = [
  { room: 'Kitchen', tasks: ['Benchtops wiped', 'Stovetop cleaned', 'Sink scrubbed', 'Appliances wiped'] },
  { room: 'Bathrooms', tasks: ['Toilet scrubbed', 'Shower/bath scrubbed', 'Vanity wiped', 'Mirror cleaned'] },
  { room: 'Bedrooms', tasks: ['Surfaces dusted', 'Bed made / linen changed', 'Floors vacuumed'] },
  { room: 'Living Areas', tasks: ['Surfaces dusted', 'Floors vacuumed and mopped'] },
  { room: 'Vacuuming', tasks: ['All floors vacuumed'] },
  { room: 'Mopping', tasks: ['All hard floors mopped'] },
];

interface CheckItem {
  id: string;
  room: string;
  task: string;
  completed: boolean;
  completionId?: string;
}

interface NotePhoto {
  note: string;
  photo_url?: string;
}

interface Props {
  job: any;
  property: any;
  userId: string;
  onNext: (step: WorkflowStep) => void;
  onBack: () => void;
}

export default function InProgressStep({ job, property, userId, onNext, onBack }: Props) {
  const [checklist, setChecklist] = useState<CheckItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [notePhoto, setNotePhoto] = useState<string | null>(null);
  const [uploadingNote, setUploadingNote] = useState(false);
  const [notes, setNotes] = useState<NotePhoto[]>([]);
  const noteFileRef = useRef<HTMLInputElement>(null);

  // Timer
  useEffect(() => {
    const clockOn = job.clock_on ? new Date(job.clock_on).getTime() : Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - clockOn) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [job.clock_on]);

  // Load checklist
  useEffect(() => {
    loadChecklist();
  }, []);

  async function loadChecklist() {
    setLoading(true);
    const { data: completions } = await supabase
      .from('job_checklist_completions')
      .select('id, sop_item_id, completed')
      .eq('job_id', job.id);
    const cMap = new Map((completions ?? []).map((c: any) => [c.sop_item_id, { id: c.id, completed: c.completed }]));

    let { data: sopItems } = await supabase
      .from('property_sop_items')
      .select('*')
      .eq('property_id', property.id)
      .eq('active', true)
      .order('room')
      .order('sort_order');

    if (!sopItems || sopItems.length === 0) {
      const toInsert = DEFAULT_CHECKLIST.flatMap((g, gi) =>
        g.tasks.map((task, ti) => ({
          property_id: property.id,
          room: g.room,
          task,
          sort_order: gi * 100 + ti,
          active: true,
        }))
      );
      const { data: inserted } = await supabase.from('property_sop_items').insert(toInsert).select();
      sopItems = inserted ?? [];
    }

    setChecklist((sopItems ?? []).map((s: any) => ({
      id: s.id,
      room: s.room,
      task: s.task,
      completed: cMap.get(s.id)?.completed ?? false,
      completionId: cMap.get(s.id)?.id,
    })));
    setLoading(false);
  }

  async function toggleItem(index: number) {
    const item = checklist[index];
    const newVal = !item.completed;
    const updated = [...checklist];
    updated[index] = { ...item, completed: newVal };
    setChecklist(updated);

    if (item.completionId) {
      await supabase.from('job_checklist_completions')
        .update({ completed: newVal, completed_at: newVal ? new Date().toISOString() : null })
        .eq('id', item.completionId);
    } else {
      const { data } = await supabase.from('job_checklist_completions')
        .insert({ job_id: job.id, sop_item_id: item.id, completed: newVal, completed_at: newVal ? new Date().toISOString() : null })
        .select('id').single();
      if (data) {
        updated[index] = { ...updated[index], completionId: data.id };
        setChecklist(updated);
      }
    }
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

  function saveNote() {
    if (!noteText.trim()) return;
    setNotes(prev => [...prev, { note: noteText, photo_url: notePhoto ?? undefined }]);
    setNoteText('');
    setNotePhoto(null);
    setShowNoteForm(false);
    toast.success('Note saved');
  }

  function handleFinishCleaning() {
    // Save any notes to job
    if (notes.length > 0) {
      supabase.from('jobs').update({ cleaner_notes: JSON.stringify(notes) }).eq('id', job.id);
    }
    onNext('completion');
  }

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const completedCount = checklist.filter(c => c.completed).length;
  const totalCount = checklist.length;

  // Group by room
  const roomGroups = checklist.reduce<Record<string, { index: number; item: CheckItem }[]>>((acc, item, i) => {
    if (!acc[item.room]) acc[item.room] = [];
    acc[item.room].push({ index: i, item });
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
      {/* Header with timer */}
      <div className="bg-primary text-primary-foreground px-5 py-5 safe-area-top">
        <button onClick={onBack} className="flex items-center gap-1 text-primary-foreground/70 text-sm mb-2">
          <ArrowLeft className="h-4 w-4" /> My Cleans
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold">Cleaning</h1>
            <p className="text-primary-foreground/70 text-sm">{property?.property_name}</p>
          </div>
          <div className="bg-accent text-accent-foreground px-4 py-2 rounded-xl flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span className="font-mono font-bold text-lg">{formatTime(elapsed)}</span>
          </div>
        </div>
        <div className="mt-3 bg-primary-foreground/10 rounded-full h-2 overflow-hidden">
          <div
            className="bg-accent h-full rounded-full transition-all"
            style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
          />
        </div>
        <p className="text-primary-foreground/60 text-xs mt-1">{completedCount} of {totalCount} tasks</p>
      </div>

      <main className="flex-1 px-4 py-5 space-y-4 pb-32">
        {Object.entries(roomGroups).map(([room, tasks]) => (
          <Card key={room} className="border-border">
            <CardContent className="p-4">
              <h3 className="font-bold text-foreground text-sm mb-2">{room}</h3>
              <div className="space-y-2">
                {tasks.map(({ index, item }) => (
                  <label
                    key={item.id}
                    className="flex items-center gap-3 min-h-[48px] cursor-pointer"
                    onClick={() => toggleItem(index)}
                  >
                    <Checkbox checked={item.completed} className="h-6 w-6" />
                    <span className={`text-sm ${item.completed ? 'line-through text-muted-foreground' : 'text-foreground font-medium'}`}>
                      {item.task}
                    </span>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Notes during job */}
        {notes.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-muted-foreground uppercase">Notes</h3>
            {notes.map((n, i) => (
              <div key={i} className="bg-secondary rounded-xl p-3 text-sm">
                <p className="text-foreground">{n.note}</p>
                {n.photo_url && <img src={n.photo_url} alt="" className="w-16 h-16 object-cover rounded-lg mt-2" />}
              </div>
            ))}
          </div>
        )}

        {showNoteForm ? (
          <Card className="border-border">
            <CardContent className="p-4 space-y-3">
              <Textarea placeholder="Add a note..." value={noteText} onChange={e => setNoteText(e.target.value)} />
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
                <Button size="sm" onClick={saveNote} disabled={!noteText.trim()}>Save Note</Button>
                <Button variant="ghost" size="sm" onClick={() => { setShowNoteForm(false); setNoteText(''); setNotePhoto(null); }}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Button variant="outline" className="w-full h-12 rounded-2xl" onClick={() => setShowNoteForm(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add Note / Photo
          </Button>
        )}
      </main>

      {/* Fixed bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4 safe-area-bottom z-50">
        <Button
          size="lg"
          className="w-full h-14 text-base font-extrabold rounded-2xl max-w-lg mx-auto block"
          onClick={handleFinishCleaning}
        >
          Finish Cleaning →
        </Button>
      </div>
    </div>
  );
}
