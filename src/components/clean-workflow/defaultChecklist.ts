import { supabase } from '@/integrations/supabase/client';

export const DEFAULT_CHECKLIST = [
  { room: 'Kitchen', tasks: ['Wipe benchtops', 'Clean sink', 'Wipe outside of appliances', 'Mop floor'] },
  { room: 'Bathrooms', tasks: ['Clean toilet', 'Scrub shower/bath', 'Wipe vanity and sink', 'Mop floor'] },
  { room: 'Bedrooms', tasks: ['Make beds / change linen', 'Dust surfaces', 'Vacuum floor'] },
  { room: 'Living Areas', tasks: ['Dust surfaces', 'Vacuum / mop floors', 'Wipe down furniture'] },
  { room: 'General', tasks: ['Empty bins', 'Wipe light switches and door handles', 'Final walkthrough'] },
];

export async function seedDefaultChecklist(propertyId: string) {
  const { count } = await supabase
    .from('property_sop_items')
    .select('id', { count: 'exact', head: true })
    .eq('property_id', propertyId)
    .eq('active', true);

  if ((count ?? 0) > 0) return;

  const toInsert = DEFAULT_CHECKLIST.flatMap((g, gi) =>
    g.tasks.map((task, ti) => ({
      property_id: propertyId,
      room: g.room,
      task,
      sort_order: gi * 100 + ti,
      active: true,
    }))
  );

  await supabase.from('property_sop_items').insert(toInsert);
}
