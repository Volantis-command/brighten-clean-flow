import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  addWeeks, subWeeks, addMonths, subMonths, differenceInMinutes, subDays } from 'date-fns';
import { AlertTriangle, Loader2 } from 'lucide-react';

/** A clean under this is a typo, not a price. Caught a 10 cent invoice. */
const SUSPICIOUS_UNDER = 20;

/** The team's weekly target, in cleaner hours (BJ, 1 Oct 2026). */
const WEEKLY_HOURS_TARGET = 100;

/** Jobs in these states are not real work and must never count as revenue. */
const DEAD_JOB_STATUSES = ['cancelled'];

const fmt = (n: number) =>
  n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });

const fmtExact = (n: number) =>
  n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });

const d = (date: Date) => format(date, 'yyyy-MM-dd');

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * What a job is worth, ex GST.
 *
 * This deliberately mirrors the fallback chain in xero-auto-invoice-job, so
 * the revenue shown here is the money that will actually be invoiced. Reading
 * only the job row was wrong: Hostaway-synced and recurring jobs routinely
 * carry no price of their own because the price lives on the property, and
 * those were being reported as "no price" while invoicing billed them fine.
 *
 *   1. the job's own price
 *   2. the linked quote's sell price
 *   3. the property's turnover price (always ex GST)
 *   4. the property's default price (inc or ex, per price_includes_gst)
 *
 * Returns null only when there is genuinely no price anywhere, which is the
 * one case worth showing Brendan.
 */
function jobValueEx(job: any, quotePrices: Record<string, number>): number | null {
  const ex = Number(job.price_ex_gst) || 0;
  if (ex > 0) return ex;

  const inc = Number(job.price_inc_gst) || 0;
  if (inc > 0) return round2(inc / 1.1);

  if (job.linked_quote_id) {
    const q = quotePrices[job.linked_quote_id];
    if (q > 0) return q;
  }

  const prop = job.properties || {};
  const turnover = Number(prop.price_turnover) || 0;
  if (turnover > 0) return turnover;

  const dflt = Number(prop.default_price) || 0;
  if (dflt > 0) return prop.price_includes_gst ? round2(dflt / 1.1) : dflt;

  return null;
}

/** Everything on this page is shown inc GST, which is how the prices are quoted. */
function jobValueInc(job: any, quotePrices: Record<string, number>): number | null {
  const ex = jobValueEx(job, quotePrices);
  return ex === null ? null : round2(ex * 1.1);
}

/**
 * Hours a job costs the team, counting every cleaner on it: a 2.5 hour clean
 * with two cleaners is 5 hours.
 *
 * Clocked time wins wherever it exists, because that is what actually
 * happened and what payroll pays (shadow-clean trainees included, since their
 * hours are logged against the same job). Everything else is the booked
 * estimate, which is the only number an upcoming clean has.
 */
function entryHours(e: any): number {
  if (e.manual_hours != null) return Number(e.manual_hours);
  if (e.total_minutes != null) return Number(e.total_minutes) / 60;
  if (e.clock_in_time && e.clock_out_time) {
    return differenceInMinutes(new Date(e.clock_out_time), new Date(e.clock_in_time)) / 60;
  }
  return 0;
}

function cleanerIds(job: any): string[] {
  return [job.cleaner_1_id, job.cleaner_2_id].filter(Boolean);
}

/** { hours, clocked } — clocked false means this is still the booked estimate. */
function jobHours(job: any, entries: any[]): { hours: number; clocked: boolean } {
  const worked = (entries || []).reduce((s, e) => s + entryHours(e), 0);
  if (worked > 0) return { hours: round2(worked), clocked: true };
  const perCleaner = (Number(job.estimated_duration) || 0) / 60;
  // Nobody assigned yet still means one cleaner's worth of work to cover.
  const heads = Math.max(1, cleanerIds(job).length);
  return { hours: round2(perCleaner * heads), clocked: false };
}

