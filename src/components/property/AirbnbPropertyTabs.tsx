import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { TimeSelect } from '@/components/ui/time-select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useCleanersList } from '@/hooks/useCleanersList';

interface AirbnbPropertyTabsProps {
  form: Record<string, any>;
  updateField: (field: string, value: any) => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold text-foreground">{label}</Label>
      {children}
    </div>
  );
}

function NumberField({ label, value, onChange, min = 0, max = 20 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <Field label={label}>
      <Input type="number" min={min} max={max} value={value || ''} onChange={(e) => onChange(parseInt(e.target.value) || 0)} className="h-12 rounded-xl" />
    </Field>
  );
}

const DEFAULT_CONSUMABLES = [
  { key: 'toilet_paper', label: 'Toilet Paper', hasQty: true, qtyLabel: 'rolls per bathroom' },
  { key: 'hand_soap', label: 'Hand Soap', hasQty: false },
  { key: 'dish_soap', label: 'Dish Soap', hasQty: false },
  { key: 'kitchen_roll', label: 'Kitchen Roll', hasQty: false },
  { key: 'bin_liners', label: 'Bin Liners', hasQty: false, hasSize: true },
  { key: 'shower_gel', label: 'Shower Gel', hasQty: false },
  { key: 'shampoo_conditioner', label: 'Shampoo / Conditioner', hasQty: false },
  { key: 'coffee_tea', label: 'Coffee / Tea', hasQty: true, qtyLabel: 'qty' },
  { key: 'welcome_pack', label: 'Welcome Pack', hasQty: false },
];

