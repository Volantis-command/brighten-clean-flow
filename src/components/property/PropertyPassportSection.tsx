import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

// Property Passport — ALL per-property operational data lives on the
// `properties` table. Every piece of information a client fills out in
// the intake form lands here (frequency, preferred days, checkin/checkout
// times, linen & kits, deep-clean hints, commercial details, etc.).
//
// The component reads and writes directly to `properties`. No junction
// table. One truth for admin, client portal, cleaner view, invoicing.
// (Brendan's 2026-04-22 "do it right" directive — Option B.)

interface Props {
  propertyId: string;
  readOnly?: boolean;
  requireClockIn?: boolean;
  isClockedIn?: boolean;
}

const ACCESS_METHODS = ['Key Safe', 'Lockbox', 'Leave Under Mat', 'Someone Home', 'Other'];
const ROOM_TYPES = ['Kitchen', 'Bathrooms', 'Bedrooms', 'Living'];
const FREQUENCIES = ['One-off', 'Weekly', 'Fortnightly', 'Monthly', 'As needed'];
const PREFERRED_TIMES = ['Flexible', 'Morning', 'Afternoon', 'Evening', 'Specific time'];

export default function PropertyPassportSection({ propertyId, readOnly = false, requireClockIn = false, isClockedIn = false }: Props) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [revealedFields, setRevealedFields] = useState<Record<string, boolean>>({});

  const [form, setForm] = useState({
    // Access & security
    access_method: '',
    access_code: '',
    alarm_code: '',
    garage_code: '',
    // Parking / pets / preferences
    parking_notes: '',  // maps to properties.parking_instructions
    pet_notes: '',
    product_restrictions: '',
    special_instructions: '',
    preferences_notes: '',
    room_notes: {} as Record<string, string>,
    // Schedule / service preferences
    clean_frequency: '',
    preferred_days: '',
    preferred_time: '',
    first_clean: false,
    focus_areas: '',
    // Airbnb operations
    checkin_time: '',
    checkout_time: '',
    platform: '',
    linen_required: false,
    amenities_kit: false,
    wash_kit: false,
    tea_coffee_kit: false,
    host_preferences: '',
    // Commercial
    business_name: '',
    abn: '',
    approx_size: '',
    has_kitchen_breakroom: false,
    floor_types: '',
    after_hours_access: false,
    has_security_alarm: false,
    // Deep clean hints
    deep_clean_oven: false,
    deep_clean_fridge: false,
    deep_clean_cupboards: false,
    deep_clean_windows: false,
    last_cleaned_when: '',
    property_condition: '',
    // Structural
    has_garage: false,
    has_outdoor_area: false,
    bed_config: '',
    // Client type (for conditional section rendering)
    client_type: '',
  });

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('properties' as any)
        .select('access_method, access_code, alarm_code, garage_code, parking_instructions, pet_notes, product_restrictions, special_instructions, preferences_notes, room_notes, clean_frequency, preferred_days, preferred_time, first_clean, focus_areas, checkin_time, checkout_time, platform, linen_required, amenities_kit, wash_kit, tea_coffee_kit, host_preferences, business_name, abn, approx_size, has_kitchen_breakroom, floor_types, after_hours_access, has_security_alarm, deep_clean_oven, deep_clean_fridge, deep_clean_cupboards, deep_clean_windows, last_cleaned_when, property_condition, has_garage, has_outdoor_area, bed_config, client_type')
        .eq('id', propertyId)
        .maybeSingle();

      if (data) {
        const d = data as any;
        setForm({
          access_method: d.access_method || '',
          access_code: d.access_code || '',
          alarm_code: d.alarm_code || '',
          garage_code: d.garage_code || '',
          parking_notes: d.parking_instructions || '',
          pet_notes: d.pet_notes || '',
          product_restrictions: d.product_restrictions || '',
          special_instructions: d.special_instructions || '',
          preferences_notes: d.preferences_notes || '',
          room_notes: d.room_notes || {},
          clean_frequency: d.clean_frequency || '',
          preferred_days: d.preferred_days || '',
          preferred_time: d.preferred_time || '',
          first_clean: d.first_clean === true,
          focus_areas: d.focus_areas || '',
          checkin_time: d.checkin_time || '',
          checkout_time: d.checkout_time || '',
          platform: d.platform || '',
          linen_required: d.linen_required === true,
          amenities_kit: d.amenities_kit === true,
          wash_kit: d.wash_kit === true,
          tea_coffee_kit: d.tea_coffee_kit === true,
          host_preferences: d.host_preferences || '',
          business_name: d.business_name || '',
          abn: d.abn || '',
          approx_size: d.approx_size || '',
          has_kitchen_breakroom: d.has_kitchen_breakroom === true,
          floor_types: d.floor_types || '',
          after_hours_access: d.after_hours_access === true,
          has_security_alarm: d.has_security_alarm === true,
          deep_clean_oven: d.deep_clean_oven === true,
          deep_clean_fridge: d.deep_clean_fridge === true,
          deep_clean_cupboards: d.deep_clean_cupboards === true,
          deep_clean_windows: d.deep_clean_windows === true,
          last_cleaned_when: d.last_cleaned_when || '',
          property_condition: d.property_condition || '',
          has_garage: d.has_garage === true,
          has_outdoor_area: d.has_outdoor_area === true,
          bed_config: d.bed_config || '',
          client_type: d.client_type || '',
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
        parking_instructions: form.parking_notes || null,
        pet_notes: form.pet_notes || null,
        product_restrictions: form.product_restrictions || null,
        special_instructions: form.special_instructions || null,
        preferences_notes: form.preferences_notes || null,
        room_notes: Object.keys(form.room_notes).length > 0 ? form.room_notes : null,
        clean_frequency: form.clean_frequency || null,
        preferred_days: form.preferred_days || null,
        preferred_time: form.preferred_time || null,
        first_clean: form.first_clean,
        focus_areas: form.focus_areas || null,
        checkin_time: form.checkin_time || null,
        checkout_time: form.checkout_time || null,
        platform: form.platform || null,
        linen_required: form.linen_required,
        amenities_kit: form.amenities_kit,
        wash_kit: form.wash_kit,
        tea_coffee_kit: form.tea_coffee_kit,
        host_preferences: form.host_preferences || null,
        business_name: form.business_name || null,
        abn: form.abn || null,
        approx_size: form.approx_size || null,
        has_kitchen_breakroom: form.has_kitchen_breakroom,
        floor_types: form.floor_types || null,
        after_hours_access: form.after_hours_access,
        has_security_alarm: form.has_security_alarm,
        deep_clean_oven: form.deep_clean_oven,
        deep_clean_fridge: form.deep_clean_fridge,
        deep_clean_cupboards: form.deep_clean_cupboards,
        deep_clean_windows: form.deep_clean_windows,
        last_cleaned_when: form.last_cleaned_when || null,
        property_condition: form.property_condition || null,
        has_garage: form.has_garage,
        has_outdoor_area: form.has_outdoor_area,
        bed_config: form.bed_config || null,
      } as any)
      .eq('id', propertyId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Property passport saved');
    queryClient.invalidateQueries({ queryKey: ['property'] });
  };

  const renderAccessField = (label: string, field: 'access_code' | 'alarm_code' | 'garage_code', value: string) => {
    const isRevealed = revealedFields[field];
    const fieldIdentity = {
      access_code: { id: 'passport-detail-a', name: 'passport-detail-a' },
      alarm_code: { id: 'passport-detail-b', name: 'passport-detail-b' },
      garage_code: { id: 'passport-detail-c', name: 'passport-detail-c' },
    }[field];

    if (readOnly) {
      return (
        <div key={field}>
          <span className="text-xs text-muted-foreground">{label}</span>
          <div className="flex items-center gap-2">
            <p className="font-mono font-bold text-sm text-foreground">
              {value ? (isRevealed ? value : '••••••') : '—'}
            </p>
            {value && (
              <button type="button" onClick={() => toggleReveal(field)} className="text-muted-foreground hover:text-foreground">
                {isRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div key={field} className="space-y-1.5">
        <Label htmlFor={fieldIdentity.id}>{label}</Label>
        <Input
          id={fieldIdentity.id}
          name={fieldIdentity.name}
          type="text"
          inputMode="text"
          value={value}
          onChange={e => setForm(prev => ({ ...prev, [field]: e.target.value }))}
          className="rounded-xl"
          autoComplete="nope"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-1p-ignore="true"
          data-lpignore="true"
          data-form-type="other"
        />
      </div>
    );
  };

  const isAirbnb = form.client_type === 'airbnb' || !!form.platform;
  const isCommercial = form.client_type === 'commercial';
  const hasDeepCleanData = form.deep_clean_oven || form.deep_clean_fridge || form.deep_clean_cupboards || form.deep_clean_windows || form.last_cleaned_when || form.property_condition;

  if (readOnly) {
    return (
      <div className="space-y-3">
        {form.access_method && (
          <div>
            <span className="text-xs text-muted-foreground">Access Method</span>
            <p className="font-semibold text-sm text-foreground">{form.access_method}</p>
          </div>
        )}
        {renderAccessField('Access Code', 'access_code', form.access_code)}
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
        {(form.clean_frequency || form.preferred_days || form.preferred_time) && (
          <div className="border-t pt-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Schedule Preferences</p>
            {form.clean_frequency && <div><span className="text-xs text-muted-foreground">Frequency</span><p className="text-sm">{form.clean_frequency}</p></div>}
            {form.preferred_days && <div className="mt-1"><span className="text-xs text-muted-foreground">Preferred Days</span><p className="text-sm">{form.preferred_days}</p></div>}
            {form.preferred_time && <div className="mt-1"><span className="text-xs text-muted-foreground">Preferred Time</span><p className="text-sm">{form.preferred_time}</p></div>}
          </div>
        )}
        {isAirbnb && (form.checkin_time || form.checkout_time || form.platform) && (
          <div className="border-t pt-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Airbnb / Turnover</p>
            {form.platform && <div><span className="text-xs text-muted-foreground">Platform</span><p className="text-sm">{form.platform}</p></div>}
            {form.checkout_time && <div className="mt-1"><span className="text-xs text-muted-foreground">Guest Checkout</span><p className="text-sm">{form.checkout_time}</p></div>}
            {form.checkin_time && <div className="mt-1"><span className="text-xs text-muted-foreground">Next Check-in</span><p className="text-sm">{form.checkin_time}</p></div>}
            <div className="mt-1"><span className="text-xs text-muted-foreground">Linen supplied</span><p className="text-sm">{form.linen_required ? 'Yes' : 'No'}</p></div>
            <div className="mt-1"><span className="text-xs text-muted-foreground">Kits</span><p className="text-sm">{[form.amenities_kit && 'Amenities', form.wash_kit && 'Wash', form.tea_coffee_kit && 'Tea/Coffee'].filter(Boolean).join(', ') || '—'}</p></div>
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
    <div className="space-y-6">
      {/* Access & Security */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Access & Security</h3>
        <div className="space-y-1.5">
          <Label>Access Method</Label>
          <Select value={form.access_method} onValueChange={v => setForm(prev => ({ ...prev, access_method: v }))}>
            <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              {ACCESS_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {renderAccessField('Access Code', 'access_code', form.access_code)}
        {renderAccessField('Alarm Code', 'alarm_code', form.alarm_code)}
        {renderAccessField('Garage Code', 'garage_code', form.garage_code)}
      </div>

      {/* Parking / Pets / Preferences */}
      <div className="space-y-4 border-t pt-6">
        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Parking, Pets & Preferences</h3>
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
        <div className="space-y-1.5">
          <Label>Focus Areas</Label>
          <Textarea value={form.focus_areas} onChange={e => setForm(prev => ({ ...prev, focus_areas: e.target.value }))} placeholder="Areas to pay extra attention to..." className="rounded-xl" />
        </div>
      </div>

      {/* Schedule Preferences */}
      <div className="space-y-4 border-t pt-6">
        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Schedule Preferences</h3>
        <div className="space-y-1.5">
          <Label>Clean Frequency</Label>
          <Select value={form.clean_frequency} onValueChange={v => setForm(prev => ({ ...prev, clean_frequency: v }))}>
            <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select frequency..." /></SelectTrigger>
            <SelectContent>
              {FREQUENCIES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Preferred Days</Label>
          <Input value={form.preferred_days} onChange={e => setForm(prev => ({ ...prev, preferred_days: e.target.value }))} placeholder="e.g. Mon, Wed, Fri" className="rounded-xl" />
        </div>
        <div className="space-y-1.5">
          <Label>Preferred Time</Label>
          <Select value={form.preferred_time} onValueChange={v => setForm(prev => ({ ...prev, preferred_time: v }))}>
            <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              {PREFERRED_TIMES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between">
          <Label>First Clean</Label>
          <Switch checked={form.first_clean} onCheckedChange={v => setForm(prev => ({ ...prev, first_clean: v }))} />
        </div>
      </div>

      {/* Airbnb Operations */}
      {isAirbnb && (
        <div className="space-y-4 border-t pt-6">
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Airbnb / Turnover Operations</h3>
          <div className="space-y-1.5">
            <Label>Platform</Label>
            <Input value={form.platform} onChange={e => setForm(prev => ({ ...prev, platform: e.target.value }))} placeholder="Airbnb, Stayz, etc." className="rounded-xl" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Guest Checkout</Label>
              <Input type="time" value={form.checkout_time} onChange={e => setForm(prev => ({ ...prev, checkout_time: e.target.value }))} className="rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label>Next Check-in</Label>
              <Input type="time" value={form.checkin_time} onChange={e => setForm(prev => ({ ...prev, checkin_time: e.target.value }))} className="rounded-xl" />
            </div>
          </div>
          <div className="flex items-center justify-between"><Label>Linen supplied by Brightly</Label><Switch checked={form.linen_required} onCheckedChange={v => setForm(prev => ({ ...prev, linen_required: v }))} /></div>
          <div className="flex items-center justify-between"><Label>Amenities Kit</Label><Switch checked={form.amenities_kit} onCheckedChange={v => setForm(prev => ({ ...prev, amenities_kit: v }))} /></div>
          <div className="flex items-center justify-between"><Label>Wash Kit</Label><Switch checked={form.wash_kit} onCheckedChange={v => setForm(prev => ({ ...prev, wash_kit: v }))} /></div>
          <div className="flex items-center justify-between"><Label>Tea/Coffee Kit</Label><Switch checked={form.tea_coffee_kit} onCheckedChange={v => setForm(prev => ({ ...prev, tea_coffee_kit: v }))} /></div>
          <div className="space-y-1.5">
            <Label>Host Preferences</Label>
            <Textarea value={form.host_preferences} onChange={e => setForm(prev => ({ ...prev, host_preferences: e.target.value }))} placeholder="Hosting style, standards, anything specific..." className="rounded-xl" />
          </div>
        </div>
      )}

      {/* Commercial Details */}
      {isCommercial && (
        <div className="space-y-4 border-t pt-6">
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Commercial Details</h3>
          <div className="space-y-1.5"><Label>Business Name</Label><Input value={form.business_name} onChange={e => setForm(prev => ({ ...prev, business_name: e.target.value }))} className="rounded-xl" /></div>
          <div className="space-y-1.5"><Label>ABN</Label><Input value={form.abn} onChange={e => setForm(prev => ({ ...prev, abn: e.target.value }))} className="rounded-xl" /></div>
          <div className="space-y-1.5"><Label>Approximate Size</Label><Input value={form.approx_size} onChange={e => setForm(prev => ({ ...prev, approx_size: e.target.value }))} placeholder="e.g. 100-300m²" className="rounded-xl" /></div>
          <div className="space-y-1.5"><Label>Floor Types</Label><Input value={form.floor_types} onChange={e => setForm(prev => ({ ...prev, floor_types: e.target.value }))} placeholder="Carpet, tile, hard floor, both..." className="rounded-xl" /></div>
          <div className="flex items-center justify-between"><Label>Kitchen / Breakroom</Label><Switch checked={form.has_kitchen_breakroom} onCheckedChange={v => setForm(prev => ({ ...prev, has_kitchen_breakroom: v }))} /></div>
          <div className="flex items-center justify-between"><Label>After-Hours Access</Label><Switch checked={form.after_hours_access} onCheckedChange={v => setForm(prev => ({ ...prev, after_hours_access: v }))} /></div>
          <div className="flex items-center justify-between"><Label>Security Alarm</Label><Switch checked={form.has_security_alarm} onCheckedChange={v => setForm(prev => ({ ...prev, has_security_alarm: v }))} /></div>
        </div>
      )}

      {/* Deep Clean Hints */}
      {hasDeepCleanData && (
        <div className="space-y-4 border-t pt-6">
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Deep Clean Details</h3>
          <div className="flex items-center justify-between"><Label>Oven clean requested</Label><Switch checked={form.deep_clean_oven} onCheckedChange={v => setForm(prev => ({ ...prev, deep_clean_oven: v }))} /></div>
          <div className="flex items-center justify-between"><Label>Inside fridge</Label><Switch checked={form.deep_clean_fridge} onCheckedChange={v => setForm(prev => ({ ...prev, deep_clean_fridge: v }))} /></div>
          <div className="flex items-center justify-between"><Label>Inside cupboards</Label><Switch checked={form.deep_clean_cupboards} onCheckedChange={v => setForm(prev => ({ ...prev, deep_clean_cupboards: v }))} /></div>
          <div className="flex items-center justify-between"><Label>Interior windows</Label><Switch checked={form.deep_clean_windows} onCheckedChange={v => setForm(prev => ({ ...prev, deep_clean_windows: v }))} /></div>
          <div className="space-y-1.5"><Label>Last Cleaned</Label><Input value={form.last_cleaned_when} onChange={e => setForm(prev => ({ ...prev, last_cleaned_when: e.target.value }))} placeholder="e.g. 3 months ago" className="rounded-xl" /></div>
          <div className="space-y-1.5"><Label>Property Condition</Label><Input value={form.property_condition} onChange={e => setForm(prev => ({ ...prev, property_condition: e.target.value }))} placeholder="Good / Fair / Needs work" className="rounded-xl" /></div>
        </div>
      )}

      {/* Structural Flags */}
      <div className="space-y-4 border-t pt-6">
        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Property Features</h3>
        <div className="flex items-center justify-between"><Label>Has Garage</Label><Switch checked={form.has_garage} onCheckedChange={v => setForm(prev => ({ ...prev, has_garage: v }))} /></div>
        <div className="flex items-center justify-between"><Label>Has Outdoor Area</Label><Switch checked={form.has_outdoor_area} onCheckedChange={v => setForm(prev => ({ ...prev, has_outdoor_area: v }))} /></div>
        <div className="space-y-1.5"><Label>Bed Configuration</Label><Textarea value={form.bed_config} onChange={e => setForm(prev => ({ ...prev, bed_config: e.target.value }))} placeholder="e.g. Bedroom 1: Queen, Bedroom 2: Two singles" className="rounded-xl" rows={2} /></div>
      </div>

      {/* Room-by-Room Notes */}
      <div className="space-y-3 border-t pt-6">
        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Room-by-Room Notes</h3>
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