const fmtHours = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString('en-AU')}h`;

type Period = { key: string; label: string; from: string; to: string; isFuture: boolean };

function buildPeriods(now: Date): { weeks: Period[]; months: Period[] } {
  // Monday to Sunday, matching the payroll week on the Timesheets page.
  const wk = (offset: number, label: string): Period => {
    const base = offset === 0 ? now : offset < 0 ? subWeeks(now, -offset) : addWeeks(now, offset);
    return {
      key: `week${offset}`,
      label,
      from: d(startOfWeek(base, { weekStartsOn: 1 })),
      to: d(endOfWeek(base, { weekStartsOn: 1 })),
      isFuture: offset > 0,
    };
  };
  const mo = (offset: number, label: string): Period => {
    const base = offset === 0 ? now : offset < 0 ? subMonths(now, -offset) : addMonths(now, offset);
    return {
      key: `month${offset}`,
      label,
      from: d(startOfMonth(base)),
      to: d(endOfMonth(base)),
      isFuture: offset > 0,
    };
  };
  // This week and the next four. Five weeks is what fits in a glance and covers
  // the booking window a cleaning business actually sells into (BJ, 30 Oct 2026).
  const weeks = [0, 1, 2, 3, 4].map((offset) => {
    const base = offset === 0 ? now : addWeeks(now, offset);
    const label = offset === 0 ? 'This week'
      : offset === 1 ? 'Next week'
      : `Week of ${format(startOfWeek(base, { weekStartsOn: 1 }), 'd MMM')}`;
    return wk(offset, label);
  });
  return {
    weeks,
    months: [mo(-1, 'Last month'), mo(0, 'This month'), mo(1, 'Next month')],
  };
}

/**
 * One week's hours and money, both split by cleaner.
 *
 * Money follows the hours. A $200 clean done by two cleaners is $100 against
 * each, so a cleaner's column reads as what their own time brought in instead
 * of counting the same job twice. Free properties (BJ's own) carry hours and
 * no money, on purpose.
 */
function periodHours(
  period: Period,
  jobs: any[],
  entriesByJob: Record<string, any[]>,
  quotePrices: Record<string, number> = {},
) {
  let clocked = 0;
  let booked = 0;
  let jobCount = 0;
  let money = 0;
  let unpricedHours = 0;
  let chargeableHours = 0;
  const byCleaner: Record<string, number> = {};
  const moneyByCleaner: Record<string, number> = {};

  jobs
    .filter((j) => j.scheduled_date >= period.from && j.scheduled_date <= period.to)
    .forEach((j) => {
      const entries = entriesByJob[j.id] || [];
      const { hours, clocked: isClocked } = jobHours(j, entries);
      if (hours <= 0) return;
      jobCount++;

      // Whose hours these are, and in what share. Clocked time wins once the
      // clean is done, because that is what payroll pays.
      const share: Record<string, number> = {};
      if (isClocked) {
        clocked += hours;
        entries.forEach((e) => {
          const h = entryHours(e);
          if (h > 0) share[e.user_id] = round2((share[e.user_id] || 0) + h);
        });
      } else {
        booked += hours;
        const heads = cleanerIds(j);
        if (heads.length === 0) share.unassigned = hours;
        else {
          const each = hours / heads.length;
          heads.forEach((id) => { share[id] = round2((share[id] || 0) + each); });
        }
      }
      const shareTotal = Object.values(share).reduce((sum, h) => sum + h, 0) || hours;

      const value = j.properties?.no_charge ? 0 : jobValueInc(j, quotePrices);
      if (value === null) unpricedHours += hours;
      else money += value;
      if (!j.properties?.no_charge) chargeableHours += hours;
      const earned = value || 0;

      Object.entries(share).forEach(([id, h]) => {
        byCleaner[id] = round2((byCleaner[id] || 0) + h);
        moneyByCleaner[id] = round2((moneyByCleaner[id] || 0) + (earned * h) / shareTotal);
      });
    });

  return {
    clocked: round2(clocked),
    booked: round2(booked),
    total: round2(clocked + booked),
    jobCount,
    money: round2(money),
    unpricedHours: round2(unpricedHours),
    chargeableHours: round2(chargeableHours),
    byCleaner,
    moneyByCleaner,
  };
}

function HoursCard({ period, jobs, entriesByJob, quotePrices }: {
  period: Period; jobs: any[]; entriesByJob: Record<string, any[]>; quotePrices: Record<string, number>;
}) {
  const { clocked, booked, total, jobCount, money, unpricedHours, chargeableHours } =
    periodHours(period, jobs, entriesByJob, quotePrices);
  const pct = Math.min(100, Math.round((total / WEEKLY_HOURS_TARGET) * 100));
  const short = round2(WEEKLY_HOURS_TARGET - total);

  // What the week earns per cleaner hour. Your own places are free on purpose,
  // so they sit in the hours but not in the rate. Hours with no price on the
  // job do drag it down, which is the point: unpriced work still costs wages.
  const perHour = chargeableHours > 0 ? money / chargeableHours : 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {period.label}
      </p>
      <p className="mt-2 text-3xl font-extrabold text-primary">
        {fmtHours(total)}{' '}
        <span className="text-xs font-bold text-muted-foreground">of {WEEKLY_HOURS_TARGET}h</span>
      </p>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${total >= WEEKLY_HOURS_TARGET ? 'bg-primary' : 'bg-primary/60'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {clocked > 0 && <>{fmtHours(clocked)} worked</>}
        {clocked > 0 && booked > 0 && ' · '}
        {booked > 0 && <>{fmtHours(booked)} booked</>}
        {clocked === 0 && booked === 0 && 'Nothing on yet'}
        {' · '}
        {jobCount} {jobCount === 1 ? 'clean' : 'cleans'}
      </p>
      <p className="mt-1 text-xs font-bold">
        {short > 0
          ? <span className="text-amber-400">{fmtHours(short)} short of target</span>
          : <span className="text-primary">Target hit{short < 0 ? `, ${fmtHours(-short)} over` : ''}</span>}
      </p>
      {total > 0 && (
        <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
          <span className="font-bold text-foreground">{fmtExact(perHour)}</span> per cleaner hour
          {unpricedHours > 0 && (
            <span className="block text-amber-400">
              {fmtHours(unpricedHours)} of that has no price on the job
            </span>
          )}
        </p>
      )}
    </div>
  );
}

function CleanerWeekGrid({ periods, jobs, entriesByJob, names, quotePrices }: {
  periods: Period[]; jobs: any[]; entriesByJob: Record<string, any[]>;
  names: Record<string, string>; quotePrices: Record<string, number>;
}) {
  // One row per cleaner, one column per week, hours over the money those hours
  // bring in. You can see who is loaded and who is idle five weeks out, and
  // what each week is actually worth, before it becomes a problem.
  const perWeek = periods.map((p) => periodHours(p, jobs, entriesByJob, quotePrices));

  const ids = Array.from(new Set(perWeek.flatMap((w) => Object.keys(w.byCleaner))));
  const rows = ids
    .map((id) => ({
      id,
      name: id === 'unassigned' ? 'Not assigned yet' : (names[id] || 'Unknown cleaner'),
      cells: perWeek.map((w) => ({ hours: w.byCleaner[id] || 0, money: w.moneyByCleaner[id] || 0 })),
      total: round2(perWeek.reduce((sum, w) => sum + (w.byCleaner[id] || 0), 0)),
      totalMoney: round2(perWeek.reduce((sum, w) => sum + (w.moneyByCleaner[id] || 0), 0)),
    }))
    .sort((a, b) => (a.id === 'unassigned' ? 1 : b.id === 'unassigned' ? -1 : b.total - a.total));

  const grandTotal = round2(perWeek.reduce((sum, w) => sum + w.total, 0));
  const grandMoney = round2(perWeek.reduce((sum, w) => sum + w.money, 0));
  const busiest = Math.max(1, ...rows.flatMap((r) => r.cells.map((c) => c.hours)));

  if (rows.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nothing booked in the next five weeks.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-5 py-2.5 text-left font-bold">Cleaner</th>
            {periods.map((p) => (
              <th key={p.key} className="px-3 py-2.5 text-right font-bold">
                {p.label === 'This week' ? 'This week' : p.label === 'Next week' ? 'Next week' : format(new Date(p.from + 'T00:00:00'), 'd MMM')}
              </th>
            ))}
            <th className="px-5 py-2.5 text-right font-bold text-foreground">5 weeks</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border/70">
              <td className="px-5 py-2.5 font-semibold text-foreground">{r.name}</td>
              {r.cells.map((c, i) => (
                <td key={i} className="px-3 py-2.5 text-right tabular-nums">
                  {c.hours > 0 ? (
                    <>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="hidden h-1.5 rounded-full bg-primary/50 sm:inline-block"
                          style={{ width: `${Math.max(4, (c.hours / busiest) * 40)}px` }}
                        />
                        <span className="font-semibold text-foreground">{fmtHours(c.hours)}</span>
                      </span>
                      <span className="block text-[11px] font-semibold text-muted-foreground">
                        {c.money > 0 ? fmt(c.money) : 'no price'}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </td>
              ))}
              <td className="px-5 py-2.5 text-right tabular-nums">
                <span className="font-extrabold text-foreground">{fmtHours(r.total)}</span>
                <span className="block text-[11px] font-bold text-primary">{fmt(r.totalMoney)}</span>
              </td>
            </tr>
          ))}
          <tr className="bg-muted/40">
            <td className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Team total</td>
            {perWeek.map((w, i) => (
              <td key={i} className="px-3 py-3 text-right tabular-nums">
                <span className={`font-extrabold ${w.total >= WEEKLY_HOURS_TARGET ? 'text-primary' : 'text-foreground'}`}>{fmtHours(w.total)}</span>
                <span className="block text-[11px] font-bold text-foreground">{fmt(w.money)}</span>
                <span className="block text-[10px] font-semibold text-muted-foreground">
                  {w.total >= WEEKLY_HOURS_TARGET ? 'target hit' : `${fmtHours(round2(WEEKLY_HOURS_TARGET - w.total))} short`}
                  {w.chargeableHours > 0 && ` · ${fmt(w.money / w.chargeableHours)}/h`}
                </span>
              </td>
            ))}
            <td className="px-5 py-3 text-right tabular-nums">
              <span className="font-extrabold text-foreground">{fmtHours(grandTotal)}</span>
              <span className="block text-[11px] font-bold text-primary">{fmt(grandMoney)}</span>
              <span className="block text-[10px] font-semibold text-muted-foreground">of {WEEKLY_HOURS_TARGET * periods.length}h</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * What we charge, what the cleaners cost, and what is left.
 *
 * Charged is EX GST on purpose. The rest of this page shows inc GST because
 * that is how a clean is quoted, but GST is the tax office's money, not yours,
 * so counting it as revenue would flatter every margin on this table.
 *
 * Cost is hours times profiles.hourly_rate, the same number Payroll and
 * Timesheets pay from, so this agrees with what you actually hand over.
 */
function GrossProfitTable({ periods, month, jobs, entriesByJob, quotePrices, names, rates }: {
  periods: Period[]; month: Period; jobs: any[]; entriesByJob: Record<string, any[]>;
  quotePrices: Record<string, number>; names: Record<string, string>; rates: Record<string, number>;
}) {
  const columns = [...periods, month];

  const stats = columns.map((p) => {
    const h = periodHours(p, jobs, entriesByJob, quotePrices);
    const chargedEx = round2(h.money / 1.1);

    const byCleaner = Object.entries(h.byCleaner).map(([id, hours]) => ({
      id,
      hours: round2(hours),
      rate: rates[id] ?? null,
      cost: rates[id] != null ? round2(hours * rates[id]) : 0,
    }));
    const cost = round2(byCleaner.reduce((sum, c) => sum + c.cost, 0));
    // Hours on the clock with nobody to pay, or nobody with a rate saved. Those
    // hours will cost something, so the margin below is the best case.
    const unratedHours = round2(byCleaner.filter((c) => c.rate == null).reduce((sum, c) => sum + c.hours, 0));

    const gp = round2(chargedEx - cost);
    const pct = chargedEx > 0 ? (gp / chargedEx) * 100 : 0;
    return { period: p, chargedEx, cost, gp, pct, byCleaner, unratedHours };
  });

  const cleanerIdsShown = Array.from(new Set(stats.flatMap((st) => st.byCleaner.map((c) => c.id))))
    .sort((a, b) => (a === 'unassigned' ? 1 : b === 'unassigned' ? -1 : 0));

  const pctTone = (pct: number) => (pct >= 50 ? 'text-primary' : pct >= 35 ? 'text-foreground' : 'text-amber-400');

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-5 py-2.5 text-left font-bold">&nbsp;</th>
            {columns.map((p, i) => (
              <th key={p.key} className={`px-3 py-2.5 text-right font-bold ${i === columns.length - 1 ? 'text-foreground' : ''}`}>
                {i === columns.length - 1
                  ? format(new Date(p.from + 'T00:00:00'), 'MMMM')
                  : p.label === 'This week' ? 'This week'
                  : p.label === 'Next week' ? 'Next week'
                  : format(new Date(p.from + 'T00:00:00'), 'd MMM')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border/70">
            <td className="px-5 py-2.5 font-semibold text-foreground">Charged, ex GST</td>
            {stats.map((st, i) => (
              <td key={i} className="px-3 py-2.5 text-right font-semibold tabular-nums text-foreground">
                {st.chargedEx > 0 ? fmt(st.chargedEx) : <span className="text-muted-foreground/50">—</span>}
              </td>
            ))}
          </tr>

          {cleanerIdsShown.map((id) => (
            <tr key={id} className="border-b border-border/40">
              <td className="px-5 py-2 pl-8 text-xs text-muted-foreground">
                {id === 'unassigned' ? 'Nobody assigned' : (names[id] || 'Unknown cleaner')}
                {id !== 'unassigned' && rates[id] != null && <span className="ml-1">at {fmtExact(rates[id])}/h</span>}
                {id !== 'unassigned' && rates[id] == null && <span className="ml-1 font-bold text-amber-400">no rate saved</span>}
              </td>
              {stats.map((st, i) => {
                const c = st.byCleaner.find((x) => x.id === id);
                return (
                  <td key={i} className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                    {c ? (c.rate != null ? fmt(c.cost) : `${fmtHours(c.hours)} unpaid?`) : <span className="text-muted-foreground/40">—</span>}
                  </td>
                );
              })}
            </tr>
          ))}

          <tr className="border-b border-border/70">
            <td className="px-5 py-2.5 font-semibold text-foreground">Cleaners cost</td>
            {stats.map((st, i) => (
              <td key={i} className="px-3 py-2.5 text-right font-semibold tabular-nums text-foreground">
                {st.cost > 0 ? fmt(st.cost) : <span className="text-muted-foreground/50">—</span>}
              </td>
            ))}
          </tr>

          <tr className="bg-muted/40">
            <td className="px-5 py-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Gross profit</td>
            {stats.map((st, i) => (
              <td key={i} className="px-3 py-3 text-right tabular-nums">
                <span className={`text-base font-extrabold ${st.gp >= 0 ? 'text-foreground' : 'text-red-400'}`}>
                  {st.chargedEx > 0 || st.cost > 0 ? fmt(st.gp) : '—'}
                </span>
                {st.chargedEx > 0 && (
                  <span className={`block text-[11px] font-bold ${pctTone(st.pct)}`}>
                    {Math.round(st.pct)}%
                  </span>
                )}
                {st.unratedHours > 0 && (
                  <span className="block text-[10px] font-semibold text-amber-400">
                    {fmtHours(st.unratedHours)} with no rate
                  </span>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── THE NEW BLOCKS ──────────────────────────────────────────────────────────
//
// Added 6 Nov 2026. Everything above this line is the page BJ already uses and
// is deliberately untouched: "the first 2 screenshots is what i want, its how
// it is now and i dont want that changed."
//
// These four read the same jobs as the cards above, so they cannot disagree
// with them. The trend chart in particular recomputes gross profit exactly the
// way GrossProfitTable does, from periodHours and the saved cleaner rates.

/** Direction, not a single week. Bars are revenue, the line is margin. */
function TrendChart({ periods, jobs, entriesByJob, quotePrices, rates }: {
  periods: Period[]; jobs: any[]; entriesByJob: Record<string, any[]>;
  quotePrices: Record<string, number>; rates: Record<string, number>;
}) {
  const stats = periods.map((p) => {
    const h = periodHours(p, jobs, entriesByJob, quotePrices);
    const chargedEx = round2(h.money / 1.1);
    const cost = round2(Object.entries(h.byCleaner)
      .reduce((sum, [id, hours]) => sum + (rates[id] != null ? hours * rates[id] : 0), 0));
    const gp = round2(chargedEx - cost);
    return { p, chargedEx, gp, pct: chargedEx > 0 ? (gp / chargedEx) * 100 : 0 };
  });

  const maxRev = Math.max(...stats.map((s) => s.chargedEx), 1);
  // Fixed 0-50% axis for the margin line. A scale that moves with the data
  // makes a bad week look the same as a good one.
  const PCT_MAX = 50;
  const W = 620, H = 210, left = 46, right = 12, top = 16, base = 150;
  const band = (W - left - right) / stats.length;
  const x = (i: number) => left + band * (i + 0.5);
  const yRev = (v: number) => base - (v / maxRev) * (base - top);
  const yPct = (v: number) => base - (Math.min(Math.max(v, 0), PCT_MAX) / PCT_MAX) * (base - top);
  const tone = (pct: number) => (pct >= 35 ? '#4ade80' : pct >= 25 ? '#fbbf24' : '#f87171');

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
           aria-label="Revenue and gross profit percentage over five weeks">
        <line x1={left} y1={base} x2={W - right} y2={base} stroke="currentColor" className="text-border" strokeWidth="1" />
        <line x1={left} y1={(base + top) / 2} x2={W - right} y2={(base + top) / 2} stroke="currentColor" className="text-border/40" strokeWidth="1" />
        <text x={left - 6} y={base + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">$0</text>
        <text x={left - 6} y={top + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">{fmt(maxRev)}</text>

        {stats.map((st, i) => (
          <rect key={`b${i}`} x={x(i) - band * 0.3} y={yRev(st.chargedEx)}
                width={band * 0.6} height={Math.max(base - yRev(st.chargedEx), 0)}
                rx="3" className="fill-primary/25" />
        ))}

        <polyline fill="none" strokeWidth="2.5" strokeLinejoin="round" stroke="#4ade80"
                  points={stats.map((st, i) => `${x(i)},${yPct(st.pct)}`).join(' ')} />
        {stats.map((st, i) => (
          <g key={`p${i}`}>
            <circle cx={x(i)} cy={yPct(st.pct)} r="4.5" fill={tone(st.pct)} />
            <text x={x(i)} y={yPct(st.pct) - 10} textAnchor="middle"
                  className="text-[11px] font-bold" fill={tone(st.pct)}>
              {Math.round(st.pct)}%
            </text>
          </g>
        ))}

        {stats.map((st, i) => (
          <g key={`l${i}`}>
            <text x={x(i)} y={base + 20} textAnchor="middle" className="fill-muted-foreground text-[11px]">
              {st.p.label === 'This week' ? 'This wk' : st.p.label === 'Next week' ? 'Next wk'
                : format(new Date(st.p.from + 'T00:00:00'), 'd MMM')}
            </text>
            <text x={x(i)} y={base + 36} textAnchor="middle" className="fill-muted-foreground/60 text-[10px] tabular-nums">
              {st.chargedEx > 0 ? fmt(st.chargedEx) : '—'}
            </text>
          </g>
        ))}
      </svg>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-primary/25 align-[-1px]" />Charged ex GST</span>
        <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-primary align-[-1px]" />Gross profit %</span>
        <span className="text-muted-foreground/60">A week sitting low usually means hours with no cleaner rate against them, not a cheap week.</span>
      </div>
    </div>
  );
}

type Insights = {
  priced: number; avgJob: number; avgPerHour: number; medianPerHour: number;
  loPerHour: number; hiPerHour: number;
  byFrequency: { key: string; jobs: number; revenue: number; avg: number }[];
  bySegment: { key: string; cleans: number; perHour: number; median: number; avgClean: number; revenue: number }[];
  deep: { cleans: number; confirmed: number; perHour: number; avgClean: number; revenue: number } | null;
  byService: { key: string; jobs: number; revenue: number; inferred: number }[];
  topClient: { name: string; revenue: number; share: number } | null;
  totalRevenue: number; recurringRevenue: number;
  completed: number; avgBooked: number; avgActual: number;
  ranOver: number; ranUnder: number; withActual: number;
};

/** What we charge an hour, where it comes from, and whether the clock agrees. */
function InsightBlocks({ ins }: { ins: Insights }) {
  const Card = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) => (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-2 text-3xl font-extrabold tabular-nums ${tone || 'text-foreground'}`}>{value}</p>
      {sub && <p className="mt-2 text-sm text-muted-foreground">{sub}</p>}
    </div>
  );

  const freqLabel = (k: string) => k === '(none)' ? 'Not set' : k.charAt(0).toUpperCase() + k.slice(1);

  return (
    <>
      <section className="mt-10">
        <h2 className="text-lg font-extrabold text-primary">What we actually charge an hour</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Last 120 days, {ins.priced} priced cleans, ex GST unless it says otherwise. Divided by
          clocked time where a cleaner clocked on, and by the booked duration everywhere else, which
          is the same rule as the hours cards above. A property booked for longer than it really takes
          will read lower here than it does in real life, so a surprising number is usually the booking,
          not the price.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Card label="Charged per cleaner hour, ex GST" value={fmt(ins.avgPerHour)}
                sub={`${fmt(round2(ins.avgPerHour * 1.1))} inc GST. Median ${fmt(ins.medianPerHour)} ex, range ${fmt(ins.loPerHour)} to ${fmt(ins.hiPerHour)} ex.`} />
          <Card label="Average clean" value={fmt(ins.avgJob)}
                sub={`Across ${ins.priced} priced cleans`} />
          <Card label="Recurring share of revenue"
                value={`${ins.totalRevenue > 0 ? Math.round((ins.recurringRevenue / ins.totalRevenue) * 100) : 0}%`}
                sub="Weekly, fortnightly and monthly work. The part of the business that does not need selling again."
                tone="text-primary" />
        </div>

        {/* The same rate, split by who the work is for. This is the comparison
            that decides where the next cleaner's hours should go. */}
        {ins.bySegment.length > 1 && (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card p-5">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 text-left font-bold">Work for</th>
                  <th className="py-2 text-right font-bold">Cleans</th>
                  <th className="py-2 text-right font-bold">Per cleaner hour, ex GST</th>
                  <th className="py-2 text-right font-bold">Median</th>
                  <th className="py-2 text-right font-bold">Avg clean</th>
                  <th className="py-2 text-right font-bold">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {ins.bySegment.map((r) => {
                  const best = Math.max(...ins.bySegment.map((x) => x.perHour));
                  const worst = Math.min(...ins.bySegment.map((x) => x.perHour));
                  const tone = r.perHour === best ? 'text-primary'
                    : r.perHour === worst ? 'text-amber-400' : 'text-foreground';
                  return (
                    <tr key={r.key} className="border-b border-border/60 last:border-0">
                      <td className="py-2.5 font-semibold text-foreground">{r.key}</td>
                      <td className="py-2.5 text-right tabular-nums text-muted-foreground">{r.cleans}</td>
                      <td className={`py-2.5 text-right tabular-nums ${tone}`}>
                        <span className="font-extrabold">{fmt(r.perHour)}</span>
                        <span className="block text-xs font-normal text-muted-foreground">
                          {fmt(round2(r.perHour * 1.1))} inc
                        </span>
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-muted-foreground">{fmt(r.median)}</td>
                      <td className="py-2.5 text-right tabular-nums">{fmt(r.avgClean)}</td>
                      <td className="py-2.5 text-right tabular-nums">{fmt(r.revenue)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {(() => {
              const top = ins.bySegment.reduce((a, b) => (b.perHour > a.perHour ? b : a));
              const low = ins.bySegment.reduce((a, b) => (b.perHour < a.perHour ? b : a));
              if (top.key === low.key || low.perHour <= 0) return null;
              const pct = Math.round(((top.perHour - low.perHour) / low.perHour) * 100);
              return (
                <p className="mt-3 text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{top.key} pays {pct}% more an hour than {low.key}</span>
                  {' '}({fmt(top.perHour)} against {fmt(low.perHour)}), and {low.key} is{' '}
                  {Math.round((low.cleans / ins.priced) * 100)}% of the cleans. That gap is where the next
                  cleaner's hours are worth the most.
                </p>
              );
            })()}

            {ins.deep && (
              <div className="mt-4 rounded-xl border border-border/70 bg-background/40 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Deep cleans, counted separately
                </p>
                <p className="mt-1.5 text-sm text-foreground">
                  {ins.deep.cleans} clean{ins.deep.cleans === 1 ? '' : 's'}, {fmt(ins.deep.perHour)} an hour,
                  {' '}{fmt(ins.deep.avgClean)} a job, {fmt(ins.deep.revenue)} in total.
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Not a fourth row: a deep clean happens at a residential or an Airbnb property, so it is
                  already inside the rows above. {ins.deep.confirmed} of {ins.deep.cleans}{' '}
                  {ins.deep.confirmed === 1 ? 'was' : 'were'} actually marked as a deep clean rather than
                  assumed from the property.
                </p>
                {ins.deep.confirmed < 5 && (
                  <p className="mt-2 text-xs text-amber-400">
                    Too few confirmed to read anything into yet. Every clean booked from now carries its own
                    Clean Type, so this fills in on its own. To speed it up, open an old deep clean and set
                    its Clean Type, and it joins this straight away.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-extrabold text-primary">Where the money comes from</h2>
        <p className="mt-1 text-sm text-muted-foreground">Last 120 days.</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="overflow-x-auto rounded-2xl border border-border bg-card p-5">
            <table className="w-full min-w-[420px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 text-left font-bold">How often</th>
                  <th className="py-2 text-right font-bold">Cleans</th>
                  <th className="py-2 text-right font-bold">Revenue</th>
                  <th className="py-2 text-right font-bold">Avg clean</th>
                  <th className="py-2 text-right font-bold">Share</th>
                </tr>
              </thead>
              <tbody>
                {ins.byFrequency.map((r) => (
                  <tr key={r.key} className="border-b border-border/60">
                    <td className="py-2.5 font-semibold text-foreground">{freqLabel(r.key)}</td>
                    <td className="py-2.5 text-right tabular-nums">{r.jobs}</td>
                    <td className="py-2.5 text-right tabular-nums">{fmt(r.revenue)}</td>
                    <td className="py-2.5 text-right tabular-nums">{fmt(r.avg)}</td>
                    <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                      {ins.totalRevenue > 0 ? Math.round((r.revenue / ins.totalRevenue) * 100) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4">
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Biggest client</p>
              <p className="mt-2 text-2xl font-extrabold text-foreground">{ins.topClient?.name || '—'}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {ins.topClient
                  ? <>{fmt(ins.topClient.revenue)}, {Math.round(ins.topClient.share)}% of everything charged. If they leave, that is the hole.</>
                  : 'No priced work in the window.'}
              </p>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-border bg-card p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">By kind of clean</p>
              <table className="mt-3 w-full border-collapse text-sm">
                <tbody>
                  {ins.byService.map((r) => (
                    <tr key={r.key} className="border-b border-border/60 last:border-0">
                      <td className="py-2 font-semibold text-foreground">{r.key}</td>
                      <td className="py-2 text-right tabular-nums">{r.jobs}</td>
                      <td className="py-2 text-right tabular-nums">{fmt(r.revenue)}</td>
                      <td className="py-2 text-right text-xs text-amber-400">
                        {r.inferred > 0 ? `${r.inferred} assumed` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-muted-foreground">
                The booking form has never saved its Clean Type, so most of these are assumed from the
                property rather than chosen. Anything marked assumed is a guess, not a fact.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-extrabold text-primary">Are we quoting enough time?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {ins.completed} completed cleans, {ins.withActual} of them with a clock on and off. This is the
          number that quietly decides the margin.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Card label="Booked vs actual"
                value={`${ins.avgActual - ins.avgBooked >= 0 ? '+' : ''}${Math.round(ins.avgActual - ins.avgBooked)} min`}
                sub={`Average ${Math.round(ins.avgBooked)} min booked, ${Math.round(ins.avgActual)} min worked`} />
          <Card label="Ran over by 10%+" value={String(ins.ranOver)}
                sub="Cleans where the time was underquoted" tone="text-amber-400" />
          <Card label="Ran under by 10%+" value={String(ins.ranUnder)}
                sub={`${ins.ranOver + ins.ranUnder} of ${ins.withActual} missed the estimate by more than 10%. The averages cancel out. The jobs do not.`} />
        </div>
      </section>
    </>
  );
}

function RevenueCard({ period, jobs, quotePrices }: { period: Period; jobs: any[]; quotePrices: Record<string, number> }) {
  const inPeriod = jobs.filter(
    (j) => j.scheduled_date >= period.from && j.scheduled_date <= period.to,
  );
  let total = 0;
  let unpriced = 0;
  inPeriod.forEach((j) => {
    // Your own places are free on purpose, so they earn nothing here. This
    // keeps the week card and the per cleaner money below saying the same thing.
    if (j.properties?.no_charge) return;
    const v = jobValueInc(j, quotePrices);
    if (v === null) unpriced++;
    else total += v;
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {period.label}
      </p>
      <p className="mt-2 text-3xl font-extrabold text-primary">
        {fmt(total)} <span className="text-xs font-bold text-muted-foreground">inc GST</span>
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {format(new Date(period.from + 'T00:00:00'), 'd MMM')} to{' '}
        {format(new Date(period.to + 'T00:00:00'), 'd MMM')}
        {' · '}
        {inPeriod.length} {inPeriod.length === 1 ? 'job' : 'jobs'}
        {period.isFuture ? ' booked' : ''}
      </p>
      {unpriced > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {unpriced} with no price, not counted
        </p>
      )}
    </div>
  );
}

/**
 * The 120 day window behind the three blocks at the bottom.
 *
 * Deliberately a separate query from the five week one above. That window is
 * built around the calendar cards and is far too short for an average: a
 * fortnightly client appears twice in it. 120 days is long enough for the rate
 * spread to mean something and short enough to still describe the business as
 * it is now.
 *
 * no_charge properties are excluded from every money figure. They are real
 * hours and zero dollars, so leaving them in drags every average down and makes
 * the business look cheaper than it is.
 */
function useInsights() {
  const from = format(subDays(new Date(), 120), 'yyyy-MM-dd');
  return useQuery({
    queryKey: ['financials-insights', from],
    queryFn: async (): Promise<Insights> => {
      const { data, error } = await supabase
        .from('jobs')
        .select('id, scheduled_date, status, price_ex_gst, estimated_duration, frequency, service_type, service_type_inferred, cleaner_1_id, cleaner_2_id, clock_on, clock_off, clock_off_at, properties(property_name, client_type, no_charge, status)')
        .gte('scheduled_date', from)
        .not('status', 'in', `(${DEAD_JOB_STATUSES.join(',')})`);
      if (error) throw error;

      // Archived clients are left out of everything below. This block exists to
      // answer "what should we charge", and a client we have stopped doing
      // cannot inform that. Their history is untouched in the database and
      // still counts in the weekly and monthly cards above.
      //
      // Only an explicit 'inactive' is excluded, never "not active": 78 cleans
      // and $12,177 sit on properties still marked 'onboarding', and dropping
      // those would distort the rate far more than any one cheap client.
      const rows = (data || []).filter((j: any) =>
        !j.properties?.no_charge && j.properties?.status !== 'inactive');
      const priced = rows.filter((j: any) => Number(j.price_ex_gst) > 0);

      // How many cleaner hours a job actually cost.
      //
      // BJ, 6 Nov 2026: "Lynn and Olivia are $70 an hour, they should be
      // higher? why are they lower." He was right and this block was wrong. It
      // divided by BOOKED hours while the cards at the top of the page use
      // clocked time once a clean is done. Olivia's is booked for 165 minutes
      // and takes 128, so dividing by the booking understated her by 29% and
      // the two halves of the same page disagreed.
      //
      // Clocked time where there is any, the booking before that, which is the
      // same rule the hours cards above use.
      const cleanerHours = (j: any) => {
        const off = j.clock_off || j.clock_off_at;
        let mins = Number(j.estimated_duration) || 120;
        if (j.clock_on && off) {
          const worked = (new Date(off).getTime() - new Date(j.clock_on).getTime()) / 60000;
          // A clock left running overnight is not a 14 hour clean.
          if (Number.isFinite(worked) && worked > 0 && worked <= 12 * 60) mins = worked;
        }
        const heads = Math.max(cleanerIds(j).filter((c) => c !== 'unassigned').length, 1);
        return (mins / 60) * heads;
      };

      const perHour = priced.map((j: any) => {
        const h = cleanerHours(j);
        return h > 0 ? Number(j.price_ex_gst) / h : NaN;
      }).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);

      const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
      const totalRevenue = round2(sum(priced.map((j: any) => Number(j.price_ex_gst))));

      const group = (key: (j: any) => string) => {
        const m: Record<string, { jobs: number; revenue: number; inferred: number }> = {};
        rows.forEach((j: any) => {
          const k = key(j) || '(none)';
          if (!m[k]) m[k] = { jobs: 0, revenue: 0, inferred: 0 };
          m[k].jobs += 1;
          m[k].revenue += Number(j.price_ex_gst) || 0;
          if (j.service_type_inferred) m[k].inferred += 1;
        });
        return m;
      };

      const freq = group((j) => j.frequency);
      const byFrequency = Object.entries(freq)
        .map(([key, v]) => ({ key, jobs: v.jobs, revenue: round2(v.revenue), avg: v.jobs ? round2(v.revenue / v.jobs) : 0 }))
        .sort((a, b) => b.revenue - a.revenue);

      const svc = group((j) => j.service_type);
      const byService = Object.entries(svc)
        .map(([key, v]) => ({ key, jobs: v.jobs, revenue: round2(v.revenue), inferred: v.inferred }))
        .sort((a, b) => b.revenue - a.revenue);

      // Per cleaner hour, split by the kind of client. client_type is set on
      // every property, so unlike service_type this split is fact, not a guess.
      const rate = (j: any) => {
        const h = cleanerHours(j);
        return h > 0 ? Number(j.price_ex_gst) / h : NaN;
      };
      const segmentOf = (j: any) => {
        const t = j.properties?.client_type;
        return t === 'airbnb' ? 'Airbnb' : t === 'residential' ? 'Residential'
          : t === 'business' || t === 'commercial' ? 'Business' : 'Other';
      };
      const segMap: Record<string, any[]> = {};
      priced.forEach((j: any) => {
        const k = segmentOf(j);
        (segMap[k] ||= []).push(j);
      });
      const bySegment = Object.entries(segMap).map(([key, js]) => {
        const rates = js.map(rate).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
        const rev = sum(js.map((j: any) => Number(j.price_ex_gst)));
        return {
          key, cleans: js.length,
          perHour: rates.length ? round2(sum(rates) / rates.length) : 0,
          median: rates.length ? round2(rates[Math.floor(rates.length / 2)]) : 0,
          avgClean: js.length ? round2(rev / js.length) : 0,
          revenue: round2(rev),
        };
      }).sort((a, b) => b.revenue - a.revenue);

      // Deep cleans are NOT a fourth segment: a deep clean happens at a
      // residential or an Airbnb property, so it is already counted above.
      // Shown on its own so it cannot be read as a slice of the same pie.
      const deepJobs = priced.filter((j: any) => j.service_type === 'Deep Clean');
      const deepRates = deepJobs.map(rate).filter((v) => Number.isFinite(v) && v > 0);
      const deepRev = sum(deepJobs.map((j: any) => Number(j.price_ex_gst)));
      const deep = deepJobs.length ? {
        cleans: deepJobs.length,
        confirmed: deepJobs.filter((j: any) => !j.service_type_inferred).length,
        perHour: deepRates.length ? round2(sum(deepRates) / deepRates.length) : 0,
        avgClean: round2(deepRev / deepJobs.length),
        revenue: round2(deepRev),
      } : null;

      const byClient = group((j) => j.properties?.property_name);
      const top = Object.entries(byClient).sort((a, b) => b[1].revenue - a[1].revenue)[0];

      const recurringRevenue = round2(byFrequency
        .filter((r) => ['weekly', 'fortnightly', 'monthly'].includes(r.key))
        .reduce((a, r) => a + r.revenue, 0));

      // Booked against the clock, on finished cleans only.
      const done = rows.filter((j: any) => j.status === 'completed');
      const withActual = done.map((j: any) => {
        const off = j.clock_off || j.clock_off_at;
        if (!j.clock_on || !off) return null;
        const mins = (new Date(off).getTime() - new Date(j.clock_on).getTime()) / 60000;
        if (!Number.isFinite(mins) || mins <= 0 || mins > 24 * 60) return null;
        return { booked: Number(j.estimated_duration) || 120, actual: mins };
      }).filter(Boolean) as { booked: number; actual: number }[];

      return {
        priced: priced.length,
        avgJob: priced.length ? round2(totalRevenue / priced.length) : 0,
        avgPerHour: perHour.length ? round2(sum(perHour) / perHour.length) : 0,
        medianPerHour: perHour.length ? round2(perHour[Math.floor(perHour.length / 2)]) : 0,
        loPerHour: perHour.length ? round2(perHour[Math.floor(perHour.length * 0.1)]) : 0,
        hiPerHour: perHour.length ? round2(perHour[Math.floor(perHour.length * 0.9)]) : 0,
        byFrequency, byService, bySegment, deep,
        topClient: top ? { name: top[0], revenue: round2(top[1].revenue), share: totalRevenue > 0 ? (top[1].revenue / totalRevenue) * 100 : 0 } : null,
        totalRevenue, recurringRevenue,
        completed: done.length,
        withActual: withActual.length,
        avgBooked: withActual.length ? sum(withActual.map((w) => w.booked)) / withActual.length : 0,
        avgActual: withActual.length ? sum(withActual.map((w) => w.actual)) / withActual.length : 0,
        ranOver: withActual.filter((w) => w.actual > w.booked * 1.1).length,
        ranUnder: withActual.filter((w) => w.actual < w.booked * 0.9).length,
      };
    },
  });
}

export default function FinancialsPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const navigate = useNavigate();

  const now = new Date();
  const { weeks, months } = buildPeriods(now);

  // One window wide enough for every card, so the six figures always come from
  // the same snapshot and cannot disagree with each other.
  const rangeFrom = months[0].from < weeks[0].from ? months[0].from : weeks[0].from;
  const lastWeek = weeks[weeks.length - 1];
  const rangeTo = months[2].to > lastWeek.to ? months[2].to : lastWeek.to;

  const { data: insights, isLoading: insightsLoading } = useInsights();

  const { data, isLoading } = useQuery({
    queryKey: ['financials-v2', rangeFrom, rangeTo],
    queryFn: async () => {
      const [{ data: periodJobs, error: pErr }, { data: openWork, error: iErr }] =
        await Promise.all([
          supabase
            .from('jobs')
            .select('id, scheduled_date, status, price_ex_gst, price_inc_gst, linked_quote_id, estimated_duration, cleaner_1_id, cleaner_2_id, closed_off_at, invoice_status, properties(property_name, default_price, price_includes_gst, price_turnover, no_charge)')
            .gte('scheduled_date', rangeFrom)
            .lte('scheduled_date', rangeTo)
            .not('status', 'in', `(${DEAD_JOB_STATUSES.join(',')})`),
          // Unfinished work, not limited to the period cards. A clean from
          // three months ago that nobody closed off is exactly the one worth
          // seeing. Paid and unpaid are deliberately absent: that is Xero's job.
          supabase
            .from('jobs')
            .select('id, scheduled_date, status, price_ex_gst, price_inc_gst, linked_quote_id, closed_off_at, invoice_status, invoice_error, cleaner_1_id, properties(property_name, default_price, price_includes_gst, price_turnover, no_charge)')
            .not('status', 'in', `(${DEAD_JOB_STATUSES.join(',')})`)
            .or('status.eq.pending_cleaner,and(status.eq.completed,closed_off_at.is.null)')
            .order('scheduled_date', { ascending: true }),
        ]);
      if (pErr) throw pErr;
      if (iErr) throw iErr;

      // Only look up quotes for jobs that actually need one, which is usually
      // none of them. Skipping this when the chain already resolved keeps the
      // page to two queries in the common case.
      const needQuote = [...(periodJobs || []), ...(openWork || [])]
        .filter((j: any) => j.linked_quote_id && jobValueEx(j, {}) === null)
        .map((j: any) => j.linked_quote_id);

      const quotePrices: Record<string, number> = {};
      if (needQuote.length) {
        const { data: quotes } = await supabase
          .from('quotes')
          .select('id, sell_price_ex_gst')
          .in('id', [...new Set(needQuote)]);
        (quotes || []).forEach((q: any) => {
          const v = Number(q.sell_price_ex_gst) || 0;
          if (v > 0) quotePrices[q.id] = v;
        });
      }

      // Hours: clocked time for the cleans in range (shadow-clean trainees
      // included, since their hours hang off the same job), plus the names to
      // show them against.
      const jobIds = (periodJobs || []).map((j: any) => j.id);
      const entriesByJob: Record<string, any[]> = {};
      if (jobIds.length) {
        const { data: entries, error: eErr } = await supabase
          .from('time_entries')
          .select('job_id, user_id, manual_hours, total_minutes, clock_in_time, clock_out_time')
          .in('job_id', jobIds);
        if (eErr) throw eErr;
        (entries || []).forEach((e: any) => {
          (entriesByJob[e.job_id] ||= []).push(e);
        });
      }

      const peopleIds = [...new Set([
        ...(periodJobs || []).flatMap((j: any) => cleanerIds(j)),
        ...Object.values(entriesByJob).flat().map((e: any) => e.user_id),
      ])].filter(Boolean);
      const names: Record<string, string> = {};
      const rates: Record<string, number> = {};
      if (peopleIds.length) {
        // hourly_rate is what Payroll and Timesheets actually pay from, so the
        // cost side of gross profit comes from the same number they do.
        const { data: people } = await supabase.from('profiles').select('id, full_name, hourly_rate').in('id', peopleIds);
        (people || []).forEach((p: any) => {
          names[p.id] = p.full_name || 'Unnamed cleaner';
          if (p.hourly_rate != null) rates[p.id] = Number(p.hourly_rate);
        });
      }

      // Any booking with no price is money that will never be invoiced unless
      // someone notices. Upcoming ones matter as much as finished ones: a
      // recurring clean with no price repeats the hole every week (Rumble: 56
      // jobs, never once priced). A price under $20 is a typo, so it lands here
      // too rather than quietly understating the week.
      const priceHoles = (periodJobs || [])
        .filter((j: any) => !j.properties?.no_charge)
        .map((j: any) => {
          const v = jobValueInc(j, quotePrices);
          if (v === null) return { job: j, kind: 'none' as const, value: null };
          if (v < SUSPICIOUS_UNDER) return { job: j, kind: 'tiny' as const, value: v };
          return null;
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.job.scheduled_date.localeCompare(b.job.scheduled_date));

      return {
        periodJobs: periodJobs || [],
        openWork: (openWork || []).map((j: any) => {
          const noCharge = !!j.properties?.no_charge;
          const unpriced = jobValueInc(j, quotePrices) === null && !noCharge;
          let need = '';
          if (j.status === 'pending_cleaner') need = 'Needs a cleaner';
          else if (unpriced) need = 'Needs a price';
          else if (j.invoice_status === 'failed') need = 'Invoice failed in Xero';
          else if (j.invoice_status === 'draft') need = 'Draft in Xero, send it';
          else if (!j.invoice_status || j.invoice_status === 'none') need = 'Done, not invoiced';
          else need = 'Done, tick it off';
          return { ...j, need, noCharge };
        }),
        quotePrices,
        priceHoles,
        entriesByJob,
        names,
        rates,
      };
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const jobs = data?.periodJobs || [];
  const openWork = data?.openWork || [];
  const quotePrices = data?.quotePrices || {};
  const priceHoles = data?.priceHoles || [];
  const entriesByJob = data?.entriesByJob || {};
  const names = data?.names || {};
  const rates = data?.rates || {};


  return (
    <div className="space-y-8 p-4 md:p-6">
      <h1 className="text-3xl font-extrabold text-primary">Financials</h1>
      <p className="-mt-6 text-sm text-muted-foreground">
        Every booking counts here, whatever its status. Needs a cleaner, confirmed, done,
        invoiced or paid, it is all in. Only cancelled cleans are left out.
      </p>

      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          By week
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {weeks.map((p) => <RevenueCard key={p.key} period={p} jobs={jobs} quotePrices={quotePrices} />)}
        </div>
      </section>

      {/* ── Hours ──────────────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Cleaner hours · target {WEEKLY_HOURS_TARGET}h a week
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Every cleaner on a job counts: a 2.5 hour clean with two cleaners is 5 hours.
          Clocked time is used once a clean is done, booked hours before that.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {weeks.map((p) => <HoursCard key={p.key} period={p} jobs={jobs} entriesByJob={entriesByJob} quotePrices={quotePrices} />)}
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <h3 className="text-lg font-bold text-primary">Hours and money per cleaner, five weeks out</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {format(new Date(weeks[0].from + 'T00:00:00'), 'd MMM')} to {format(new Date(weeks[weeks.length - 1].to + 'T00:00:00'), 'd MMM')}.
              Clocked time where a clean is done, booked hours before that. The money under each
              figure is that cleaner's share of the job, so a two cleaner job splits in half.
            </p>
          </div>
          <CleanerWeekGrid periods={weeks} jobs={jobs} entriesByJob={entriesByJob} names={names} quotePrices={quotePrices} />
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <h3 className="text-lg font-bold text-primary">Gross profit</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              What we charge, less what the cleaners cost. Charged is ex GST, because GST is not yours to keep.
              Cost is hours at each cleaner's saved rate, the same number Payroll pays from. Free properties are
              in the hours and not in the charge, so they read as pure cost, which is what they are.
            </p>
          </div>
          <GrossProfitTable
            periods={weeks}
            month={months.find((m) => m.key === 'month0') || months[0]}
            jobs={jobs}
            entriesByJob={entriesByJob}
            quotePrices={quotePrices}
            names={names}
            rates={rates}
          />

        {/* Added 6 Nov 2026. Everything above is untouched. */}
        <section className="mt-10">
          <h2 className="text-lg font-extrabold text-primary">Five weeks out</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The same numbers as the table above, drawn. Direction beats any single week.
          </p>
          <div className="mt-4">
            <TrendChart periods={weeks} jobs={jobs} entriesByJob={entriesByJob} quotePrices={quotePrices} rates={rates} />
          </div>
        </section>

        {insightsLoading ? (
          <p className="mt-10 text-sm text-muted-foreground">Loading the last 120 days…</p>
        ) : insights ? (
          <InsightBlocks ins={insights} />
        ) : null}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          By month
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {months.map((p) => <RevenueCard key={p.key} period={p} jobs={jobs} quotePrices={quotePrices} />)}
        </div>
      </section>

      {/* ── Needs action: what is not finished ─────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-4">
          <h2 className="text-lg font-bold text-primary">
            Needs action ({openWork.length})
          </h2>
          <p className="text-sm text-muted-foreground">Tap one to open that day on the calendar</p>
        </div>

        {openWork.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            Nothing outstanding. Every clean is either booked, done and closed off.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {openWork.map((j: any) => {
              const value = jobValueInc(j, quotePrices);
              const when = new Date(j.scheduled_date + 'T00:00:00');
              const late = j.scheduled_date < d(new Date());
              return (
                <button
                  key={j.id}
                  onClick={() => navigate(`/schedule?date=${j.scheduled_date}&view=day`)}
                  className="flex w-full flex-wrap items-center gap-3 px-5 py-3 text-left hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">
                      {j.properties?.property_name || 'Unknown property'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {format(when, 'EEE d MMM yyyy')}
                      {' · '}
                      <span className={late ? 'font-bold text-amber-400' : 'font-bold text-foreground'}>
                        {j.need}
                      </span>
                      {j.noCharge && <span className="text-muted-foreground"> · no charge, yours</span>}
                    </p>
                  </div>
                  <p className="shrink-0 font-bold tabular-nums text-foreground">
                    {j.noCharge ? '—' : value === null ? '—' : fmtExact(value)}
                  </p>
                  <span className="shrink-0 text-xs font-bold text-primary">Open the day →</span>
                </button>
              );
            })}
          </div>
        )}
        <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
          Paid and unpaid are not here on purpose. Xero owns that. This is only what still
          needs doing: a cleaner, a price, an invoice, or a tick.
        </p>
      </section>

      {/* ── Price holes: the money these figures cannot see ────────────────── */}
      <section className="rounded-2xl border border-amber-500/40 bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            Cleans with no price ({priceHoles.length})
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Booked work the figures above cannot count. A recurring clean with no price
            repeats the hole every week, so these are worth fixing on the property, not
            just on the one job.
          </p>
        </div>
        {priceHoles.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            Every booking in range carries a price.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {priceHoles.map((h: any) => {
              const j = h.job;
              const when = new Date(j.scheduled_date + 'T00:00:00');
              const past = j.scheduled_date < d(new Date());
              return (
                <button
                  key={j.id}
                  onClick={() => navigate(`/jobs/${j.id}`)}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">
                      {j.properties?.property_name || 'Unknown property'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {format(when, 'd MMM yyyy')}
                      {' · '}
                      {past ? 'already done' : 'booked'}
                      {' · '}
                      <span className="font-bold text-amber-400">
                        {h.kind === 'tiny' ? `priced at ${fmtExact(h.value)}, looks like a typo` : 'no price anywhere'}
                      </span>
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-bold text-primary">
                    {h.kind === 'tiny' ? 'Fix price' : 'Set price'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

    </div>
  );
}
