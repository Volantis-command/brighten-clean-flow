// ============================================================================
// "How it should look" — the cleaner's reference viewer.
//
// Opened any time during an Airbnb clean, and from the end-of-clean flow. Shows
// the admin's reference photos room by room so the cleaner can set each room up
// exactly the same way. Read only.
// ============================================================================

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ImageOff, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fetchRooms } from '@/lib/propertyRooms';

export default function RoomReferenceSheet({
  propertyId, open, onOpenChange, initialAreaId,
}: {
  propertyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Jump straight to this room, e.g. the one the cleaner is finishing. */
  initialAreaId?: string;
}) {
  const { data: rooms = [], isLoading, error } = useQuery({
    queryKey: ['property-rooms-view', propertyId],
    enabled: open && !!propertyId,
    queryFn: () => fetchRooms(propertyId),
  });

  const [areaId, setAreaId] = useState<string | undefined>(initialAreaId);

  // Each time it opens, start on the requested room, or the first with photos.
  useEffect(() => {
    if (!open || !rooms.length) return;
    const wanted = initialAreaId && rooms.some(r => r.area_id === initialAreaId) ? initialAreaId : undefined;
    setAreaId(wanted ?? rooms.find(r => r.photos.length)?.area_id ?? rooms[0].area_id);
  }, [open, initialAreaId, rooms]);

  const room = rooms.find(r => r.area_id === areaId) ?? rooms[0];
  const anyPhotos = rooms.some(r => r.photos.length);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle>How it should look</DialogTitle>
          <DialogDescription>Set each room up exactly like these photos.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : error ? (
          <p className="p-5 text-sm text-destructive">{(error as Error).message}</p>
        ) : !anyPhotos ? (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <ImageOff className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-semibold text-foreground">No reference photos yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Nobody has photographed this property's rooms yet. Follow the SOP and ask your head
              cleaner if you're unsure how a room should be set up.
            </p>
          </div>
        ) : (
          <>
            {/* Room picker */}
            <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-border px-4 py-3">
              {rooms.map(r => (
                <button
                  key={r.id}
                  onClick={() => setAreaId(r.area_id)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                    r.area_id === room?.area_id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : r.photos.length
                        ? 'border-border text-foreground hover:bg-muted'
                        : 'border-border text-muted-foreground/60'
                  }`}
                >
                  {r.title}{r.photos.length ? ` · ${r.photos.length}` : ''}
                </button>
              ))}
            </div>

            {/* Photos for the chosen room */}
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {room && room.photos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <ImageOff className="mb-2 h-6 w-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">No reference photo for {room.title}.</p>
                </div>
              ) : (
                room?.photos.map(photo => (
                  <figure key={photo.id} className="overflow-hidden rounded-xl border border-border bg-card">
                    <img src={photo.public_url} alt={photo.caption || room.title} className="w-full object-cover" />
                    {photo.caption && (
                      <figcaption className="px-3 py-2 text-sm text-foreground">{photo.caption}</figcaption>
                    )}
                  </figure>
                ))
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
