import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  photos: Array<{ id: string; public_url: string | null; room_label: string | null }>;
}

export function ExtraTimePhotosModal({ open, onOpenChange, photos }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (photos.length === 0) return null;

  const photo = photos[currentIndex];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden rounded-2xl">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="text-base flex items-center justify-between">
            <span>Extra Time Evidence ({currentIndex + 1} of {photos.length})</span>
          </DialogTitle>
        </DialogHeader>
        <div className="relative bg-black flex items-center justify-center min-h-[400px]">
          {photo?.public_url && (
            <img
              src={photo.public_url}
              alt={photo.room_label || `Photo ${currentIndex + 1}`}
              className="max-h-[70vh] w-full object-contain"
            />
          )}
          {photos.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70 rounded-full"
                onClick={() => setCurrentIndex((i) => (i - 1 + photos.length) % photos.length)}
              >
                <ChevronLeft className="h-6 w-6" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70 rounded-full"
                onClick={() => setCurrentIndex((i) => (i + 1) % photos.length)}
              >
                <ChevronRight className="h-6 w-6" />
              </Button>
            </>
          )}
        </div>
        {photos.length > 1 && (
          <div className="flex gap-2 p-3 overflow-x-auto">
            {photos.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setCurrentIndex(i)}
                className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                  i === currentIndex ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-100'
                }`}
              >
                <img src={p.public_url || ''} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
