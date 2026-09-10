// ============================================================================
// Room reference photos — admin / head cleaner view on the property SOP tab.
//
// Rooms come from the property's bed and bath counts (the database keeps them
// in step). Each room gets its reference photos: how the bed is styled, where
// the throws go, how towels are folded. Cleaners see these on site and confirm
// against them at the end of every clean.
//
// AIRBNB ONLY. Renders nothing for any other property.
// ============================================================================

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Camera, ChevronDown, ChevronUp, Loader2, Pencil, Trash2, Check, X, ArrowUp, ArrowDown, Archive, ImageOff,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import {
  addRoomPhoto, deleteParkedRoom, deleteRoomPhoto, fetchRooms, isAirbnbProperty, moveRoomPhoto,
  renameRoom, ROOM_SHOT_GUIDE, swapRoomOrder, syncRooms, updateRoomPhotoCaption,
  type RoomPhoto, type RoomWithPhotos,
} from '@/lib/propertyRooms';

export default function RoomLibrarySection({ property }: { property: any }) {
  const { user, role } = useAuth();
  const canEdit = role === 'admin' || role === 'head_cleaner';
  const qc = useQueryClient();
  const airbnb = isAirbnbProperty(property);
  const [showParked, setShowParked] = useState(false);

  const { data: rooms = [], isLoading, error } = useQuery({
    // Bed and bath counts are in the key so editing them refetches straight away.
    queryKey: ['property-rooms', property?.id, property?.bedrooms, property?.bathrooms],
    enabled: airbnb && !!property?.id,
    queryFn: async () => {
      // The database trigger keeps rooms in step with the counts. Syncing here
      // too covers a property that predates this feature, cheaply and safely.
      await syncRooms(property.id);
      return fetchRooms(property.id, { includeInactive: true });
    },
  });

  if (!airbnb) return null;

  const refresh = () => qc.invalidateQueries({ queryKey: ['property-rooms', property.id] });
  const active = rooms.filter(r => r.active);
  const parked = rooms.filter(r => !r.active);
  const done = active.filter(r => r.photos.length > 0).length;

  return (
    <section className="rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
            <Camera className="h-4 w-4 text-primary" />
            Room reference photos
          </h3>
          {!isLoading && active.length > 0 && (
            <span className={`text-xs font-bold ${done === active.length ? 'text-primary' : 'text-amber-400'}`}>
              {done} of {active.length} rooms photographed
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Photograph every room exactly how it should be left for the guest. Cleaners see these on
          site, and check each room against them before taking their final photo.
          {!canEdit && ' Only an admin or head cleaner can add or change these.'}
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : error ? (
        <p className="px-5 py-6 text-sm text-destructive">{(error as Error).message}</p>
      ) : (
        <div className="space-y-3 p-4">
          {active.map((room, i) => (
            <RoomCard
              key={room.id}
              room={room}
              canEdit={canEdit}
              userId={user?.id}
              moveTargets={active.filter(r => r.id !== room.id)}
              onUp={i > 0 ? () => swapRoomOrder(room, active[i - 1]).then(refresh).catch(e => toast.error(e.message)) : undefined}
              onDown={i < active.length - 1 ? () => swapRoomOrder(room, active[i + 1]).then(refresh).catch(e => toast.error(e.message)) : undefined}
              onChanged={refresh}
            />
          ))}

          {parked.length > 0 && (
            <div className="rounded-xl border border-dashed border-border">
              <button
                onClick={() => setShowParked(s => !s)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <Archive className="h-4 w-4" />
                  Rooms no longer in this property ({parked.length})
                </span>
                {showParked ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
              {showParked && (
                <div className="space-y-3 border-t border-border p-3">
                  <p className="text-xs text-muted-foreground">
                    These rooms were parked when the bedroom or bathroom count went down. Nothing was
                    deleted. Raise the count on the Profile tab and they come back with their photos, or
                    move the photos to another room below.
                  </p>
                  {parked.map(room => (
                    <RoomCard
                      key={room.id}
                      room={room}
                      canEdit={canEdit}
                      userId={user?.id}
                      moveTargets={active}
                      parked
                      onChanged={refresh}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function RoomCard({
  room, canEdit, userId, moveTargets, parked, onUp, onDown, onChanged,
}: {
  room: RoomWithPhotos;
  canEdit: boolean;
  userId?: string;
  moveTargets: RoomWithPhotos[];
  parked?: boolean;
  onUp?: () => void;
  onDown?: () => void;
  onChanged: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(room.photos.length === 0 && !parked);
  const [uploading, setUploading] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(room.label || '');

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    setUploading(list.length);
    let failed = 0;
    for (const file of list) {
      try {
        await addRoomPhoto(room, file, userId);
      } catch (e: any) {
        failed++;
        toast.error(e.message);
      } finally {
        setUploading(n => n - 1);
      }
    }
    if (failed < list.length) toast.success(`${list.length - failed} photo${list.length - failed === 1 ? '' : 's'} added to ${room.title}`);
    if (fileRef.current) fileRef.current.value = '';
    onChanged();
  };

  const saveName = async () => {
    try {
      await renameRoom(room.id, name);
      setRenaming(false);
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const removeRoom = async () => {
    try {
      await deleteParkedRoom(room);
      toast.success(`${room.title} deleted`);
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className={`overflow-hidden rounded-xl border ${parked ? 'border-border bg-muted/20' : 'border-border bg-background/40'}`}>
      <div className="flex items-center gap-2 px-4 py-3">
        {renaming ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={`e.g. Master Bedroom (blank for "${room.title}")`}
              className="h-9"
              onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setRenaming(false); }}
            />
            <button onClick={saveName} className="rounded-lg p-2 text-primary hover:bg-primary/10" aria-label="Save name"><Check className="h-4 w-4" /></button>
            <button onClick={() => setRenaming(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Cancel"><X className="h-4 w-4" /></button>
          </div>
        ) : (
          <button onClick={() => setOpen(o => !o)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <span className="truncate text-sm font-semibold text-foreground">{room.title}</span>
            <span className={`shrink-0 text-xs ${room.photos.length ? 'text-primary' : 'text-amber-400'}`}>
              {room.photos.length ? `${room.photos.length} photo${room.photos.length === 1 ? '' : 's'}` : 'No photos yet'}
            </span>
          </button>
        )}

        {canEdit && !renaming && (
          <div className="flex shrink-0 items-center">
            {!parked && (
              <button onClick={() => { setName(room.label || ''); setRenaming(true); }} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Rename room"><Pencil className="h-3.5 w-3.5" /></button>
            )}
            {onUp && <button onClick={onUp} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Move room up"><ArrowUp className="h-3.5 w-3.5" /></button>}
            {onDown && <button onClick={onDown} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Move room down"><ArrowDown className="h-3.5 w-3.5" /></button>}
            {parked && room.photos.length === 0 && (
              <button onClick={removeRoom} className="rounded-lg p-2 text-destructive hover:bg-destructive/10" aria-label="Delete parked room"><Trash2 className="h-3.5 w-3.5" /></button>
            )}
          </div>
        )}
        {!renaming && (
          <button onClick={() => setOpen(o => !o)} className="shrink-0 p-1 text-muted-foreground" aria-label={open ? 'Collapse' : 'Expand'}>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-3 border-t border-border px-4 pb-4 pt-3">
          {!parked && (
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">What to capture: </span>
              {ROOM_SHOT_GUIDE[room.room_type]}
            </p>
          )}

          {room.photos.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-6 text-center">
              <ImageOff className="mb-2 h-5 w-5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">No reference photos for this room yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {room.photos.map(photo => (
                <PhotoTile
                  key={photo.id}
                  photo={photo}
                  canEdit={canEdit}
                  moveTargets={moveTargets}
                  onChanged={onChanged}
                />
              ))}
            </div>
          )}

          {canEdit && !parked && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={e => upload(e.target.files)}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading > 0}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 px-4 py-3 text-sm font-bold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
              >
                {uploading > 0
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading {uploading}…</>
                  : <><Camera className="h-4 w-4" /> Take or add photos of {room.title}</>}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PhotoTile({
  photo, canEdit, moveTargets, onChanged,
}: {
  photo: RoomPhoto;
  canEdit: boolean;
  moveTargets: RoomWithPhotos[];
  onChanged: () => void;
}) {
  const [caption, setCaption] = useState(photo.caption || '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const saveCaption = async () => {
    if ((photo.caption || '') === caption.trim()) return;
    try {
      await updateRoomPhotoCaption(photo.id, caption);
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteRoomPhoto(photo);
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
      setBusy(false);
    }
  };

  const move = async (toRoomId: string) => {
    if (!toRoomId) return;
    setBusy(true);
    try {
      await moveRoomPhoto(photo.id, toRoomId);
      toast.success('Photo moved');
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <a href={photo.public_url} target="_blank" rel="noopener noreferrer">
        <img src={photo.public_url} alt={photo.caption || 'Reference photo'} className="aspect-[4/3] w-full object-cover" loading="lazy" />
      </a>
      <div className="space-y-2 p-2">
        {canEdit ? (
          <Input
            value={caption}
            onChange={e => setCaption(e.target.value)}
            onBlur={saveCaption}
            placeholder="Note, e.g. 4 pillows, throw folded at foot"
            className="h-8 text-xs"
          />
        ) : (
          photo.caption && <p className="text-xs text-muted-foreground">{photo.caption}</p>
        )}
        {canEdit && (
          <div className="flex items-center gap-1">
            {moveTargets.length > 0 && (
              <select
                disabled={busy}
                value=""
                onChange={e => move(e.target.value)}
                className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs text-muted-foreground"
                aria-label="Move photo to another room"
              >
                <option value="">Move to…</option>
                {moveTargets.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
            )}
            {confirmDelete ? (
              <>
                <button disabled={busy} onClick={remove} className="h-8 rounded-md bg-destructive px-2 text-xs font-bold text-destructive-foreground disabled:opacity-50">Delete</button>
                <button onClick={() => setConfirmDelete(false)} className="h-8 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted">Keep</button>
              </>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="flex h-8 w-8 items-center justify-center rounded-md text-destructive hover:bg-destructive/10" aria-label="Delete photo">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
