import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, LogOut, CheckCircle2, Clock, Package, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO, isPast } from 'date-fns';

const BG = '#173A27';
const CARD = '#1F4A32';
const YELLOW = '#FEDB00';
const MUTED = 'rgba(255,255,255,0.55)';
const BORDER = 'rgba(255,255,255,0.12)';
const GREEN = '#4ADE80';

interface Delivery {
  id: string;
  status: 'pending' | 'delivered';
  deliver_by: string | null;
  delivered_at: string | null;
  linen_requirements: string | null;
  notes: string | null;
  jobs: {
    id: string;
    scheduled_date: string;
    scheduled_time: string | null;
    properties: {
      id: string;
      address: string;
    } | null;
  } | null;
}

function formatTime(ts: string | null): string {
  if (!ts) return 'TBC';
  try {
    return format(parseISO(ts), 'EEE d MMM, h:mm a');
  } catch {
    return ts;
  }
}

function formatDate(date: string | null): string {
  if (!date) return '—';
  try {
    return format(parseISO(date), 'EEE d MMM yyyy');
  } catch {
    return date;
  }
}

function DeliveryCard({
  delivery,
  onToggle,
  toggling,
}: {
  delivery: Delivery;
  onToggle: (id: string, newStatus: 'pending' | 'delivered') => void;
  toggling: boolean;
}) {
  const isDelivered = delivery.status === 'delivered';
  const deliverBy = delivery.deliver_by ? parseISO(delivery.deliver_by) : null;
  const isUrgent = deliverBy && !isDelivered && isPast(deliverBy);
  const job = delivery.jobs;
  const property = job?.properties;

  return (
    <div
      className="rounded-2xl p-5 space-y-4 transition-all"
      style={{
        background: CARD,
        border: `1px solid ${isDelivered ? 'rgba(74,222,128,0.3)' : isUrgent ? 'rgba(239,68,68,0.4)' : BORDER}`,
        opacity: isDelivered ? 0.75 : 1,
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white text-base leading-tight truncate">
            {property?.address || 'Unknown property'}
          </p>
          <p className="text-sm mt-1" style={{ color: MUTED }}>
            Clean: {formatDate(job?.scheduled_date || null)}
            {job?.scheduled_time ? ` at ${job.scheduled_time.slice(0, 5)}` : ''}
          </p>
        </div>

        {/* Status chip */}
        <div
          className="shrink-0 rounded-full px-3 py-1 text-xs font-bold"
          style={{
            background: isDelivered
              ? 'rgba(74,222,128,0.15)'
              : isUrgent
              ? 'rgba(239,68,68,0.15)'
              : 'rgba(254,219,0,0.15)',
            color: isDelivered ? GREEN : isUrgent ? '#F87171' : YELLOW,
          }}
        >
          {isDelivered ? 'Delivered' : isUrgent ? 'Overdue' : 'Pending'}
        </div>
      </div>

      {/* Deliver by */}
      <div
        className="rounded-xl px-4 py-3 flex items-center gap-3"
        style={{
          background: 'rgba(0,0,0,0.2)',
          border: `1px solid ${isUrgent && !isDelivered ? 'rgba(239,68,68,0.3)' : BORDER}`,
        }}
      >
        <Clock
          className="h-4 w-4 shrink-0"
          style={{ color: isUrgent && !isDelivered ? '#F87171' : YELLOW }}
        />
        <div>
          <p className="text-xs font-semibold" style={{ color: MUTED }}>
            Deliver linen by
          </p>
          <p
            className="text-sm font-bold"
            style={{ color: isUrgent && !isDelivered ? '#F87171' : 'white' }}
          >
            {formatTime(delivery.deliver_by)}
          </p>
        </div>
      </div>

      {/* Linen requirements */}
      {delivery.linen_requirements && (
        <div
          className="rounded-xl px-4 py-3 space-y-1"
          style={{ background: 'rgba(0,0,0,0.2)', border: `1px solid ${BORDER}` }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Package className="h-4 w-4" style={{ color: GREEN }} />
            <p className="text-xs font-bold" style={{ color: GREEN }}>
              Linen Requirements
            </p>
          </div>
          <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: MUTED }}>
            {delivery.linen_requirements}
          </p>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => onToggle(delivery.id, isDelivered ? 'pending' : 'delivered')}
        disabled={toggling}
        className="w-full h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60"
        style={{
          background: isDelivered ? 'rgba(255,255,255,0.08)' : GREEN,
          color: isDelivered ? MUTED : '#000',
          border: isDelivered ? `1px solid ${BORDER}` : 'none',
        }}
      >
        {toggling ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isDelivered ? (
          <>
            <RefreshCw className="h-4 w-4" />
            Mark as pending
          </>
        ) : (
          <>
            <CheckCircle2 className="h-4 w-4" />
            Mark as delivered
          </>
        )}
      </button>
    </div>
  );
}

export default function LinenPortalDashboardPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [companyName, setCompanyName] = useState('Linen Company');
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Auth check
  useEffect(() => {
    const stored = localStorage.getItem('linen_portal_phone');
    if (!stored) {
      navigate('/linen-portal', { replace: true });
      return;
    }
    setPhone(stored);
  }, [navigate]);

  const loadDeliveries = useCallback(async (ph: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('linen-portal-data', {
        body: { action: 'get_deliveries', phone: ph },
      });
      if (error) throw error;
      if ((data as any)?.error) {
        if ((data as any).error === 'Unauthorised') {
          localStorage.removeItem('linen_portal_phone');
          navigate('/linen-portal', { replace: true });
          return;
        }
        throw new Error((data as any).error);
      }
      setDeliveries((data as any).deliveries || []);
      setCompanyName((data as any).company_name || 'Linen Company');
    } catch (e: any) {
      toast.error(e.message || 'Failed to load deliveries');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (phone) loadDeliveries(phone);
  }, [phone, loadDeliveries]);

  const handleToggle = async (deliveryId: string, newStatus: 'pending' | 'delivered') => {
    if (!phone) return;
    setTogglingId(deliveryId);
    try {
      const { data, error } = await supabase.functions.invoke('linen-portal-data', {
        body: { action: 'update_delivery', phone, delivery_id: deliveryId, status: newStatus },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      // Optimistic update
      setDeliveries(prev =>
        prev.map(d =>
          d.id === deliveryId
            ? {
                ...d,
                status: newStatus,
                delivered_at: newStatus === 'delivered' ? new Date().toISOString() : null,
              }
            : d,
        ),
      );
      toast.success(newStatus === 'delivered' ? 'Marked as delivered!' : 'Marked as pending');
    } catch (e: any) {
      toast.error(e.message || 'Failed to update');
    } finally {
      setTogglingId(null);
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('linen_portal_phone');
    navigate('/linen-portal', { replace: true });
  };

  const pending = deliveries.filter(d => d.status === 'pending');
  const delivered = deliveries.filter(d => d.status === 'delivered');

  return (
    <div className="min-h-screen pb-12" style={{ background: BG }}>
      {/* Header */}
      <div
        className="sticky top-0 z-10 px-4 py-4 flex items-center justify-between"
        style={{ background: BG, borderBottom: `1px solid ${BORDER}` }}
      >
        <div>
          <h1
            className="text-xl font-extrabold tracking-tight"
            style={{ color: '#fff', fontFamily: 'Nunito, sans-serif' }}
          >
            Brightly<span style={{ color: YELLOW }}>.</span>
          </h1>
          <p className="text-xs mt-0.5" style={{ color: MUTED }}>
            {companyName}
          </p>
        </div>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1.5 text-sm rounded-xl px-3 py-2 transition-opacity hover:opacity-70"
          style={{ color: MUTED, border: `1px solid ${BORDER}` }}
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: GREEN }} />
          </div>
        ) : deliveries.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ background: CARD, border: `1px solid ${BORDER}` }}
          >
            <CheckCircle2 className="h-10 w-10 mx-auto mb-3" style={{ color: GREEN }} />
            <p className="font-bold text-white">All clear!</p>
            <p className="text-sm mt-1" style={{ color: MUTED }}>
              No upcoming linen deliveries right now.
            </p>
          </div>
        ) : (
          <>
            {/* Stats strip */}
            <div className="grid grid-cols-2 gap-3">
              <div
                className="rounded-2xl p-4 text-center"
                style={{ background: CARD, border: `1px solid ${BORDER}` }}
              >
                <p className="text-2xl font-extrabold" style={{ color: YELLOW }}>
                  {pending.length}
                </p>
                <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                  Pending
                </p>
              </div>
              <div
                className="rounded-2xl p-4 text-center"
                style={{ background: CARD, border: `1px solid ${BORDER}` }}
              >
                <p className="text-2xl font-extrabold" style={{ color: GREEN }}>
                  {delivered.length}
                </p>
                <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                  Delivered
                </p>
              </div>
            </div>

            {/* Pending deliveries */}
            {pending.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: MUTED }}>
                  Upcoming deliveries
                </h2>
                {pending.map(d => (
                  <DeliveryCard
                    key={d.id}
                    delivery={d}
                    onToggle={handleToggle}
                    toggling={togglingId === d.id}
                  />
                ))}
              </div>
            )}

            {/* Delivered */}
            {delivered.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: MUTED }}>
                  Delivered
                </h2>
                {delivered.map(d => (
                  <DeliveryCard
                    key={d.id}
                    delivery={d}
                    onToggle={handleToggle}
                    toggling={togglingId === d.id}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
