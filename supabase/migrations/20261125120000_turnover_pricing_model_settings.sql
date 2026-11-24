-- Editable settings for the internal Pricing page (src/pages/PricingPage.tsx).
-- Defaults are reverse engineered from the Kingscliff and Coastal portfolios,
-- 25 Nov 2026. Additive only: existing keys are never overwritten.
insert into public.pricing_settings (key, value, label, category) values
  ('qb_rate_inc',             82.50, 'Turnover hourly rate (inc GST)',          'turnover_model'),
  ('qb_base_hours',            0.50, 'Base hours every clean',                  'turnover_model'),
  ('qb_hours_per_bedroom',     0.50, 'Hours per bedroom',                       'turnover_model'),
  ('qb_hours_per_bathroom',    0.25, 'Hours per bathroom',                      'turnover_model'),
  ('qb_hours_outdoor',         0.75, 'Hours for balcony, terrace or yard',      'turnover_model'),
  ('qb_hours_house',           0.25, 'Hours added for a house',                 'turnover_model'),
  ('qb_linen_markup_pct',      5.00, 'Linen markup on item cost (%)',           'turnover_model'),
  ('qb_hours_pool',            0.00, 'Hours for pool or spa',                   'turnover_model'),
  ('qb_hours_extra_living',    0.25, 'Hours per extra living area',             'turnover_model'),
  ('qb_hours_extra_level',     0.25, 'Hours per extra level',                   'turnover_model'),
  ('qb_hours_per_bunk',        0.25, 'Hours per bunk bed',                      'turnover_model'),
  ('qb_hours_per_sofa',        0.25, 'Hours per sofa bed',                      'turnover_model'),
  ('qb_hours_extra_toilet',    0.10, 'Hours per separate toilet',               'turnover_model'),
  ('qb_hours_granny_flat',     1.00, 'Hours for granny flat or studio',         'turnover_model'),
  ('qb_hours_rounding',        0.25, 'Round hours to nearest',                  'turnover_model'),
  ('qb_cleaner_pay_rate',     37.00, 'Cleaner pay per hour (for margin)',       'turnover_model')
on conflict (key) do nothing;
