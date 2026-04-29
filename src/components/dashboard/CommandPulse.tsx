import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { useAlertsData } from '@/hooks/useAlertsData';
import { ArrowRight } from 'lucide-react';

/**
 * "The Pulse" — a grid of action tiles for the admin dashboard.
 * Each tile shows a live count of something requiring attention and
 * navigates to the relevant page on tap. Tiles with count = 0 render
 * as a muted "all clear" chip rather than disappearing entirely, so
 * Brendan always sees the same layout.
 *
 * Designed around the CEO principle: "what needs my attention right now?"
 * in order of urgency. Revenue impact first, operational issues second.
 */
export function CommandPulse() {
  const navigate = useNavigate();
  const today = format(new Date(), 'yyyy-MM-dd');
  const { groups } = useAlertsData();

  // 1. Uncontacted leads — new enquiries that haven't been acted on
  const { data: uncontactedCount = 0 } = useQuery({
    queryKey: ['pulse-uncontacted'],
    queryFn: async () => {
      const { count } = await supabase
        .from('quote_requests')
        .select('id', { count: 'exact', head: true })
        .in('status', ['pending_form', 'form_submitted', 'awaiting_quote', 'new']);
      return count || 0;
    },
    refetchInterval: 60_000,
  });

  // 2. Completed cleans with no invoice raised
  const { data: uninvoicedCount = 0 } = useQuery({
    queryKey: ['pulse-uninvoiced'],
    queryFn: async () => {
      const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed')
        .or('invoice_status.is.null,invoice_status.eq.not_raised')
        .lt('clock_off_at', cutoff);
      return count || 0;
    },
    refetchInterval: 60_000,
  });

  // 3. Outstanding invoices — sent but not paid
  const { data: outstanding = { total: 0, count: 0 } } = useQuery({
    queryKey: ['pulse-outstanding'],
    queryFn: async () => {
      const { data } = await supabase
        .from('jobs')
        .select('invoice_amount, price_inc_gst')
        .in('invoice_status', ['sent', 'authorised']);
      const total = (data || []).reduce(
        (s: number, r: any) => s + Number(r.invoice_amount || r.price_inc_gst || 0), 0
      );
      return { total, count: (data || []).length };
    },
    refetchInterval: 60_000,
  });

  // 4. Today's cleans
  const { data: todayCount = 0 } = useQuery({
    queryKey: ['pulse-today', today],
    queryFn: async () => {
      const { count } = await supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('scheduled_date', today)
        .not('status', 'in', '("cancelled","declined")');
      return count || 0;
    },
    refetchInterval: 60_000,
  });

  // 5. iCal pending approvals
  const { data: icalCount = 0 } = useQuery({
    queryKey: ['pulse-ical'],
    queryFn: async () => {
      const { count } = await supabase
        .from('booking_suggestions' as any)
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      return count || 0;
    },
    refetchInterval: 60_000,
  });

  // Total alerts from useAlertsData
  const alertCount = groups.reduce((sum, g) => sum + g.items.length, 0);

  const tiles = [
    {
      key: 'leads',
      count: uncontactedCount,
      label: 'Uncontacted Leads',
      sublabel: 'New enquiries waiting',
      emoji: '📥',
      urgency: uncontactedCount > 0 ? 'red' : 'clear',
      path: '/actions',
    },
    {
      key: 'uninvoiced',
      count: uninvoicedCount,
      label: 'Need Invoice',
      sublabel: 'Completed, not billed',
      emoji: '🧾',
      urgency: uninvoicedCount > 0 ? 'orange' : 'clear',
      path: '/invoices/pending',
    },
    {
      key: 'outstanding',
      count: outstanding.count,
      label: 'Outstanding',
      sublabel: outstanding.total > 0 ? `$${outstanding.total.toFixed(0)} awaiting payment` : 'All paid up',
      emoji: '💰',
      urgency: outstanding.count > 0 ? 'blue' : 'clear',
      path: '/invoices/pending',
      displayValue: outstanding.total > 0 ? `$${outstanding.total.toFixed(0)}` : '—',
    },
    {
      key: 'today',
      count: todayCount,
      label: "Today's Cleans",
      sublabel: todayCount === 0 ? 'No cleans today' : todayCount === 1 ? '1 clean on the books' : `${todayCount} cleans on the books`,
      emoji: '🏠',
      urgency: todayCount > 0 ? 'green' : 'clear',
      path: '/schedule',
    },
    {
      key: 'alerts',
      count: alertCount,
      label: 'Alerts',
      sublabel: alertCount === 0 ? 'Everything looks good' : 'Items need attention',
      emoji: '⚠️',
      urgency: alertCount > 0 ? 'yellow' : 'clear',
      path: '/actions',
    },
    {
      key: 'ical',
      count: icalCount,
      label: 'iCal Approvals',
      sublabel: icalCount === 0 ? 'No pending bookings' : 'Airbnb cleans awaiting',
      emoji: '📅',
      urgency: icalCount > 0 ? 'purple' : 'clear',
      path: '/bookings/suggestions',
    },
  ];

  const urgencyStyles: Record<string, { border: string; bg: string; text: string; badge: string }> = {
    red:    { border: 'border-red-500/40',    bg: 'bg-red-500/8',    text: 'text-red-500',    badge: 'bg-red-500 text-white' },
    orange: { border: 'border-orange-500/40', bg: 'bg-orange-500/8', text: 'text-orange-500', badge: 'bg-orange-500 text-white' },
    blue:   { border: 'border-blue-500/40',   bg: 'bg-blue-500/8',   text: 'text-blue-600',   badge: 'bg-blue-500 text-white' },
    green:  { border: 'border-primary/40',    bg: 'bg-primary/8',    text: 'text-primary',    badge: 'bg-primary text-primary-foreground' },
    yellow: { border: 'border-yellow-500/40', bg: 'bg-yellow-500/8', text: 'text-yellow-600', badge: 'bg-yellow-500 text-white' },
    purple: { border: 'border-purple-500/40', bg: 'bg-purple-500/8', text: 'text-purple-600', badge: 'bg-purple-500 text-white' },
    clear:  { border: 'border-border',        bg: 'bg-muted/30',     text: 'text-muted-foreground', badge: 'bg-muted text-muted-foreground' },
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-0.5">
        Action Required
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {tiles.map((tile) => {
          const s = urgencyStyles[tile.urgency];
          const isActive = tile.urgency !== 'clear';
          return (
            <button
              key={tile.key}
              onClick={() => navigate(tile.path)}
              className={`relative rounded-2xl border p-4 text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${s.border} ${s.bg} ${isActive ? 'shadow-sm' : ''}`}
            >
              {/* Pulsing dot for urgent items */}
              {isActive && (
                <span className="absolute top-3 right-3 flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${s.badge}`} />
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${s.badge}`} />
                </span>
              )}

              <div className="text-xl mb-1">{tile.emoji}</div>
              <div className={`text-2xl font-extrabold leading-none mb-1 ${isActive ? s.text : 'text-muted-foreground'}`}>
                {tile.displayValue ?? (tile.count === 0 ? '—' : tile.count)}
              </div>
              <div className="text-xs font-bold text-foreground leading-tight">{tile.label}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{tile.sublabel}</div>

              {isActive && (
                <div className={`flex items-center gap-0.5 mt-2 text-[10px] font-semibold ${s.text}`}>
                  View <ArrowRight className="w-2.5 h-2.5" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
