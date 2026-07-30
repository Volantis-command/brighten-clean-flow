// ============================================================================
// SELF-LEARNING CLEAN CHECKLIST — resolver
//
// One ordered, room-by-room checklist, resolved from three layers:
//   1. Base template for the clean type (below)
//   2. Property data already stored on `properties` (bedrooms, has_oven, …)
//   3. Per-property overrides cleaners set on site (property_checklist_overrides)
//
// Two kinds of item:
//   photo — visual proof. The camera stays open and shows `label` as the prompt.
//   check — binary "done / not done" tick. Used where a photo adds nothing
//           (bin liners, lights off, doors locked).
//
// `core: true` items exist in every property and CANNOT be removed by a
// cleaner, so the checklist can never be gutted. Everything else is removable
// ("not in this property") and is remembered per property from then on.
// ============================================================================

export type ChecklistKind = 'photo' | 'check';

export interface ChecklistItem {
  key: string;
  label: string;
  kind: ChecklistKind;
  required: boolean;
  /** Core items can't be excluded by a cleaner — every property has them. */
  core?: boolean;
}

export interface ChecklistArea {
  id: string;
  title: string;
  /** Shown on the "go to next room" hand-off screen. */
  blurb?: string;
  items: ChecklistItem[];
}

export interface ChecklistOverride {
  area_id: string;
  item_key: string;
  kind: ChecklistKind;
  action: 'exclude' | 'include';
  label?: string | null;
}

const photo = (key: string, label: string, required = true, core = false): ChecklistItem =>
  ({ key, label, kind: 'photo', required, core });

const check = (key: string, label: string, required = true, core = false): ChecklistItem =>
  ({ key, label, kind: 'check', required, core });

/**
 * Build the ordered checklist for a job.
 *
 * Order follows the way a turnover is actually walked: kitchen → living →
 * bathrooms → bedrooms → laundry → outdoor → final lock-up.
 */
