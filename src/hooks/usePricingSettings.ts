import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type PricingSetting = {
  id: string;
  key: string;
  value: number;
  label: string | null;
  category: string | null;
};

export function usePricingSettings() {
  return useQuery({
    queryKey: ['pricing_settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pricing_settings')
        .select('*')
        .order('category');
      if (error) throw error;
      const map: Record<string, number> = {};
      (data as PricingSetting[]).forEach((r) => (map[r.key] = Number(r.value)));
      return { rows: data as PricingSetting[], map };
    },
  });
}

export function useUpdatePricingSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, value }: { id: string; value: number }) => {
      const { error } = await supabase
        .from('pricing_settings')
        .update({ value, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pricing_settings'] }),
  });
}
