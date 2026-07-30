-- ============================================================================
-- SELF-LEARNING CLEAN CHECKLIST — per-property overrides
--
-- The completion checklist is resolved in three layers:
--   1. Base template for the clean type (Airbnb turnover / Standard / Deep …)
--   2. Property data already on `properties` (bedrooms, bathrooms, has_oven …)
--   3. THIS TABLE — what cleaners taught us about the specific property
--
-- A cleaner who hits "not in this property" on e.g. Microwave writes an
-- 'exclude' row here, so that prompt never appears for that property again.
-- They can also add an item that only exists in that property ('include').
--
-- Every row records WHO / WHEN / WHICH JOB so a removal is never silent —
-- admins are notified and can restore it by deleting the row. Core items
-- (room wide shots, bed, toilet, shower, sink) are protected in code and
-- cannot be excluded, so the checklist can't be gutted.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.property_checklist_overrides (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,

  -- Which area + item this override applies to. area_id matches the resolver
  -- (e.g. 'kitchen', 'bathroom_2'); item_key is the field key (e.g. 'microwave').
  area_id     text NOT NULL,
  item_key    text NOT NULL,

  -- 'photo' = a photo prompt, 'check' = a tick/no question (e.g. bin liners)
  kind        text NOT NULL DEFAULT 'photo' CHECK (kind IN ('photo', 'check')),

  -- 'exclude' = not present in this property, stop asking.
  -- 'include' = extra item that exists only here, always ask.
  action      text NOT NULL CHECK (action IN ('exclude', 'include')),

  -- Label is required for 'include' (a custom item needs its own prompt text).
  label       text,
  reason      text,

  -- Audit: never allow a silent removal.
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  job_id      uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- One override per property+area+item; re-flagging just updates it.
  CONSTRAINT property_checklist_overrides_unique UNIQUE (property_id, area_id, item_key)
);

CREATE INDEX IF NOT EXISTS property_checklist_overrides_property_idx
  ON public.property_checklist_overrides (property_id);

ALTER TABLE public.property_checklist_overrides ENABLE ROW LEVEL SECURITY;

-- Cleaners must be able to READ (to build their form) and INSERT/UPDATE
-- (to flag an item while on site). Only admins can delete = restore an item.
CREATE POLICY "Staff can read checklist overrides"
  ON public.property_checklist_overrides
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Staff can add checklist overrides"
  ON public.property_checklist_overrides
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Staff can update checklist overrides"
  ON public.property_checklist_overrides
  FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Admins can restore checklist items"
  ON public.property_checklist_overrides
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

COMMENT ON TABLE public.property_checklist_overrides IS
  'Per-property completion-checklist tuning learned from cleaners on site. exclude = item not present here; include = extra item unique to this property. Audited so removals are never silent.';
