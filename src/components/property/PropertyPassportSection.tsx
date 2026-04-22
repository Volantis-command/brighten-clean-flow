import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  propertyId: string;
  readOnly?: boolean;
  requireClockIn?: boolean;
  isClockedIn?: boolean;
}

const ACCESS_METHODS = ['Key Safe', 'Lockbox', 'Leave Under Mat', 'Someone Home', 'Other'];
const ROOM_TYPES = ['Kitchen', 'Bathrooms', 'Bedrooms', 'Living'];

export default function PropertyPassportSection({ propertyId, readOnly = false, requireClockIn = false, isClockedIn = false }: Props) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [revealedFields, setRevealedFields] = useState<Record<string, boolean>>({});

  const [form, setForm] = useState({
    access_method: '',
    access_code: '',
    alarm_code: '',
    garage_code: '',
    parking_notes: '',
    pet_notes: '',
    product_restrictions: '',
    special_instructions: '',
    preferences_notes: '',
    room_notes: {} as Record<string, string>,
  });

  useEffect(() => {
    async function load() {
      // Property Passport data lives on `properties` — ONE source of truth for
      // access codes / parking / pet notes / room-by-room notes. Previously this
      // component read/wrote from client_properties (junction table), which
      // meant (a) the Save button errored on fresh properties that had no row
      // in the junction and (b) data was hidden from cleaners/jobs which read
      // from properties. Fixed 2026-04-22. The form field `parking_notes` maps
      // to the real DB column `parking_instructions` so the UI stays unchanged.
      const { data } = await supabase
        .from('properties' as any)
        .select('access_method, access_code, alarm_code, garage_code, parking_instructions, pet_notes, product_restrictions, special_instructions, preferences_notes, room_notes')
        .eq('id', propertyId)
        .maybeSingle();

      if (data) {
        setForm({
          access_method: (data as any).access_method || '',
          access_code: (data as any).access_code || '',
          alarm_code: (data as any).alarm_code || '',
          garage_code: (data as any).garage_code || '',
          parking_notes: (data as any).parking_instructions || '',
          pet_notes: (data as any).pet_notes || '',
          product_restrictions: (data as any).product_restrictions || '',
          special_instructions: (data as any).special_instructions || '',
          preferences_notes: (data as any).preferences_notes || '',
          room_notes: (data as any).room_notes || {},
        });
      }
    }
    load();
  }, [propertyId]);

  const toggleReveal = (field: string) => {
    if (requireClockIn && !isClockedIn) {
      toast.error('Clock in to reveal access codes');
      return;
    }
    setRevealedFields(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('properties' as any)
      .update({
        access_method: form.access_method || null,
        access_code: form.access_code || null,
        alarm_code: form.alarm_code || null,
        garage_code: form.garage_code || null,
        // UI field `parking_notes` → real column `parking_instructions`
        parking_instructions: form.parking_notes || null,
        pet_notes: form.pet_notes || null,
        product_restrictions: form.product_restrictions || null,
        special_instructions: form.special_instructions || null,
        preferences_notes: form.preferences_notes || null,
        room_notes: Object.keys(form.room_notes).length > 0 ? form.room_notes : null,
      } as any)
      .eq('id', propertyId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Property passport saved');
    queryClient.invalidateQueries({ queryKey: ['property'] });
  };

  const MaskedField = ({ label, field, value }: { label: string; field: string; value: string }) => {
    const isRevealed = revealedFields[field];
    if (readOnly) {
      return (
        <div>
          <span className="text-xs text-muted-foreground">{label}</span>
          <div className="flex items-center gap-2">
            <p className="font-mono font-bold text-sm text-foreground">
              {value ? (isRevealed ? value : '••••••') : '—'}
            </p>
            {value && (
              <button onClick={() => toggleReveal(field)} className="text-muted-foreground hover:text-foreground">
                {isRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <div className="flex items-center gap-2">
          <Input
            type={isRevealed ? 'text' : 'password'}
            value={value}
            onChange={e => setForm(prev => ({ ...prev, [field]: e.target.value }))}
            className="rounded-xl"
          />
          <button onClick={() => toggleReveal(field)} className="text-muted-foreground hover:text-foreground shrink-0">
            {isRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
    );
  };

  if (readOnly) {
    return (
      <div className="space-y-3">
        {form.access_method && (
          <div>
            <span className="text-xs text-muted-foreground">Access Method</span>
            <p className="font-semibold text-sm text-foreground">{form.access_method}</p>
          </div>
        )}
        <MaskedField label="Access Code" field="access_code" value={form.access_code} />
        {form.parking_notes && (
          <div>
            <span className="text-xs text-muted-foreground">Parking</span>
            <p className="text-sm text-foreground">{form.parking_notes}</p>
          </div>
        )}
        {form.pet_notes && (
          <div>
            <span className="text-xs text-muted-foreground">Pets</span>
            <p className="text-sm text-foreground">{form.pet_notes}</p>
          </div>
        )}
        {form.product_restrictions && (
          <div>
            <span className="text-xs text-muted-foreground">Product Restrictions</span>
            <p className="text-sm text-foreground">{form.product_restrictions}</p>
          </div>
        )}
        {form.special_instructions && (
          <div>
            <span className="text-xs text-muted-foreground">Special Instructions</span>
            <p className="text-sm text-foreground">{form.special_instructions}</p>
          </div>
        )}
        {Object.entries(form.room_notes).map(([room, notes]) =>
          notes ? (
            <div key={room}>
              <span className="text-xs text-muted-foreground">{room} Notes</span>
              <p className="text-sm text-foreground">{notes}</p>
            </div>
          ) : null
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Access Method</Label>
        <Select value={form.access_method} onValueChange={v => setForm(prev => ({ ...prev, access_method: v }))}>
          <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select..." /></SelectTrigger>
          <SelectContent>
            {ACCESS_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <MaskedField label="Access Code" field="access_code" value={form.access_code} />
      <MaskedField label="Alarm Code" field="alarm_code" value={form.alarm_code} />
      <MaskedField label="Garage Code" field="garage_code" value={form.garage_code} />

      <div className="space-y-1.5">
        <Label>Parking Notes</Label>
        <Textarea value={form.parking_notes} onChange={e => setForm(prev => ({ ...prev, parking_notes: e.target.value }))} placeholder="Where to park..." className="rounded-xl" />
      </div>

      <div className="space-y-1.5">
        <Label>Pet Notes</Label>
        <Textarea value={form.pet_notes} onChange={e => setForm(prev => ({ ...prev, pet_notes: e.target.value }))} placeholder="Dogs, cats, other animals..." className="rounded-xl" />
      </div>

      <div className="space-y-1.5">
        <Label>Product Restrictions / Allergies</Label>
        <Textarea value={form.product_restrictions} onChange={e => setForm(prev => ({ ...prev, product_restrictions: e.target.value }))} placeholder="Any product allergies or restrictions..." className="rounded-xl" />
      </div>

      <div className="space-y-1.5">
        <Label>Special Instructions</Label>
        <Textarea value={form.special_instructions} onChange={e => setForm(prev => ({ ...prev, special_instructions: e.target.value }))} placeholder="Any special requirements..." className="rounded-xl" />
      </div>

      <div className="space-y-1.5">
        <Label>Preferred Music / Ambience</Label>
        <Input value={form.preferences_notes} onChange={e => setForm(prev => ({ ...prev, preferences_notes: e.target.value }))} placeholder="e.g. Classical music, no music" className="rounded-xl" />
      </div>

      <div className="space-y-3">
        <Label>Room-by-Room Notes</Label>
        {ROOM_TYPES.map(room => (
          <div key={room} className="space-y-1">
            <span className="text-xs font-semibold text-muted-foreground">{room}</span>
            <Textarea
              value={form.room_notes[room] || ''}
              onChange={e => setForm(prev => ({
                ...prev,
                room_notes: { ...prev.room_notes, [room]: e.target.value },
              }))}
              placeholder={`Notes for ${room.toLowerCase()}...`}
              className="rounded-xl"
              rows={2}
            />
          </div>
        ))}
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full gap-2 rounded-xl font-bold">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save Property Passport
      </Button>
    </div>
  );
}
