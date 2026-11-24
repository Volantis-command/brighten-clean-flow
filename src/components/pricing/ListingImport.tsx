import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import type { ListingFields } from '@/lib/turnoverPricing';

type Img = { media_type: string; data: string; preview: string };

const FIELD_NAMES: Record<string, string> = {
  property_type: 'house or apartment', bedrooms: 'bedrooms', bathrooms: 'bathrooms',
  separate_toilets: 'toilets', living_areas: 'living areas', levels: 'levels', kitchens: 'kitchens',
  beds: 'beds', outdoor: 'outdoor area', pool: 'pool', granny_flat: 'granny flat',
};

/** Shrink a screenshot so it uploads fast and stays under the function's size cap. */
async function toJpeg(file: File): Promise<Img> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return { media_type: 'image/jpeg', data: dataUrl.split(',')[1], preview: dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function ListingImport({ onFilled }: { onFilled: (l: ListingFields) => void }) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<Img[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ListingFields | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/')).slice(0, 4 - images.length);
    if (!imgs.length) return;
    try {
      const converted = await Promise.all(imgs.map(toJpeg));
      setImages((prev) => [...prev, ...converted].slice(0, 4));
    } catch {
      toast.error('Could not read that image');
    }
  };

  const run = async () => {
    if (!text.trim() && images.length === 0) {
      toast.error('Paste the listing text, a link or a screenshot first');
      return;
    }
    setBusy(true);
    setResult(null);
    const { data, error } = await supabase.functions.invoke('extract-listing', {
      body: { text: text.trim(), images: images.map(({ media_type, data }) => ({ media_type, data })) },
    });
    setBusy(false);
    const payload = data as { listing?: ListingFields; error?: string } | null;
    let message = payload?.error;
    if (error && !message) {
      // Non-2xx: the function's own message is in the response body.
      const ctx = (error as { context?: Response }).context;
      try { message = (await ctx?.json())?.error; } catch { /* keep generic */ }
    }
    const listing = payload?.listing;
    if (error || message || !listing) {
      toast.error(message || 'Could not read that listing. Try pasting the text.');
      return;
    }
    setResult(listing);
    onFilled(listing);
    toast.success('Filled from the listing. Check anything marked as a guess.');
  };

  return (
    <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3 space-y-2">
      <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
        <Sparkles className="h-4 w-4 text-primary" /> Fill from a listing
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => {
          const files = [...e.clipboardData.files];
          if (files.some((f) => f.type.startsWith('image/'))) {
            e.preventDefault();
            void addFiles(files);
          }
        }}
        rows={3}
        placeholder="Paste the listing description, a link (Airbnb, Domain, the manager's site), or a screenshot"
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-y"
      />
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img, i) => (
            <div key={i} className="relative">
              <img src={img.preview} alt="" className="h-14 w-14 rounded-lg object-cover border border-border" />
              <button type="button" aria-label="Remove screenshot"
                onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                className="absolute -top-1.5 -right-1.5 h-5 w-5 grid place-items-center rounded-full bg-foreground text-background">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={run} disabled={busy} className="rounded-lg">
          {busy ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Reading…</> : 'Fill the form'}
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={() => fileRef.current?.click()} disabled={busy || images.length >= 4}>
          <ImagePlus className="h-4 w-4 mr-1.5" /> Screenshot
        </Button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden
          onChange={(e) => { void addFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />
        <span className="text-[11px] text-muted-foreground">realestate.com.au blocks links, so paste its text or a screenshot.</span>
      </div>
      {result && (
        <div className="text-xs space-y-0.5">
          {result.sleeps ? <p className="text-foreground">Sleeps {result.sleeps}.</p> : null}
          {result.unsure?.length > 0 && (
            <p className="font-semibold text-amber-700 dark:text-amber-400">
              Guessed, check these: {result.unsure.map((f) => FIELD_NAMES[f] ?? f).join(', ')}
            </p>
          )}
          {result.notes && <p className="text-muted-foreground">{result.notes}</p>}
        </div>
      )}
    </div>
  );
}
