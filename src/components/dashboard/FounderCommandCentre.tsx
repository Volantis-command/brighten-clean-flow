import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { addDays, format, startOfMonth, subMonths } from 'date-fns';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Gauge,
  Sparkles,
  Target,
  TrendingUp,
  UserRoundPlus,
  UsersRound,
  WalletCards,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { QuickActions } from './QuickActions';
import SendQuoteLinkModal from './SendQuoteLinkModal';

interface FounderCommandCentreProps {
  firstName?: string;
  role: string | null;
  pendingSuggestionCount: number;
}

interface OperatingJob {
  id: string;
  status: string;
  scheduled_date: string;
  scheduled_time: string | null;
  cleaner_1_id: string | null;
  cleaner_2_id: string | null;
  invoice_status: string | null;
  invoice_amount: number | null;
  price_inc_gst: number | null;
  properties: { property_name: string | null; address: string | null } | null;
}

const ACTIVE_STATUSES = ['pending_cleaner', 'awaiting_cleaner_acceptance', 'scheduled', 'confirmed', 'in_progress', 'completed'];

function money(value: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(value);
}

function percentChange(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export function FounderCommandCentre({ firstName, role, pendingSuggestionCount }: FounderCommandCentreProps) {
  const navigate = useNavigate();
  const [sendQuoteOpen, setSendQuoteOpen] = useState(false);
  const today = format(new Date(), 'yyyy-MM-dd');
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
  const thisMonth = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const previousMonth = format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd');

  const { data: operatingJobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ['founder-operating-jobs', today, tomorrow],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('id,status,scheduled_date,scheduled_time,cleaner_1_id,cleaner_2_id,invoice_status,invoice_amount,price_inc_gst,properties(property_name,address)')
        .gte('scheduled_date', today)
        .lte('scheduled_date', tomorrow)
        .in('status', ACTIVE_STATUSES)
        .order('scheduled_date')
        .order('scheduled_time');
      if (error) throw error;
      return (data ?? []) as unknown as OperatingJob[];
    },
    refetchInterval: 60_000,
  });

  const { data: commercial } = useQuery({
    queryKey: ['founder-commercial-scorecard', previousMonth],
    queryFn: async () => {
      const [{ data: jobs, error: jobsError }, { count: leadCount }, { count: quoteCount }] = await Promise.all([
        supabase
          .from('jobs')
          .select('scheduled_date,status,invoice_status,invoice_amount,price_inc_gst')
          .gte('scheduled_date', previousMonth),
        supabase
          .from('quote_requests')
          .select('id', { count: 'exact', head: true })
          .in('status', ['pending_form', 'form_submitted', 'awaiting_quote', 'new']),
        supabase
          .from('quotes')
          .select('id', { count: 'exact', head: true })
          .in('status', ['sent', 'viewed', 'pending']),
      ]);
      if (jobsError) throw jobsError;
      const rows = jobs ?? [];
      const paid = (from: string, to?: string) => rows
        .filter((job) => job.scheduled_date >= from && (!to || job.scheduled_date < to) && job.invoice_status === 'paid')
        .reduce((sum, job) => sum + Number(job.invoice_amount || job.price_inc_gst || 0), 0);
      const currentRevenue = paid(thisMonth);
      const previousRevenue = paid(previousMonth, thisMonth);
      const outstanding = rows
        .filter((job) => ['sent', 'authorised', 'overdue'].includes(job.invoice_status || ''))
        .reduce((sum, job) => sum + Number(job.invoice_amount || job.price_inc_gst || 0), 0);
      const unbilled = rows
        .filter((job) => job.status === 'completed' && (!job.invoice_status || job.invoice_status === 'not_raised'))
        .reduce((sum, job) => sum + Number(job.price_inc_gst || 0), 0);
      return { currentRevenue, previousRevenue, outstanding, unbilled, leadCount: leadCount || 0, quoteCount: quoteCount || 0 };
    },
    refetchInterval: 120_000,
  });

  const { data: quality } = useQuery({
    queryKey: ['founder-quality-scorecard', thisMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('id,status,feedback_score')
        .gte('scheduled_date', thisMonth);
      if (error) throw error;
      const completed = (data ?? []).filter((job) => job.status === 'completed');
      const ratings = completed.map((job) => Number(job.feedback_score)).filter((score) => score > 0);
      return {
        completed: completed.length,
        averageRating: ratings.length ? ratings.reduce((total, score) => total + score, 0) / ratings.length : null,
      };
    },
    refetchInterval: 120_000,
  });

  const todayJobs = operatingJobs.filter((job) => job.scheduled_date === today);
  const tomorrowJobs = operatingJobs.filter((job) => job.scheduled_date === tomorrow);
  const completed = todayJobs.filter((job) => job.status === 'completed').length;
  const underway = todayJobs.filter((job) => job.status === 'in_progress').length;
  const unassigned = operatingJobs.filter((job) => !job.cleaner_1_id && !job.cleaner_2_id && !['completed', 'cancelled'].includes(job.status));
  const awaitingCleaner = operatingJobs.filter((job) => job.status === 'awaiting_cleaner_acceptance');
  const safe = todayJobs.filter((job) => job.status === 'completed' || job.status === 'in_progress' || Boolean(job.cleaner_1_id || job.cleaner_2_id)).length;
  const readiness = todayJobs.length ? Math.round((safe / todayJobs.length) * 100) : 100;
  const atRisk = unassigned.length + pendingSuggestionCount;

  const exceptions = useMemo(() => {
    const items: Array<{ id: string; title: string; detail: string; path: string; tone: 'danger' | 'warning' | 'info'; icon: typeof AlertTriangle }> = [];
    unassigned.slice(0, 4).forEach((job) => items.push({
      id: `unassigned-${job.id}`,
      title: 'Clean needs a cleaner',
      detail: `${job.properties?.property_name || 'Property'} · ${job.scheduled_date === today ? 'today' : 'tomorrow'} ${job.scheduled_time?.slice(0, 5) || ''}`.trim(),
      path: `/jobs/${job.id}`,
      tone: job.scheduled_date === today ? 'danger' : 'warning',
      icon: UserRoundPlus,
    }));
    awaitingCleaner.slice(0, 3).forEach((job) => items.push({
      id: `awaiting-${job.id}`,
      title: 'Cleaner has not accepted',
      detail: `${job.properties?.property_name || 'Property'} · ${job.scheduled_date === today ? 'today' : 'tomorrow'}`,
      path: `/jobs/${job.id}`,
      tone: 'warning',
      icon: Clock3,
    }));
    if (pendingSuggestionCount > 0) items.push({
      id: 'ical',
      title: `${pendingSuggestionCount} booking${pendingSuggestionCount === 1 ? '' : 's'} need review`,
      detail: 'Confirm the turnover before it reaches the live schedule.',
      path: '/bookings/suggestions',
      tone: 'info',
      icon: CalendarClock,
    });
    if ((commercial?.unbilled || 0) > 0) items.push({
      id: 'unbilled',
      title: `${money(commercial?.unbilled || 0)} completed but not billed`,
      detail: 'Revenue is earned but has not entered the collection cycle.',
      path: '/invoices/pending',
      tone: 'warning',
      icon: Banknote,
    });
    return items;
  }, [awaitingCleaner, commercial?.unbilled, pendingSuggestionCount, today, unassigned]);

  const revenueChange = percentChange(commercial?.currentRevenue || 0, commercial?.previousRevenue || 0);
  const readinessTone = atRisk > 0 ? 'border-amber-400/30 bg-amber-400/[0.06]' : 'border-emerald-400/30 bg-emerald-400/[0.06]';

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1500px] space-y-5">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Founder command centre · {format(new Date(), 'EEEE, d MMMM')}</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}{firstName ? `, ${firstName}` : ''}.</h1>
          <p className="mt-1 text-sm text-muted-foreground">The decisions that protect today, cash flow and customer trust.</p>
        </div>
        <div className="w-full xl:w-auto">
          <QuickActions onSendQuoteSMS={() => setSendQuoteOpen(true)} />
        </div>
      </header>

      <section className={`overflow-hidden rounded-3xl border p-5 sm:p-7 ${readinessTone}`}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)] lg:items-center">
          <div className="min-w-0">
            <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground"><Sparkles className="h-4 w-4 text-primary" /> Guest Ready confidence</div>
            <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
              <span className="text-6xl font-black tracking-[-0.08em] text-foreground sm:text-7xl">{readiness}%</span>
              <div className="pb-2">
                <p className="text-lg font-extrabold text-foreground">{atRisk ? `${atRisk} turnover${atRisk === 1 ? '' : 's'} need intervention` : 'Today is under control'}</p>
                <p className="text-sm text-muted-foreground">{completed} complete · {underway} underway · {todayJobs.length - completed - underway} still to go</p>
              </div>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${readiness}%` }} />
            </div>
          </div>
          <button type="button" onClick={() => navigate('/schedule')} className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-card/70 p-4 text-left transition-colors hover:border-primary/40">
            <div><p className="text-2xl font-black text-foreground">{todayJobs.length}</p><p className="text-xs text-muted-foreground">Today</p></div>
            <div><p className="text-2xl font-black text-foreground">{tomorrowJobs.length}</p><p className="text-xs text-muted-foreground">Tomorrow</p></div>
            <div><p className="text-2xl font-black text-amber-400">{unassigned.length}</p><p className="text-xs text-muted-foreground">Unassigned</p></div>
            <div><p className="text-2xl font-black text-blue-400">{underway}</p><p className="text-xs text-muted-foreground">Live now</p></div>
            <span className="col-span-2 mt-1 inline-flex items-center justify-end gap-1 text-xs font-bold text-primary">Open schedule <ArrowRight className="h-3.5 w-3.5" /></span>
          </button>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
        <section className="min-w-0 rounded-3xl border border-border bg-card p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Intervention queue</p><h2 className="mt-1 text-xl font-black text-foreground">What needs you now</h2></div>
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">{exceptions.length}</span>
          </div>
          {jobsLoading ? (
            <div className="h-44 animate-pulse rounded-2xl bg-muted" />
          ) : exceptions.length === 0 ? (
            <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-border text-center"><CheckCircle2 className="mb-3 h-8 w-8 text-emerald-400" /><p className="font-bold text-foreground">No immediate intervention</p><p className="text-sm text-muted-foreground">The operating queue is clear.</p></div>
          ) : (
            <div className="space-y-2">
              {exceptions.map((item) => {
                const Icon = item.icon;
                const tone = item.tone === 'danger' ? 'text-red-400 bg-red-400/10' : item.tone === 'warning' ? 'text-amber-400 bg-amber-400/10' : 'text-blue-400 bg-blue-400/10';
                return <button type="button" key={item.id} onClick={() => navigate(item.path)} className="flex w-full min-w-0 items-center gap-3 rounded-2xl border border-border p-3 text-left transition-colors hover:border-primary/40"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-foreground">{item.title}</span><span className="block truncate text-xs text-muted-foreground">{item.detail}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" /></button>;
              })}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
          <div className="mb-4"><p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Commercial pulse</p><h2 className="mt-1 text-xl font-black text-foreground">Money in motion</h2></div>
          <button type="button" onClick={() => navigate('/financials')} className="mb-3 w-full rounded-2xl bg-primary p-5 text-left text-primary-foreground transition-transform active:scale-[0.99]"><div className="flex items-center justify-between"><TrendingUp className="h-5 w-5" /><span className="text-xs font-bold">{revenueChange >= 0 ? '+' : ''}{revenueChange}% vs last month</span></div><p className="mt-4 text-3xl font-black">{money(commercial?.currentRevenue || 0)}</p><p className="text-xs font-semibold opacity-75">Paid revenue this month</p></button>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => navigate('/financials')} className="rounded-2xl border border-border p-4 text-left hover:border-primary/40"><WalletCards className="mb-3 h-5 w-5 text-amber-400" /><p className="text-xl font-black text-foreground">{money(commercial?.outstanding || 0)}</p><p className="text-xs text-muted-foreground">Outstanding</p></button>
            <button type="button" onClick={() => navigate('/invoices/pending')} className="rounded-2xl border border-border p-4 text-left hover:border-primary/40"><Banknote className="mb-3 h-5 w-5 text-blue-400" /><p className="text-xl font-black text-foreground">{money(commercial?.unbilled || 0)}</p><p className="text-xs text-muted-foreground">Not yet billed</p></button>
          </div>
        </section>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Open leads', value: commercial?.leadCount || 0, detail: 'Waiting for contact or quote', icon: Target, path: '/quoting', tone: 'text-violet-400' },
          { label: 'Quotes in market', value: commercial?.quoteCount || 0, detail: 'Sent, viewed or pending', icon: CircleDollarSign, path: '/quoting', tone: 'text-blue-400' },
          { label: 'Cleans this month', value: quality?.completed || 0, detail: 'Completed turnovers', icon: Gauge, path: '/operations', tone: 'text-emerald-400' },
          { label: 'Client rating', value: quality?.averageRating ? quality.averageRating.toFixed(1) : '—', detail: quality?.averageRating ? 'Average verified feedback' : 'Not enough feedback yet', icon: UsersRound, path: '/analytics', tone: 'text-amber-400' },
        ].map((metric) => <button type="button" key={metric.label} onClick={() => navigate(metric.path)} className="rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40"><metric.icon className={`mb-3 h-5 w-5 ${metric.tone}`} /><p className="text-2xl font-black text-foreground">{metric.value}</p><p className="text-sm font-bold text-foreground">{metric.label}</p><p className="mt-0.5 text-xs text-muted-foreground">{metric.detail}</p></button>)}
      </section>

      <p className="text-center text-[11px] text-muted-foreground">Live operating view · refreshes automatically · {role === 'head_cleaner' ? 'Head cleaner priorities' : 'Founder priorities'}</p>
      <SendQuoteLinkModal open={sendQuoteOpen} onOpenChange={setSendQuoteOpen} />
    </div>
  );
}
