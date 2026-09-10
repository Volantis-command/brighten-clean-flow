// ============================================================================
// Airbnb room reference library — shared client helpers.
//
// Admin or head cleaner photographs how every room should be left. Cleaners see
// it on site, and as a thumbnail on each room of the end-of-clean flow.
//
// Rooms are keyed by area_id, which matches the area ids built by
// buildChecklist() in cleanChecklist.ts. That shared key is the whole trick:
// a reference photo for "bedroom_2" lands on the Bedroom 2 step of the guided
// end-of-clean flow with no mapping table in between.
//
// AIRBNB ONLY. Every entry point checks isAirbnbProperty() first.
// ============================================================================

import { supabase } from '@/integrations/supabase/client';
import { compressFile } from '@/lib/imageCompress';

export type RoomType = 'kitchen' | 'living' | 'bathroom' | 'bedroom' | 'laundry' | 'outdoor' | 'final';

export interface PropertyRoom {
  id: string;
  property_id: string;
  area_id: string;
  room_type: RoomType;
  room_index: number;
  label: string | null;
  sort_order: number;
  active: boolean;
}

export interface RoomPhoto {
  id: string;
  room_id: string;
  property_id: string;
  storage_path: string;
  public_url: string;
  caption: string | null;
  sort_order: number;
  created_at: string;
}

export interface RoomWithPhotos extends PropertyRoom {
  photos: RoomPhoto[];
  /** Display title, e.g. "Bedroom 2", or the admin's rename. */
  title: string;
}

const BUCKET = 'property-photos';

const BASE_TITLE: Record<RoomType, string> = {
  kitchen: 'Kitchen',
  living: 'Lounge & Dining',
  bathroom: 'Bathroom',
  bedroom: 'Bedroom',
  laundry: 'Laundry',
  outdoor: 'Balcony & Outdoor',
  final: 'Entry & Lock-Up',
};

/** What to show the photographer so the reference is actually useful. */
export const ROOM_SHOT_GUIDE: Record<RoomType, string> = {
  kitchen: 'Benches as they should be left: appliances, kettle, tea and coffee setup.',
  living: 'Couch cushions and throws, coffee table styling, chairs, TV remotes placement.',
  bathroom: 'Towel folding and placement, amenities, bathmat, toilet roll presentation.',
  bedroom: 'Full bed styling: pillow count and order, throw, cushions, towels on the bed.',
  laundry: 'How the laundry is left: basket, pegs, iron and board.',
  outdoor: 'Outdoor furniture layout, cushions, BBQ cover.',
  final: 'Entry as the guest walks in: welcome setup, keys, lights.',
};

export function isAirbnbProperty(property: any): boolean {
  return property?.client_type === 'airbnb';
}

/**
 * Title matching the guided flow: a single bedroom is "Bedroom", two or more
 * are "Bedroom 1", "Bedroom 2". An admin rename always wins.
 */
export function roomTitle(room: PropertyRoom, sameTypeActiveCount: number): string {
  if (room.label?.trim()) return room.label.trim();
  const base = BASE_TITLE[room.room_type] ?? room.area_id;
  if ((room.room_type === 'bedroom' || room.room_type === 'bathroom') && sameTypeActiveCount > 1) {
    return `${base} ${room.room_index}`;
  }
  return base;
}

/** Reconcile rooms with the property's bed/bath counts. Idempotent, cheap. */
export async function syncRooms(propertyId: string): Promise<void> {
  const { error } = await supabase.rpc('sync_property_rooms' as any, { p_property_id: propertyId });
  if (error) throw new Error(`Could not prepare rooms: ${error.message}`);
}

/**
 * Every room for a property with its reference photos, in walk order.
 * Inactive (parked) rooms are included only when asked, for the admin view.
 */
