-- Add missing pricing_settings rows
INSERT INTO pricing_settings (key, value, label, category) VALUES
  ('photo_reporting_fee', 20.00, 'Photo Reporting Fee', 'labour'),
  ('consumable_amenities_kit', 6.50, 'Amenities Kit', 'other'),
  ('consumable_wash_kit', 7.50, 'Wash Kit', 'other'),
  ('consumable_tea_coffee_kit', 6.50, 'Tea/Coffee Kit', 'other')
ON CONFLICT DO NOTHING;

-- Remove old consumables flat fee
DELETE FROM pricing_settings WHERE key = 'consumables_flat_fee';