export function buildChecklist(
  property: any,
  cleanType?: string | null,
  overrides: ChecklistOverride[] = [],
): ChecklistArea[] {
  const bedrooms = Math.max(1, Number(property?.bedrooms) || 1);
  const bathrooms = Math.max(1, Number(property?.bathrooms) || 1);
  const type = (cleanType || '').toLowerCase();

  // Standard cleans are quick turnovers — deep-clean extras stay visible so a
  // cleaner can still upload them, but they don't block submission.
  const isStandard = type.includes('standard');
  const deep = !isStandard; // required only on deep/turnover/bond/reno

  const hasOutdoor = !!(property?.has_outdoor_area || Number(property?.balconies) > 0);
  const hasPool = !!property?.has_pool;
  const hasOven = property?.has_oven !== false;
  const hasGlass = !!property?.has_glass_screens;
  const linen = property?.linen_required !== false;

  const areas: ChecklistArea[] = [];

  // ── Kitchen ───────────────────────────────────────────────────────────────
  areas.push({
    id: 'kitchen',
    title: 'Kitchen',
    blurb: 'Benches, appliances, sink and floor.',
    items: [
      photo('wide_shot', 'Kitchen — wide shot of the whole room', true, true),
      photo('benchtops', 'Benchtops — wiped and clear', true, true),
      photo('sink', 'Sink — clean and dry', true, true),
      photo('stovetop', 'Stovetop / cooktop — clean', true, true),
      ...(hasOven ? [photo('oven', 'Oven — door open, interior clean', deep)] : []),
      photo('microwave', 'Microwave — door open, interior clean', deep),
      photo('fridge', 'Fridge — door open, interior clean and empty', deep),
      photo('dishwasher', 'Dishwasher — empty and clean', deep),
      photo('coffee_machine', 'Coffee machine — clean and descaled', deep),
      photo('toaster', 'Toaster — emptied and clean', deep),
      check('bin_liner', 'Bin emptied and a fresh liner in', true, true),
      check('cupboards', 'Cupboards and drawers wiped, no crumbs', false),
      check('consumables', 'Tea, coffee and dishwashing restocked', deep),
      check('floor', 'Floor swept and mopped', true, true),
    ],
  });

  // ── Living / dining ───────────────────────────────────────────────────────
  areas.push({
    id: 'living',
    title: 'Lounge & Dining',
    blurb: 'Soft furnishings, surfaces, glass and floors.',
    items: [
      photo('wide_shot', 'Lounge — wide shot of the whole room', true, true),
      photo('couch', 'Couch and cushions — plumped and arranged', true, true),
      photo('dining_table', 'Dining table — clean and set', deep),
      ...(hasGlass ? [photo('glass', 'Glass doors / windows — streak-free', deep)] : []),
      check('surfaces', 'All surfaces dusted, including shelves and sills', false),
      check('under_cushions', 'Under and behind cushions checked for rubbish', true, true),
      check('remotes', 'Remotes present, TV works, batteries in', false),
      check('floor', 'Floor vacuumed and mopped', true, true),
    ],
  });

  // ── Bathrooms ─────────────────────────────────────────────────────────────
  for (let i = 1; i <= bathrooms; i++) {
    areas.push({
      id: `bathroom_${i}`,
      title: bathrooms > 1 ? `Bathroom ${i}` : 'Bathroom',
      blurb: 'Shower, toilet, vanity, mirror.',
      items: [
        photo('wide_shot', 'Bathroom — wide shot', true, true),
        photo('shower', 'Shower interior — tiles and screen clean', true, true),
        photo('toilet', 'Inside the toilet bowl — clean', true, true),
        photo('vanity', 'Vanity / bench — clean and clear', true, true),
        photo('mirror', 'Mirror — streak-free', true, true),
        ...(linen ? [photo('towels', 'Towels — fresh, folded and placed', deep)] : []),
        check('bin_liner', 'Bin emptied and a fresh liner in', true, true),
        check('drains', 'Hair removed from drains and plugholes', true, true),
        check('toiletries', 'Soap and amenities restocked', deep),
        check('floor', 'Floor cleaned, behind the toilet too', true, true),
      ],
    });
  }

  // ── Bedrooms ──────────────────────────────────────────────────────────────
  for (let i = 1; i <= bedrooms; i++) {
    areas.push({
      id: `bedroom_${i}`,
      title: bedrooms > 1 ? `Bedroom ${i}` : 'Bedroom',
      blurb: 'Bed, linen, surfaces, floor.',
      items: [
        photo('bed_made', 'Bed made — full shot of bed and linen', true, true),
        photo('wide_shot', 'Bedroom — wide shot', true, true),
        ...(linen ? [check('linen_fresh', 'Fresh linen on, no hairs or marks', true, true)] : []),
        check('under_bed', 'Under the bed checked — nothing left behind', true, true),
        check('wardrobe', 'Wardrobe and drawers empty and wiped', false),
        check('surfaces', 'Bedsides and surfaces dusted', false),
        check('floor', 'Floor vacuumed', true, true),
      ],
    });
  }

  // ── Laundry ───────────────────────────────────────────────────────────────
  areas.push({
    id: 'laundry',
    title: 'Laundry',
    blurb: 'Machines and filters.',
    items: [
      photo('washing_machine', 'Washing machine — clean, door left ajar', deep),
      photo('dryer', 'Dryer — clean exterior', deep),
      photo('washing_filter', 'Washing machine filter — removed and clean', deep),
      photo('dryer_filter', 'Dryer lint filter — removed and clean', deep),
      check('empty', 'No laundry left in either machine', true, true),
      check('floor', 'Laundry floor cleaned', false),
    ],
  });

  // ── Outdoor ───────────────────────────────────────────────────────────────
  if (hasOutdoor || hasPool) {
    areas.push({
      id: 'outdoor',
      title: 'Balcony & Outdoor',
      blurb: 'Furniture, floors, BBQ.',
      items: [
        photo('wide_shot', 'Outdoor area — wide shot', true, true),
        photo('furniture', 'Outdoor furniture — wiped and arranged', deep),
        photo('bbq', 'BBQ — plates and drip tray clean', deep),
        ...(hasPool ? [photo('pool_area', 'Pool surrounds — swept and tidy', deep)] : []),
        check('swept', 'Balcony swept, no sand or cobwebs', true, true),
        check('railings', 'Railings and glass wiped down', false),
      ],
    });
  }

  // ── Final walk-through ────────────────────────────────────────────────────
  areas.push({
    id: 'final',
    title: 'Final Check & Lock-up',
    blurb: 'Last look before you leave.',
    items: [
      photo('entry', 'Entry / hallway — wide shot, guest-ready', true, true),
      check('rubbish_out', 'All rubbish removed from the property', true, true),
      check('lights_aircon', 'Lights and aircon / heating turned off', true, true),
      check('windows_locked', 'All windows and doors locked', true, true),
      check('keys', 'Keys returned to the lockbox / safe', true, true),
      check('final_look', 'Walked through one last time — nothing missed', true, true),
    ],
  });

  return applyOverrides(areas, overrides);
}

/** Layer 3 — remove what isn't in this property, add what only lives here. */
function applyOverrides(areas: ChecklistArea[], overrides: ChecklistOverride[]): ChecklistArea[] {
  if (!overrides.length) return areas;

  const excluded = new Set(
    overrides.filter(o => o.action === 'exclude').map(o => `${o.area_id}::${o.item_key}`)
  );

  const withExclusions = areas.map(area => ({
    ...area,
    // Core items are never removable, even if an exclude row somehow exists.
    items: area.items.filter(it => it.core || !excluded.has(`${area.id}::${it.key}`)),
  }));

  // Custom additions unique to this property.
  for (const o of overrides.filter(x => x.action === 'include')) {
    const area = withExclusions.find(a => a.id === o.area_id);
    if (!area || !o.label) continue;
    if (area.items.some(it => it.key === o.item_key)) continue;
    area.items.push({
      key: o.item_key,
      label: o.label,
      kind: o.kind || 'photo',
      required: false, // property-specific extras never block submission
    });
  }

  // Drop any area left with nothing to do (e.g. a studio with no laundry).
  return withExclusions.filter(a => a.items.length > 0);
}

/** Flat progress helpers used by the guided flow. */
export function countItems(areas: ChecklistArea[]) {
  const photos = areas.reduce((n, a) => n + a.items.filter(i => i.kind === 'photo').length, 0);
  const checks = areas.reduce((n, a) => n + a.items.filter(i => i.kind === 'check').length, 0);
  return { photos, checks, total: photos + checks, areas: areas.length };
}
