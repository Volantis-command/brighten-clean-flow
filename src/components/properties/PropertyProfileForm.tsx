import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCleanersList } from '@/hooks/useCleanersList';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, Loader2, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/* ─── constants ─── */

const PROPERTY_TYPES = ['House', 'Apartment', 'Townhouse', 'Unit', 'Villa'];
const ACCESS_METHODS = ['Key safe', 'Lockbox', 'Leave unlocked', 'Meet at property', 'Other'];
const BED_TYPES = ['King', 'Queen', 'Double', 'Single', 'Bunk'];
const ROOM_NOTE_KEYS = [
  'Kitchen', 'Living/Dining', 'Master Bedroom', 'Bedroom 2',
  'Bedroom 3', 'Bathrooms', 'Laundry', 'Other',
];

/* ─── types ─── */

interface BedConfigEntry { room: string; bed_type: string }

interface PropertyProfileFormProps {
  property: any;
  mode: 'view' | 'edit' | 'create';
  isAdmin?: boolean;
  onSaved?: () => void;
}

/* ─── component ─── */

export default function PropertyProfileForm({ property, mode, isAdmin = false, onSaved }: PropertyProfileFormProps) {
  const queryClient = useQueryClient();
  const { data: cleaners = [] } = useCleanersList();
  const [saving, setSaving] = useState(false);
  const [revealedFields, setRevealedFields] = useState<Record<string, boolean>>({});
  const isView = mode === 'view';

  const [form, setForm] = useState({
    // Overview
    property_name: '',
    address: '',
    suburb: '',
    state: '',
    postcode: '',
    property_type: '',
    client_type: 'residential',
    bedrooms: 1,
    bathrooms: 1,
    bed_config: [] as BedConfigEntry[],
    status: 'active',
    // Access
    access_method: '',
    access_code: '',
    alarm_code: '',
    garage_code: '',
    parking_notes: '',
    // Instructions
    special_instructions: '',
    product_restrictions: '',
    room_notes: {} as Record<string, string>,
    // Pricing
    locked_price_inc_gst: '',
    estimated_hours: '',
    pricing_notes: '',
    preferred_cleaner_id: '',
    default_price: '',
    price_includes_gst: false,
    // Client
    client_name: '',
    client_phone: '',
    client_email: '',
    // Airbnb extras
    linen_provided: false,
    linen_sets: 0,
    amenities_restock: false,
    amenities_list: '',
    sofa_beds: 0,
    guest_access_notes: '',
    guest_wifi: '',
    // Residential extras
    is_occupied: false,
    occupant_count: 0,
  });

  useEffect(() => {
    if (property) {
      setForm({
        property_name: property.property_name || '',
        address: property.address || '',
        suburb: property.suburb || '',
        state: property.state || '',
        postcode: property.postcode || '',
        property_type: property.property_type || '',
        client_type: property.client_type || 'residential',
        bedrooms: property.bedrooms || 1,
        bathrooms: property.bathrooms || 1,
        bed_config: (property.bed_config as BedConfigEntry[]) || [],
        status: property.status || 'active',
        access_method: property.access_method || '',
        access_code: property.access_code || '',
        alarm_code: property.alarm_code || '',
        garage_code: property.garage_code || '',
        parking_notes: property.parking_notes || '',
        special_instructions: property.special_instructions || '',
        product_restrictions: property.product_restrictions || '',
        room_notes: (property.room_notes as Record<string, string>) || {},
        locked_price_inc_gst: property.locked_price_inc_gst != null ? String(property.locked_price_inc_gst) : '',
        estimated_hours: property.estimated_hours != null ? String(property.estimated_hours) : '',
        pricing_notes: property.pricing_notes || '',
        preferred_cleaner_id: property.preferred_cleaner_id || '',
        default_price: (property as any).default_price != null ? String((property as any).default_price) : '',
        price_includes_gst: (property as any).price_includes_gst || false,
        client_name: property.client_name || '',
        client_phone: property.client_phone || '',
        client_email: property.client_email || '',
        linen_provided: property.linen_provided || false,
        linen_sets: property.linen_sets || 0,
        amenities_restock: property.amenities_restock || false,
        amenities_list: property.amenities_list || '',
        sofa_beds: property.sofa_beds || 0,
        guest_access_notes: property.guest_access_notes || '',
        guest_wifi: property.guest_wifi || '',
        is_occupied: property.is_occupied || false,
        occupant_count: property.occupant_count || 0,
      });
    }
  }, [property]);

  const u = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }));

  const toggleReveal = (field: string) => setRevealedFields(p => ({ ...p, [field]: !p[field] }));

  const handleSave = async () => {
    if (!form.property_name.trim()) { toast.error('Property name is required'); return; }
    setSaving(true);

    const payload: Record<string, any> = {
      property_name: form.property_name,
      address: form.address || null,
      suburb: form.suburb || null,
      state: form.state || null,
      postcode: form.postcode || null,
      property_type: form.property_type || null,
      client_type: form.client_type,
      bedrooms: form.bedrooms,
      bathrooms: form.bathrooms,
      bed_config: form.bed_config.length > 0 ? form.bed_config : null,
      status: form.status,
      access_method: form.access_method || null,
      access_code: form.access_code || null,
      alarm_code: form.alarm_code || null,
      garage_code: form.garage_code || null,
      parking_notes: form.parking_notes || null,
      special_instructions: form.special_instructions || null,
      product_restrictions: form.product_restrictions || null,
      room_notes: Object.keys(form.room_notes).length > 0 ? form.room_notes : null,
      locked_price_inc_gst: form.locked_price_inc_gst ? parseFloat(form.locked_price_inc_gst) : null,
      estimated_hours: form.estimated_hours ? parseFloat(form.estimated_hours) : null,
      pricing_notes: form.pricing_notes || null,
      preferred_cleaner_id: form.preferred_cleaner_id || null,
      default_price: form.default_price ? parseFloat(form.default_price) : null,
      price_includes_gst: form.price_includes_gst,
      client_name: form.client_name || null,
      client_phone: form.client_phone || null,
      client_email: form.client_email || null,
      linen_provided: form.linen_provided,
      linen_sets: form.linen_sets,
      amenities_restock: form.amenities_restock,
      amenities_list: form.amenities_list || null,
      sofa_beds: form.sofa_beds,
      guest_access_notes: form.guest_access_notes || null,
      guest_wifi: form.guest_wifi || null,
      is_occupied: form.is_occupied,
      occupant_count: form.occupant_count,
    };

    let error: any;
    if (mode === 'create') {
      const res = await supabase.from('properties').insert(payload as any).select().single();
      error = res.error;
    } else {
      const res = await supabase.from('properties').update(payload as any).eq('id', property.id);
      error = res.error;
    }

    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(mode === 'create' ? 'Property created' : 'Property saved');
    queryClient.invalidateQueries({ queryKey: ['property', property?.id] });
    queryClient.invalidateQueries({ queryKey: ['properties'] });
    onSaved?.();
  };

  const isAirbnb = form.client_type === 'airbnb' || form.client_type === 'short_term_rental';

  /* ─── masked code field ─── */
  const MaskedField = ({ label, field, value }: { label: string; field: string; value: string }) => {
    const revealed = revealedFields[field];
    if (isView) {
      return (
        <div>
          <span className="text-xs text-muted-foreground">{label}</span>
          <div className="flex items-center gap-2">
            <p className="font-mono font-bold text-sm text-foreground">
              {value ? (revealed ? value : '\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF') : '\u2014'}
            </p>
            {value && (
              <button onClick={() => toggleReveal(field)} className="text-muted-foreground hover:text-foreground">
                {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
            type={revealed ? 'text' : 'password'}
            value={value}
            onChange={e => u(field, e.target.value)}
            className="h-12 rounded-xl"
          />
          <button onClick={() => toggleReveal(field)} className="text-muted-foreground hover:text-foreground shrink-0">
            {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>
    );
  };

  /* ─── bed config helpers ─── */
  const addBedRoom = () => {
    u('bed_config', [...form.bed_config, { room: `Bedroom ${form.bed_config.length + 1}`, bed_type: 'Queen' }]);
  };
  const removeBedRoom = (idx: number) => {
    u('bed_config', form.bed_config.filter((_, i) => i !== idx));
  };
  const updateBed = (idx: number, bed_type: string) => {
    const updated = [...form.bed_config];
    updated[idx] = { ...updated[idx], bed_type };
    u('bed_config', updated);
  };

  /* ═══════ VIEW MODE ═══════ */
  if (isView) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-xl font-extrabold text-foreground">{form.property_name}</h2>
          <p className="text-sm text-muted-foreground">
            {[form.address, form.suburb, form.state, form.postcode].filter(Boolean).join(', ')}
          </p>
          <div className="flex gap-2 mt-2">
            {form.property_type && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{form.property_type}</span>
            )}
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
              {form.bedrooms} bed / {form.bathrooms} bath
            </span>
          </div>
        </div>

        {/* Access */}
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <h3 className="text-sm font-bold text-foreground">Access</h3>
          {form.access_method && (
            <div><span className="text-xs text-muted-foreground">Method</span><p className="font-semibold text-sm">{form.access_method}</p></div>
          )}
          <MaskedField label="Access Code" field="access_code" value={form.access_code} />
          <MaskedField label="Alarm Code" field="alarm_code" value={form.alarm_code} />
          <MaskedField label="Garage Code" field="garage_code" value={form.garage_code} />
          {form.parking_notes && (
            <div><span className="text-xs text-muted-foreground">Parking</span><p className="text-sm">{form.parking_notes}</p></div>
          )}
        </div>

        {/* Instructions */}
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <h3 className="text-sm font-bold text-foreground">Instructions</h3>
          {form.special_instructions && <div><span className="text-xs text-muted-foreground">Special Instructions</span><p className="text-sm">{form.special_instructions}</p></div>}
          {form.product_restrictions && <div><span className="text-xs text-muted-foreground">Product Restrictions</span><p className="text-sm">{form.product_restrictions}</p></div>}
          {Object.entries(form.room_notes).map(([room, notes]) =>
            notes ? <div key={room}><span className="text-xs text-muted-foreground">{room}</span><p className="text-sm">{notes}</p></div> : null
          )}
        </div>

        {/* Airbnb extras */}
        {isAirbnb && (
          <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
            <h3 className="text-sm font-bold text-foreground">Airbnb Extras</h3>
            <div><span className="text-xs text-muted-foreground">Linen Provided</span><p className="text-sm font-semibold">{form.linen_provided ? `Yes (${form.linen_sets} sets)` : 'No'}</p></div>
            <div><span className="text-xs text-muted-foreground">Amenities Restocking</span><p className="text-sm font-semibold">{form.amenities_restock ? 'Yes' : 'No'}</p></div>
            {form.amenities_list && <div><span className="text-xs text-muted-foreground">Restock Items</span><p className="text-sm">{form.amenities_list}</p></div>}
            {form.sofa_beds > 0 && <div><span className="text-xs text-muted-foreground">Sofa Beds</span><p className="text-sm font-semibold">{form.sofa_beds}</p></div>}
            {form.guest_access_notes && <div><span className="text-xs text-muted-foreground">Guest Key Handover</span><p className="text-sm">{form.guest_access_notes}</p></div>}
            {form.guest_wifi && <div><span className="text-xs text-muted-foreground">Guest WiFi</span><p className="text-sm font-mono">{form.guest_wifi}</p></div>}
          </div>
        )}
      </div>
    );
  }

  /* ═══════ EDIT / CREATE MODE ═══════ */
  return (
    <div className="space-y-4">
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full grid grid-cols-4 lg:grid-cols-5">
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="access" className="text-xs">Access</TabsTrigger>
          <TabsTrigger value="instructions" className="text-xs">Instructions</TabsTrigger>
          <TabsTrigger value="pricing" className="text-xs">Pricing</TabsTrigger>
          {isAirbnb && <TabsTrigger value="airbnb" className="text-xs">Airbnb</TabsTrigger>}
        </TabsList>

        {/* ── OVERVIEW TAB ── */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <Field label="Property Name *">
            <Input value={form.property_name} onChange={e => u('property_name', e.target.value)} className="h-12 rounded-xl" />
          </Field>
          <Field label="Full Address">
            <Input value={form.address} onChange={e => u('address', e.target.value)} className="h-12 rounded-xl" />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Suburb"><Input value={form.suburb} onChange={e => u('suburb', e.target.value)} className="h-12 rounded-xl" /></Field>
            <Field label="State"><Input value={form.state} onChange={e => u('state', e.target.value)} className="h-12 rounded-xl" /></Field>
            <Field label="Postcode"><Input value={form.postcode} onChange={e => u('postcode', e.target.value)} className="h-12 rounded-xl" /></Field>
          </div>
          <Field label="Type">
            <div className="flex gap-2">
              {[{ v: 'residential', l: 'Residential' }, { v: 'airbnb', l: 'Airbnb / Short Stay' }].map(({ v, l }) => (
                <button key={v} type="button" onClick={() => u('client_type', v)}
                  className={cn('flex-1 py-3 rounded-xl border-2 font-bold text-sm transition-all',
                    form.client_type === v ? 'border-[#FEDB00] bg-[#0C463D] text-[#FEDB00]' : 'border-border text-muted-foreground'
                  )}
                >{l}</button>
              ))}
            </div>
          </Field>
          <Field label="Property Type">
            <div className="flex flex-wrap gap-2">
              {PROPERTY_TYPES.map(pt => (
                <button key={pt} type="button" onClick={() => u('property_type', pt)}
                  className={cn('px-4 py-2 rounded-xl border-2 font-bold text-sm transition-all',
                    form.property_type === pt ? 'border-[#FEDB00] bg-[#0C463D] text-[#FEDB00]' : 'border-border text-muted-foreground'
                  )}
                >{pt}</button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Bedrooms">
              <Input type="number" min={0} value={form.bedrooms} onChange={e => u('bedrooms', Number(e.target.value))} className="h-12 rounded-xl" />
            </Field>
            <Field label="Bathrooms">
              <Input type="number" min={0} value={form.bathrooms} onChange={e => u('bathrooms', Number(e.target.value))} className="h-12 rounded-xl" />
            </Field>
          </div>

          {/* Bed Configuration */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Bed Configuration</Label>
            {form.bed_config.map((bed, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-24 shrink-0">{bed.room}</span>
                <Select value={bed.bed_type} onValueChange={v => updateBed(idx, v)}>
                  <SelectTrigger className="h-10 rounded-xl flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BED_TYPES.map(bt => <SelectItem key={bt} value={bt}>{bt}</SelectItem>)}
                  </SelectContent>
                </Select>
                <button onClick={() => removeBedRoom(idx)} className="text-destructive hover:text-destructive/80 shrink-0">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addBedRoom} className="gap-1 rounded-xl">
              <Plus className="h-3.5 w-3.5" /> Add Bedroom
            </Button>
          </div>

          <Field label="Client / Host Name">
            <Input value={form.client_name} onChange={e => u('client_name', e.target.value)} className="h-12 rounded-xl" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Client Phone">
              <Input value={form.client_phone} onChange={e => u('client_phone', e.target.value)} className="h-12 rounded-xl" type="tel" />
            </Field>
            <Field label="Client Email">
              <Input value={form.client_email} onChange={e => u('client_email', e.target.value)} className="h-12 rounded-xl" type="email" />
            </Field>
          </div>

          {/* Residential only */}
          {!isAirbnb && (
            <>
              <div className="flex items-center justify-between py-2">
                <Label className="font-semibold">Currently Occupied?</Label>
                <Switch checked={form.is_occupied} onCheckedChange={v => u('is_occupied', v)} />
              </div>
              {form.is_occupied && (
                <Field label="Number of Occupants">
                  <Input type="number" min={0} value={form.occupant_count} onChange={e => u('occupant_count', Number(e.target.value))} className="h-12 rounded-xl" />
                </Field>
              )}
            </>
          )}

          <div className="flex items-center justify-between py-2">
            <Label className="font-semibold">Active</Label>
            <Switch checked={form.status === 'active'} onCheckedChange={v => u('status', v ? 'active' : 'inactive')} />
          </div>
        </TabsContent>

        {/* ── ACCESS TAB ── */}
        <TabsContent value="access" className="space-y-4 mt-4">
          <Field label="Access Method">
            <Select value={form.access_method} onValueChange={v => u('access_method', v)}>
              <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Select..." /></SelectTrigger>
              <SelectContent>
                {ACCESS_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <MaskedField label="Key Safe / Lockbox Code" field="access_code" value={form.access_code} />
          <MaskedField label="Alarm Code" field="alarm_code" value={form.alarm_code} />
          <MaskedField label="Garage Code" field="garage_code" value={form.garage_code} />
          <Field label="Parking Notes">
            <Textarea value={form.parking_notes} onChange={e => u('parking_notes', e.target.value)} className="rounded-xl" placeholder="Where to park..." />
          </Field>
        </TabsContent>

        {/* ── INSTRUCTIONS TAB ── */}
        <TabsContent value="instructions" className="space-y-4 mt-4">
          <Field label="Special Instructions">
            <Textarea value={form.special_instructions} onChange={e => u('special_instructions', e.target.value)} className="rounded-xl" placeholder="Pets, fragile areas, restricted rooms..." rows={3} />
          </Field>
          <Field label="Product Restrictions / Allergies">
            <Textarea value={form.product_restrictions} onChange={e => u('product_restrictions', e.target.value)} className="rounded-xl" placeholder="e.g. No bleach on timber floors" rows={2} />
          </Field>
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Room Notes</Label>
            {ROOM_NOTE_KEYS.map(room => (
              <div key={room} className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">{room}</span>
                <Textarea
                  value={form.room_notes[room] || ''}
                  onChange={e => u('room_notes', { ...form.room_notes, [room]: e.target.value })}
                  placeholder={`Notes for ${room.toLowerCase()}...`}
                  className="rounded-xl"
                  rows={2}
                />
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── PRICING TAB ── */}
        <TabsContent value="pricing" className="space-y-4 mt-4">
          {isAdmin ? (
            <>
              <Field label="Standard Clean Price">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">$</span>
                    <Input type="number" step="0.01" min="0" value={form.default_price} onChange={e => u('default_price', e.target.value)} className="h-12 rounded-xl pl-8" placeholder="e.g. 150.00" />
                  </div>
                  <button
                    type="button"
                    onClick={() => u('price_includes_gst', !form.price_includes_gst)}
                    className={cn(
                      'px-4 h-12 rounded-xl border-2 font-bold text-sm transition-all whitespace-nowrap',
                      form.price_includes_gst ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'
                    )}
                  >
                    {form.price_includes_gst ? 'inc GST' : 'ex GST'}
                  </button>
                </div>
                {form.default_price && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {form.price_includes_gst
                      ? `$${(parseFloat(form.default_price) / 1.1).toFixed(2)} ex GST`
                      : `$${(parseFloat(form.default_price) * 1.1).toFixed(2)} inc GST`}
                  </p>
                )}
              </Field>
              <Field label="Locked Sell Price (inc GST)">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">$</span>
                  <Input type="number" step="0.01" min="0" value={form.locked_price_inc_gst} onChange={e => u('locked_price_inc_gst', e.target.value)} className="h-12 rounded-xl pl-8" placeholder="0.00" />
                </div>
              </Field>
              <Field label="Estimated Hours">
                <Input type="number" step="0.5" min="0" value={form.estimated_hours} onChange={e => u('estimated_hours', e.target.value)} className="h-12 rounded-xl" placeholder="e.g. 3.5" />
              </Field>
              <Field label="Pricing Notes">
                <Textarea value={form.pricing_notes} onChange={e => u('pricing_notes', e.target.value)} className="rounded-xl" placeholder="Notes on pricing..." rows={2} />
              </Field>
              <Field label="Preferred Cleaner">
                <Select value={form.preferred_cleaner_id || '__none__'} onValueChange={v => u('preferred_cleaner_id', v === '__none__' ? '' : v)}>
                  <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Select cleaner" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {cleaners.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.full_name || c.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-4">Pricing information is only visible to administrators.</p>
          )}
        </TabsContent>

        {/* ── AIRBNB EXTRAS TAB ── */}
        {isAirbnb && (
          <TabsContent value="airbnb" className="space-y-4 mt-4">
            <div className="flex items-center justify-between py-2">
              <Label className="font-semibold">Linen Provided by Brightly</Label>
              <Switch checked={form.linen_provided} onCheckedChange={v => u('linen_provided', v)} />
            </div>
            {form.linen_provided && (
              <Field label="Number of Linen Sets">
                <Input type="number" min={0} value={form.linen_sets} onChange={e => u('linen_sets', Number(e.target.value))} className="h-12 rounded-xl" />
              </Field>
            )}
            <div className="flex items-center justify-between py-2">
              <Label className="font-semibold">Amenities Restocking</Label>
              <Switch checked={form.amenities_restock} onCheckedChange={v => u('amenities_restock', v)} />
            </div>
            {form.amenities_restock && (
              <Field label="Items to Restock">
                <Textarea value={form.amenities_list} onChange={e => u('amenities_list', e.target.value)} className="rounded-xl" placeholder="Shampoo, conditioner, soap..." rows={2} />
              </Field>
            )}
            <Field label="Sofa Beds">
              <div className="flex gap-2">
                {[0, 1, 2, 3].map(n => (
                  <button key={n} type="button" onClick={() => u('sofa_beds', n)}
                    className={cn('h-12 w-12 rounded-xl border-2 font-bold transition-all',
                      form.sofa_beds === n ? 'border-[#FEDB00] bg-[#0C463D] text-[#FEDB00]' : 'border-border text-muted-foreground'
                    )}
                  >{n}</button>
                ))}
              </div>
            </Field>
            <Field label="Guest Key Handover">
              <Textarea value={form.guest_access_notes} onChange={e => u('guest_access_notes', e.target.value)} className="rounded-xl" placeholder="How guests access the property..." rows={2} />
            </Field>
            <Field label="Guest WiFi Password">
              <Input value={form.guest_wifi} onChange={e => u('guest_wifi', e.target.value)} className="h-12 rounded-xl" placeholder="WiFi password for cleaner reference" />
            </Field>
          </TabsContent>
        )}
      </Tabs>

      {/* Save Button */}
      <Button onClick={handleSave} disabled={saving} className="w-full gap-2 rounded-xl font-bold bg-[#FEDB00] text-[#0C463D] hover:bg-[#FFE633]" size="lg">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? 'Saving...' : mode === 'create' ? 'Create Property' : 'Save Profile'}
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold text-foreground">{label}</Label>
      {children}
    </div>
  );
}
