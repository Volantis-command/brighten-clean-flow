import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useCleanersList() {
  return useQuery({
    queryKey: ['cleaners-list'],
    queryFn: async () => {
      // Get user IDs with cleaner or head_cleaner role
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['cleaner', 'head_cleaner']);

      if (roleError) throw roleError;
      if (!roleData || roleData.length === 0) return [];

      const userIds = roleData.map((r) => r.user_id);
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, email, director_approved')
        .in('id', userIds);

      if (profileError) throw profileError;
      // Only return cleaners approved by director
      return (profiles || []).filter((p: any) => p.director_approved !== false);
    },
  });
}