export async function fetchRooms(
  propertyId: string,
  { includeInactive = false }: { includeInactive?: boolean } = {},
): Promise<RoomWithPhotos[]> {
  let q = supabase
    .from('property_rooms' as any)
    .select('*')
    .eq('property_id', propertyId)
    .order('sort_order', { ascending: true });
  if (!includeInactive) q = q.eq('active', true);

  const [{ data: rooms, error: rErr }, { data: photos, error: pErr }] = await Promise.all([
    q,
    supabase
      .from('property_room_photos' as any)
      .select('*')
      .eq('property_id', propertyId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
  ]);
  if (rErr) throw new Error(`Could not load rooms: ${rErr.message}`);
  if (pErr) throw new Error(`Could not load room photos: ${pErr.message}`);

  const list = (rooms as unknown as PropertyRoom[]) || [];
  const activeByType = new Map<string, number>();
  list.filter(r => r.active).forEach(r => activeByType.set(r.room_type, (activeByType.get(r.room_type) || 0) + 1));

  const byRoom = new Map<string, RoomPhoto[]>();
  ((photos as unknown as RoomPhoto[]) || []).forEach(p => {
    const arr = byRoom.get(p.room_id) || [];
    arr.push(p);
    byRoom.set(p.room_id, arr);
  });

  return list.map(r => ({
    ...r,
    photos: byRoom.get(r.id) || [],
    title: roomTitle(r, activeByType.get(r.room_type) || 0),
  }));
}

/** Compress, upload and register one reference photo against a room. */
export async function addRoomPhoto(room: PropertyRoom, file: File, userId?: string): Promise<void> {
  const blob = await compressFile(file);
  const path = `rooms/${room.property_id}/${room.area_id}/${Date.now()}.jpg`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

  const { error } = await supabase.from('property_room_photos' as any).insert({
    room_id: room.id,
    property_id: room.property_id,
    storage_path: path,
    public_url: pub.publicUrl,
    sort_order: Date.now() % 2147483647,
    created_by: userId ?? null,
  } as any);
  if (error) {
    // Don't leave an orphan file behind if the row could not be written.
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw new Error(`Could not save the photo: ${error.message}`);
  }
}

export async function deleteRoomPhoto(photo: RoomPhoto): Promise<void> {
  const { error } = await supabase.from('property_room_photos' as any).delete().eq('id', photo.id);
  if (error) throw new Error(`Could not delete the photo: ${error.message}`);
  await supabase.storage.from(BUCKET).remove([photo.storage_path]).catch(() => {});
}

export async function updateRoomPhotoCaption(photoId: string, caption: string): Promise<void> {
  const { error } = await supabase
    .from('property_room_photos' as any)
    .update({ caption: caption.trim() || null } as any)
    .eq('id', photoId);
  if (error) throw new Error(`Could not save the caption: ${error.message}`);
}

/** Move a photo to a different room, e.g. after a room was relabelled wrongly. */
export async function moveRoomPhoto(photoId: string, toRoomId: string): Promise<void> {
  const { error } = await supabase
    .from('property_room_photos' as any)
    .update({ room_id: toRoomId } as any)
    .eq('id', photoId);
  if (error) throw new Error(`Could not move the photo: ${error.message}`);
}

export async function renameRoom(roomId: string, label: string): Promise<void> {
  const { error } = await supabase
    .from('property_rooms' as any)
    .update({ label: label.trim() || null, updated_at: new Date().toISOString() } as any)
    .eq('id', roomId);
  if (error) throw new Error(`Could not rename the room: ${error.message}`);
}

/** Swap two rooms' positions. */
export async function swapRoomOrder(a: PropertyRoom, b: PropertyRoom): Promise<void> {
  const now = new Date().toISOString();
  const [r1, r2] = await Promise.all([
    supabase.from('property_rooms' as any).update({ sort_order: b.sort_order, updated_at: now } as any).eq('id', a.id),
    supabase.from('property_rooms' as any).update({ sort_order: a.sort_order, updated_at: now } as any).eq('id', b.id),
  ]);
  const err = r1.error || r2.error;
  if (err) throw new Error(`Could not reorder: ${err.message}`);
}

/**
 * Permanently delete a parked room. Refuses while it still holds photos, so a
 * reference set can't be wiped by accident; move or delete the photos first.
 */
export async function deleteParkedRoom(room: RoomWithPhotos): Promise<void> {
  if (room.active) throw new Error('Only rooms no longer in the property can be deleted.');
  if (room.photos.length) throw new Error('Move or delete this room\'s photos first.');
  const { error } = await supabase.from('property_rooms' as any).delete().eq('id', room.id);
  if (error) throw new Error(`Could not delete the room: ${error.message}`);
}
