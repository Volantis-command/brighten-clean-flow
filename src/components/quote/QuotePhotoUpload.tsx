import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ImagePlus, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface QuotePhoto {
  url: string;
  label: string;
}

interface QuotePhotoUploadProps {
  token: string;
  photos: QuotePhoto[];
  onChange: (photos: QuotePhoto[]) => void;
  disabled?: boolean;
}

async function compressImage(file: File, maxSizeKB = 2048): Promise<File> {
  if (file.size <= maxSizeKB * 1024) return file;
  
  return new Promise((resolve) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    
    img.onload = () => {
      let { width, height } = img;
      const maxDim = 1920;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width *= ratio;
        height *= ratio;
      }
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
        } else {
          resolve(file);
        }
      }, 'image/jpeg', 0.8);
    };
    img.src = URL.createObjectURL(file);
  });
}

export function QuotePhotoUpload({ token, photos, onChange, disabled }: QuotePhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    const remaining = 10 - photos.length;
    if (files.length > remaining) {
      toast.error(`You can upload up to ${remaining} more photos`);
      return;
    }

    setUploading(true);
    const newPhotos: QuotePhoto[] = [];

    for (const file of files) {
      try {
        const compressed = await compressImage(file);
        const ext = compressed.name.split('.').pop() || 'jpg';
        const fileName = `${token}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        
        const { error } = await supabase.storage
          .from('quote-photos')
          .upload(fileName, compressed, { contentType: compressed.type });
        
        if (error) throw error;
        
        const { data: urlData } = supabase.storage.from('quote-photos').getPublicUrl(fileName);
        newPhotos.push({ url: urlData.publicUrl, label: '' });
      } catch (err: any) {
        toast.error(`Failed to upload ${file.name}: ${err.message}`);
      }
    }

    onChange([...photos, ...newPhotos]);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const removePhoto = (index: number) => {
    onChange(photos.filter((_, i) => i !== index));
  };

  const updateLabel = (index: number, label: string) => {
    const updated = [...photos];
    updated[index] = { ...updated[index], label };
    onChange(updated);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
      <div>
        <h2 className="font-bold text-[#0C463D] text-lg">Property Photos</h2>
        <p className="text-sm text-gray-500 mt-1">
          Got photos? Upload them here. Show us any areas needing special attention, 
          damage to note before we arrive, or the general state of the property. 
          This helps us quote accurately and protects both parties.
        </p>
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {photos.map((photo, i) => (
            <div key={i} className="relative space-y-1">
              <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                <img src={photo.url} alt={photo.label || `Photo ${i + 1}`} className="w-full h-full object-cover" />
                {!disabled && (
                  <button
                    onClick={() => removePhoto(i)}
                    className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <Input
                placeholder="e.g. Master bathroom"
                value={photo.label}
                onChange={(e) => updateLabel(i, e.target.value)}
                className="h-8 text-xs rounded-lg"
                disabled={disabled}
              />
            </div>
          ))}
        </div>
      )}

      {photos.length < 10 && !disabled && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/heic,image/heif"
            multiple
            onChange={handleUpload}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            className="w-full h-14 rounded-2xl gap-2 border-dashed border-2"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <ImagePlus className="w-5 h-5" />
            )}
            {uploading ? 'Uploading...' : `Upload Photos (${photos.length}/10)`}
          </Button>
        </>
      )}

      <p className="text-xs text-gray-400">Accepts JPG, PNG, HEIC. Max 10 photos, auto-compressed.</p>
    </div>
  );
}