export default function AirbnbPropertyTabs({ form, updateField }: AirbnbPropertyTabsProps) {
  const { data: cleaners = [] } = useCleanersList();
  const linenConfig = form.linen_config || {};
  const consumablesConfig = Array.isArray(form.consumables_config) ? form.consumables_config : [];
  const accessDetails = form.access_details || {};

  const updateLinen = (key: string, value: any) => {
    updateField('linen_config', { ...linenConfig, [key]: value });
  };

  const toggleConsumable = (key: string, checked: boolean) => {
    if (checked) {
      updateField('consumables_config', [...consumablesConfig, { key, qty: 1 }]);
    } else {
      updateField('consumables_config', consumablesConfig.filter((c: any) => c.key !== key));
    }
  };

  const updateConsumableQty = (key: string, qty: number) => {
    updateField('consumables_config', consumablesConfig.map((c: any) => c.key === key ? { ...c, qty } : c));
  };

  const isConsumableChecked = (key: string) => consumablesConfig.some((c: any) => c.key === key);

  const updateAccess = (key: string, value: any) => {
    updateField('access_details', { ...accessDetails, [key]: value });
  };

  const assignedCleanerIds: string[] = Array.isArray(form.assigned_cleaner_ids) ? form.assigned_cleaner_ids : [];
  const toggleAssignedCleaner = (id: string) => {
    if (assignedCleanerIds.includes(id)) {
      updateField('assigned_cleaner_ids', assignedCleanerIds.filter(c => c !== id));
    } else {
      updateField('assigned_cleaner_ids', [...assignedCleanerIds, id]);
    }
  };

  return (
    <Tabs defaultValue="details" className="w-full">
      <TabsList className="w-full grid grid-cols-7 bg-muted rounded-xl h-10 text-xs">
        <TabsTrigger value="details" className="rounded-lg text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Details</TabsTrigger>
        <TabsTrigger value="linen" className="rounded-lg text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Linen</TabsTrigger>
        <TabsTrigger value="consumables" className="rounded-lg text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Supplies</TabsTrigger>
        <TabsTrigger value="instructions" className="rounded-lg text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Clean</TabsTrigger>
        <TabsTrigger value="access" className="rounded-lg text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Access</TabsTrigger>
        <TabsTrigger value="schedule" className="rounded-lg text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Schedule</TabsTrigger>
        <TabsTrigger value="pricing" className="rounded-lg text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Pricing</TabsTrigger>
      </TabsList>

      {/* TAB 1 — Property Details */}
      <TabsContent value="details" className="space-y-4 mt-4">
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Toilets" value={form.toilets || 1} onChange={(v) => updateField('toilets', v)} />
          <NumberField label="Max Guests" value={form.max_guests || 0} onChange={(v) => updateField('max_guests', v)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-3 p-3 bg-muted rounded-xl">
            <Switch checked={form.has_outdoor_area || false} onCheckedChange={(v) => updateField('has_outdoor_area', v)} />
            <Label className="text-sm font-semibold">Outdoor Area</Label>
          </div>
          <div className="flex items-center gap-3 p-3 bg-muted rounded-xl">
            <Switch checked={form.has_pool || false} onCheckedChange={(v) => updateField('has_pool', v)} />
            <Label className="text-sm font-semibold">Pool / Spa</Label>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-3 p-3 bg-muted rounded-xl">
            <Switch checked={form.has_oven || false} onCheckedChange={(v) => updateField('has_oven', v)} />
            <Label className="text-sm font-semibold">Has Oven</Label>
          </div>
          <div className="flex items-center gap-3 p-3 bg-muted rounded-xl">
            <Switch checked={form.has_glass_screens || false} onCheckedChange={(v) => updateField('has_glass_screens', v)} />
            <Label className="text-sm font-semibold">Glass Shower Screens</Label>
          </div>
        </div>
        {form.has_outdoor_area && (
          <Field label="Outdoor Area Description">
            <Textarea value={form.outdoor_description || ''} onChange={(e) => updateField('outdoor_description', e.target.value)} className="rounded-xl" placeholder="Describe the outdoor area..." />
          </Field>
        )}
        <Field label="Average Nightly Rate ($)">
          <Input type="number" value={form.avg_nightly_rate || ''} onChange={(e) => updateField('avg_nightly_rate', e.target.value)} className="h-12 rounded-xl" placeholder="For urgency context" />
        </Field>
        <Field label="Platform">
          <Select value={form.platform || ''} onValueChange={(v) => updateField('platform', v)}>
            <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Select platform" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="airbnb">Airbnb</SelectItem>
              <SelectItem value="vrbo">VRBO</SelectItem>
              <SelectItem value="booking_com">Booking.com</SelectItem>
              <SelectItem value="multiple">Multiple</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </TabsContent>

      {/* TAB 2 — Linen Configuration */}
      <TabsContent value="linen" className="space-y-4 mt-4">
        <Field label="Do we supply linen?">
          <Select value={form.linen_supply || 'no'} onValueChange={(v) => updateField('linen_supply', v)}>
            <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes — we supply</SelectItem>
              <SelectItem value="no">No</SelectItem>
              <SelectItem value="client_supplies">Client supplies</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {form.linen_supply === 'yes' && (
          <>
            <p className="text-sm font-bold text-primary">Bed Configuration</p>
            <div className="grid grid-cols-2 gap-3">
              {['king', 'queen', 'double', 'single'].map((bedType) => (
                <div key={bedType} className="space-y-1">
                  <Label className="text-xs font-semibold capitalize">{bedType} Beds</Label>
                  <div className="flex gap-2">
                    <Input type="number" min={0} value={linenConfig[`${bedType}_beds`] || 0} onChange={(e) => updateLinen(`${bedType}_beds`, parseInt(e.target.value) || 0)} className="h-10 rounded-lg flex-1" placeholder="Qty" />
                    <Input type="number" min={1} value={linenConfig[`${bedType}_sets`] || 1} onChange={(e) => updateLinen(`${bedType}_sets`, parseInt(e.target.value) || 1)} className="h-10 rounded-lg w-20" placeholder="Sets" />
                  </div>
                </div>
              ))}
            </div>

            <Field label="Linen Changeover">
              <Select value={form.linen_changeover || 'every_clean'} onValueChange={(v) => updateField('linen_changeover', v)}>
                <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="every_clean">Every clean</SelectItem>
                  <SelectItem value="every_2nd">Every 2nd clean</SelectItem>
                  <SelectItem value="as_directed">As directed</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="Linen Storage Location">
              <Input value={form.linen_storage || ''} onChange={(e) => updateField('linen_storage', e.target.value)} className="h-12 rounded-xl" placeholder="Where linen is stored at property" />
            </Field>

            <Field label="Spare Linen">
              <Select value={form.spare_linen || 'we_bring'} onValueChange={(v) => updateField('spare_linen', v)}>
                <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="at_property">At property</SelectItem>
                  <SelectItem value="we_bring">We bring each time</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </>
        )}
      </TabsContent>

      {/* TAB 3 — Consumables */}
      <TabsContent value="consumables" className="space-y-3 mt-4">
        <p className="text-sm text-muted-foreground">Select what we supply per clean:</p>
        {DEFAULT_CONSUMABLES.map((item) => {
          const checked = isConsumableChecked(item.key);
          const consumable = consumablesConfig.find((c: any) => c.key === item.key);
          return (
            <div key={item.key} className="flex items-center gap-3 p-3 bg-muted rounded-xl">
              <Checkbox checked={checked} onCheckedChange={(v) => toggleConsumable(item.key, !!v)} />
              <span className="text-sm font-semibold flex-1">{item.label}</span>
              {checked && item.hasQty && (
                <Input type="number" min={1} value={consumable?.qty || 1} onChange={(e) => updateConsumableQty(item.key, parseInt(e.target.value) || 1)} className="h-8 w-16 rounded-lg text-sm" />
              )}
            </div>
          );
        })}
      </TabsContent>

      {/* TAB 4 — Cleaning Instructions */}
      <TabsContent value="instructions" className="space-y-4 mt-4">
        <Field label="Clean Standard">
          <Select value={form.clean_standard || 'airbnb_standard'} onValueChange={(v) => updateField('clean_standard', v)}>
            <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="airbnb_standard">Airbnb Standard</SelectItem>
              <SelectItem value="premium">Premium</SelectItem>
              <SelectItem value="basic">Basic</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Pain Points / Extra Attention">
          <Textarea value={form.pain_points || ''} onChange={(e) => updateField('pain_points', e.target.value)} className="rounded-xl min-h-[100px]" placeholder="e.g. Master shower glass always has hard water stains — use CLR." />
        </Field>
        <Field label="Areas to Skip or Be Careful With">
          <Textarea value={form.skip_areas || ''} onChange={(e) => updateField('skip_areas', e.target.value)} className="rounded-xl" placeholder="e.g. Don't move the furniture in the study" />
        </Field>
        <Field label="Fragrance Preference">
          <Input value={form.fragrance_preference || ''} onChange={(e) => updateField('fragrance_preference', e.target.value)} className="h-12 rounded-xl" />
        </Field>
        <Field label="Pet Situation">
          <Select value={form.pet_situation || 'no_pets'} onValueChange={(v) => updateField('pet_situation', v)}>
            <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="no_pets">No pets</SelectItem>
              <SelectItem value="between_guests">Pets between guests</SelectItem>
              <SelectItem value="permanent">Permanent pet</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </TabsContent>

      {/* TAB 5 — Access */}
      <TabsContent value="access" className="space-y-4 mt-4">
        <Field label="Alarm Code 🔒">
          <Input type="password" value={form.alarm_code || ''} onChange={(e) => updateField('alarm_code', e.target.value)} className="h-12 rounded-xl" placeholder="Sensitive — masked" />
        </Field>
        <Field label="Parking Instructions">
          <Textarea value={form.parking_instructions || ''} onChange={(e) => updateField('parking_instructions', e.target.value)} className="rounded-xl" />
        </Field>
        <Field label="Bin Location / Bin Day">
          <Input value={form.bin_details || ''} onChange={(e) => updateField('bin_details', e.target.value)} className="h-12 rounded-xl" />
        </Field>
        <Field label="WiFi Password 🔒">
          <Input type="password" value={form.wifi_password || ''} onChange={(e) => updateField('wifi_password', e.target.value)} className="h-12 rounded-xl" />
        </Field>
        <Field label="Neighbour Notes">
          <Textarea value={form.neighbour_notes || ''} onChange={(e) => updateField('neighbour_notes', e.target.value)} className="rounded-xl" placeholder="Any neighbour considerations" />
        </Field>
      </TabsContent>

      {/* TAB 6 — Scheduling */}
      <TabsContent value="schedule" className="space-y-4 mt-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Standard Checkout Time">
            <TimeSelect value={form.checkout_time || '10:00'} onChange={(v) => updateField('checkout_time', v)} className="h-12 rounded-xl" />
          </Field>
          <Field label="Standard Check-in Time">
            <TimeSelect value={form.checkin_time || '14:00'} onChange={(v) => updateField('checkin_time', v)} className="h-12 rounded-xl" />
          </Field>
        </div>
        {form.checkout_time && form.checkin_time && (
          <div className="bg-primary/10 rounded-xl p-3 text-sm font-bold text-primary">
            Turnaround window: {calculateTurnaround(form.checkout_time, form.checkin_time)}
          </div>
        )}
        <Field label="Assigned Cleaners">
          <div className="space-y-1 max-h-40 overflow-y-auto border border-border rounded-xl p-2">
            {cleaners.map((c: any) => (
              <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer p-1 hover:bg-muted rounded-lg">
                <input type="checkbox" checked={assignedCleanerIds.includes(c.id)} onChange={() => toggleAssignedCleaner(c.id)} className="rounded" />
                {c.full_name || c.email}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Backup Cleaner">
          <Select value={form.backup_cleaner_id || '__none__'} onValueChange={(v) => updateField('backup_cleaner_id', v === '__none__' ? '' : v)}>
            <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Select backup" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {cleaners.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.full_name || c.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Minimum Notice for Booking">
          <Select value={form.min_notice || '24h'} onValueChange={(v) => updateField('min_notice', v)}>
            <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="same_day">Same day</SelectItem>
              <SelectItem value="24h">24 hours</SelectItem>
              <SelectItem value="48h">48 hours</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </TabsContent>

      {/* TAB 7 — Pricing */}
      <TabsContent value="pricing" className="space-y-4 mt-4">
        <div className="bg-muted rounded-xl p-4 space-y-2 text-sm">
          <p className="font-bold text-primary">Auto-calculated Pricing</p>
          <p className="text-muted-foreground">Based on labour + linen pack + consumables / (1 - GP%)</p>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div><span className="text-muted-foreground">Turnover:</span> <span className="font-bold">${form.price_turnover ? Number(form.price_turnover).toFixed(2) : '—'}</span></div>
            <div><span className="text-muted-foreground">Deep Clean:</span> <span className="font-bold">${form.price_deep_clean ? Number(form.price_deep_clean).toFixed(2) : '—'}</span></div>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 bg-muted rounded-xl">
          <Switch checked={form.override_price || false} onCheckedChange={(v) => updateField('override_price', v)} />
          <Label className="text-sm font-semibold">Override with fixed price</Label>
        </div>

        <Field label="Pricing Agreement Notes">
          <Textarea value={form.pricing_agreement_notes || ''} onChange={(e) => updateField('pricing_agreement_notes', e.target.value)} className="rounded-xl" placeholder="Notes on pricing agreement with client" />
        </Field>
      </TabsContent>
    </Tabs>
  );
}

function calculateTurnaround(checkout: string, checkin: string): string {
  const [coh, com] = checkout.split(':').map(Number);
  const [cih, cim] = checkin.split(':').map(Number);
  const diff = (cih * 60 + cim) - (coh * 60 + com);
  if (diff <= 0) return 'Invalid';
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours} hours`;
}
