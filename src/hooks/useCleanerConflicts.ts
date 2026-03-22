import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface ConflictJob {
  id: string;
  property_name: string;
  scheduled_time: string | null;
}

interface LeaveEntry {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  reason: string;
}

export function useCleanerConflicts(cleanerId: string | undefined, date: Date | undefined) {
  const dateStr = date ? format(date, 'yyyy-MM-dd') : '';

  // Check existing jobs for this cleaner on this date
  const { data: conflicts = [] } = useQuery({
    queryKey: ['cleaner-conflicts', cleanerId, dateStr],
    queryFn: async () => {
      if (!cleanerId || !dateStr) return [];
      const { data } = await supabase
        .from('jobs')
        .select('id, scheduled_time, properties(property_name)')
        .eq('scheduled_date', dateStr)
        .or(`cleaner_1_id.eq.${cleanerId},cleaner_2_id.eq.${cleanerId}`)
        .in('status', ['scheduled', 'in_progress']);
      return (data || []).map((j: any) => ({
        id: j.id,
        property_name: j.properties?.property_name || 'Unknown',
        scheduled_time: j.scheduled_time?.slice(0, 5) || null,
      })) as ConflictJob[];
    },
    enabled: !!cleanerId && !!dateStr,
  });

  // Check if cleaner is on leave on this date
  const { data: leaveOnDate = [] } = useQuery({
    queryKey: ['cleaner-leave-check', cleanerId, dateStr],
    queryFn: async () => {
      if (!cleanerId || !dateStr) return [];
      const { data } = await supabase
        .from('staff_leave')
        .select('*')
        .eq('user_id', cleanerId)
        .lte('start_date', dateStr)
        .gte('end_date', dateStr);
      return (data || []) as LeaveEntry[];
    },
    enabled: !!cleanerId && !!dateStr,
  });

  return {
    conflicts,
    hasConflict: conflicts.length > 0,
    leaveOnDate,
    isOnLeave: leaveOnDate.length > 0,
  };
}

// For the AddJob form — check all cleaners' leave for a given date
export function useAllCleanerLeave(date: Date | undefined) {
  const dateStr = date ? format(date, 'yyyy-MM-dd') : '';

  const { data: leaveMap = {} } = useQuery({
    queryKey: ['all-cleaner-leave', dateStr],
    queryFn: async () => {
      if (!dateStr) return {};
      const { data } = await supabase
        .from('staff_leave')
        .select('user_id')
        .lte('start_date', dateStr)
        .gte('end_date', dateStr);
      const map: Record<string, boolean> = {};
      (data || []).forEach((l: any) => { map[l.user_id] = true; });
      return map;
    },
    enabled: !!dateStr,
  });

  // Also check conflicts for all cleaners on this date
  const { data: conflictMap = {} } = useQuery({
    queryKey: ['all-cleaner-conflicts', dateStr],
    queryFn: async () => {
      if (!dateStr) return {};
      const { data } = await supabase
        .from('jobs')
        .select('cleaner_1_id, cleaner_2_id, scheduled_time, properties(property_name)')
        .eq('scheduled_date', dateStr)
        .in('status', ['scheduled', 'in_progress']);
      const map: Record<string, { property_name: string; time: string | null }[]> = {};
      (data || []).forEach((j: any) => {
        const entry = { property_name: j.properties?.property_name || 'Unknown', time: j.scheduled_time?.slice(0, 5) || null };
        if (j.cleaner_1_id) {
          if (!map[j.cleaner_1_id]) map[j.cleaner_1_id] = [];
          map[j.cleaner_1_id].push(entry);
        }
        if (j.cleaner_2_id) {
          if (!map[j.cleaner_2_id]) map[j.cleaner_2_id] = [];
          map[j.cleaner_2_id].push(entry);
        }
      });
      return map;
    },
    enabled: !!dateStr,
  });

  return { leaveMap, conflictMap };
}

// Dashboard: jobs in next 7 days where assigned cleaner is on leave
export function useLeaveConflictAlerts() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const weekAhead = format(new Date(Date.now() + 7 * 86400000), 'yyyy-MM-dd');

  return useQuery({
    queryKey: ['leave-conflict-alerts', today],
    queryFn: async () => {
      // Get upcoming jobs
      const { data: jobs } = await supabase
        .from('jobs')
        .select('id, scheduled_date, cleaner_1_id, cleaner_2_id, properties(property_name)')
        .gte('scheduled_date', today)
        .lte('scheduled_date', weekAhead)
        .in('status', ['scheduled']);

      if (!jobs?.length) return [];

      // Get all leave in this period
      const { data: leaves } = await supabase
        .from('staff_leave')
        .select('user_id, start_date, end_date')
        .lte('start_date', weekAhead)
        .gte('end_date', today);

      if (!leaves?.length) return [];

      // Get cleaner names
      const cleanerIds = [...new Set(leaves.map(l => l.user_id))];
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', cleanerIds);
      const nameMap: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { nameMap[p.id] = p.full_name || 'Unknown'; });

      const alerts: { jobId: string; cleanerName: string; propertyName: string; date: string }[] = [];
      jobs.forEach((j: any) => {
        leaves!.forEach((l: any) => {
          if (j.scheduled_date >= l.start_date && j.scheduled_date <= l.end_date) {
            if (j.cleaner_1_id === l.user_id || j.cleaner_2_id === l.user_id) {
              alerts.push({
                jobId: j.id,
                cleanerName: nameMap[l.user_id] || 'Unknown',
                propertyName: j.properties?.property_name || 'Unknown',
                date: j.scheduled_date,
              });
            }
          }
        });
      });
      return alerts;
    },
  });
}
