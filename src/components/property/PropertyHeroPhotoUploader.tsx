import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Upload, X, Loader2, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  propertyId: string;
  currentUrl: string | null;
  onChanged?: () => void;
}

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

export default function PropertyHeroPhotoUploader({ propertyId, currentUrl, onChanged }: Props) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);

  const pickFile = () => fileInputRef.current?.click();

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Use JPEG, PNG, WebP, or HEIC.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('Image is over 8 MB. Try a smaller one.');
      return;
    }

    setUploading(true);
    try {
      // Cache-bust by including timestamp; old file in storage is left
      // until the next change (Supabase Storage doesn't auto-clean).
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${propertyId}/hero-${Date.now()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('property-photos')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage.from('property-photos').getPublicUrl(path);
      const publicUrl = urlData?.publicUrl;
      if (!publicUrl) throw new Error('Could not resolve public URL');

      const { error: updErr } = await supabase
        .from('properties')
        .update({ hero_image_url: publicUrl } as any)
        .eq('id', propertyId);
      if (updErr) throw updErr;

      toast.success('Hero photo updated.');
      queryClient.invalidateQueries({ queryKey: ['property', propertyId] });
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message || 'Could not upload — try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeHero = async () => {
    if (!currentUrl) return;
    if (!window.confirm('Remove the hero photo? Card falls back to the latest cleaner photo or a gradient.')) return;
    setRemoving(true);
    try {
      const { error } = await supabase
        .from('properties')
        .update({ hero_image_url: null } as any)
        .eq('id', propertyId);
      if (error) throw error;
      toast.success('Hero photo removed.');
      queryClient.invalidateQueries({ queryKey: ['property', propertyId] });
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message || 'Could not remove — try again.');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ImageIcon className="w-4 h-4 text-primary" />
        <h3 className="font-bold text-foreground text-sm">Hero photo</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Shown at the top of this property's card in the client portal. JPEG/PNG/WebP/HEIC, up to 8 MB. Aim for landscape (16:9) — gets cropped to fit.
      </p>

      {currentUrl ? (
        <div className="space-y-2">
          <div className="relative w-full h-40 rounded-xl overflow-hidden border border-border bg-muted">
            <img src={currentUrl} alt="Property hero" className="w-full h-full object-cover" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={pickFile} disabled={uploading || removing} className="gap-1.5">
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Replace
            </Button>
            <Button size="sm" variant="ghost" onClick={removeHero} disabled={uploading || removing} className="gap-1.5 text-destructive">
              {removing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" onClick={pickFile} disabled={uploading} className="gap-1.5">
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Upload hero photo
        </Button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        onChange={onFileChosen}
        className="hidden"
      />
    </div>
  );
}
