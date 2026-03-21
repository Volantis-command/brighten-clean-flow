import { cn } from '@/lib/utils';
import type { CalcResult } from '@/lib/pricingCalculator';

function fmt(n: number) {
  return n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function gpColor(pct: number) {
  if (pct >= 0.4) return 'text-primary';
  if (pct >= 0.3) return 'text-orange-500';
  return 'text-destructive';
}

export default function PriceLivePanel({
  result,
  gpOverride,
  discountGp,
  onGpOverrideChange,
  onDiscountGpChange,
}: {
  result: CalcResult;
  gpOverride: string;
  discountGp: string;
  onGpOverrideChange: (v: string) => void;
  onDiscountGpChange: (v: string) => void;
}) {
  return (
    <div className="rounded-2xl border-2 border-primary/30 bg-card p-5 space-y-4">
      <div className="text-center">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Sell Price (inc GST)</p>
        <p className="text-4xl font-extrabold text-primary">${fmt(result.sellPriceIncGst)}</p>
      </div>

      <div className="space-y-1 text-sm">
        <Row label="Labour" value={result.labourCost} />
        <Row label="Linen" value={result.linenCost} />
        <Row label="Consumables" value={result.consumablesCost} />
        <div className="border-t border-border my-2" />
        <Row label="Total Cost" value={result.totalCost} bold />
        <div className="flex justify-between">
          <span className="font-semibold text-muted-foreground">GP%</span>
          <span className={cn('font-extrabold', gpColor(result.actualGpPercent))}>
            {(result.actualGpPercent * 100).toFixed(1)}%
          </span>
        </div>
        <Row label="GP$" value={result.actualGpDollars} />
        <Row label="GST" value={result.gst} />
      </div>

      <div className="space-y-3 pt-2">
        <div>
          <label className="text-xs font-semibold text-muted-foreground">GP% Override</label>
          <input
            type="number"
            value={gpOverride}
            onChange={(e) => onGpOverrideChange(e.target.value)}
            placeholder="40"
            className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground">Discount GP%</label>
          <input
            type="number"
            value={discountGp}
            onChange={(e) => onDiscountGpChange(e.target.value)}
            placeholder="e.g. 35"
            className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm"
          />
        </div>
        {result.discountedPrice != null && (
          <div className="rounded-xl bg-yellow-50 border border-yellow-200 p-3 text-sm space-y-1">
            <p className="font-bold text-foreground">
              Discounted Price: <span className="text-primary">${fmt(result.discountedPrice)}</span> incl GST
            </p>
            <p className="text-muted-foreground">
              GP$ lost: <span className="text-destructive font-semibold">${fmt(result.gpLost || 0)}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={cn('text-muted-foreground', bold && 'font-bold text-foreground')}>{label}</span>
      <span className={cn('font-semibold', bold && 'font-extrabold text-foreground')}>${fmt(value)}</span>
    </div>
  );
}
