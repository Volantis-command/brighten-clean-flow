import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAlertsData, AlertGroup, AlertItem } from '@/hooks/useAlertsData';
import { ChevronDown, ChevronUp, X, ExternalLink } from 'lucide-react';

/* ── Dismissal persistence ──────────────────────────────────────────────── */
// Dismissals are stored in localStorage keyed by alert ID.
// Each dismissal expires after 24 hours so the alert resurfaces the
// next working day if the underlying issue hasn't been resolved.
// (If the issue WAS resolved — e.g. an invoice was raised — the item
// simply won't appear in the DB query anymore, so no dismissal is needed.)

const DISMISS_KEY = 'brightly_alert_dismissals';
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getDismissals(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}');
  } catch { return {}; }
}

function saveDismissal(id: string) {
  const current = getDismissals();
  current[id] = Date.now();
  // Prune dismissals older than 7 days to keep storage clean
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const k of Object.keys(current)) {
    if (current[k] < cutoff) delete current[k];
  }
  localStorage.setItem(DISMISS_KEY, JSON.stringify(current));
}

function isDismissed(id: string): boolean {
  const d = getDismissals();
  return !!d[id] && Date.now() - d[id] < DISMISS_TTL_MS;
}

/* ── Component ──────────────────────────────────────────────────────────── */

/**
 * Alert groups rendered as clickable boxes. Each box shows the group name
 * and the count of active (non-dismissed) items. Clicking a box expands it
 * to reveal the individual items. Each item has a dismiss button that
 * persists to localStorage for 24 hours so the alert doesn't immediately
 * bounce back on the next 60-second refetch.
 */
export function AlertsPanel() {
  const navigate = useNavigate();
  const { groups } = useAlertsData();

  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  // Local override map so dismissals take effect immediately without waiting
  // for the next DB refetch cycle.
  const [localDismissed, setLocalDismissed] = useState<Record<string, boolean>>({});

  const dismiss = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    saveDismissal(id);
    setLocalDismissed(prev => ({ ...prev, [id]: true }));
  }, []);

  // Filter out dismissed items from each group
  const visibleGroups: AlertGroup[] = groups
    .map(g => ({
      ...g,
      items: g.items.filter(
        (item: AlertItem) => !localDismissed[item.id] && !isDismissed(item.id)
      ),
    }))
    .filter(g => g.items.length > 0);

  if (visibleGroups.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-muted/30 p-4 flex items-center gap-3">
        <span className="text-2xl">✅</span>
        <div>
          <p className="font-bold text-sm text-foreground">All clear</p>
          <p className="text-xs text-muted-foreground">No alerts right now — great work.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-0.5">
        Alerts <span className="font-normal normal-case">· tap to dismiss</span>
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {visibleGroups.map((group) => {
          const isExpanded = expandedGroup === group.key;
          const borderStyles: Record<string, string> = {
            'border-l-[hsl(0,84%,60%)]': 'border-red-400/50 bg-red-500/5',
            'border-l-[hsl(25,95%,53%)]': 'border-orange-400/50 bg-orange-500/5',
            'border-l-[hsl(48,96%,53%)]': 'border-yellow-400/50 bg-yellow-500/5',
            'border-l-muted-foreground/30': 'border-border bg-muted/30',
          };
          const cardStyle = borderStyles[group.borderColor] || 'border-border bg-muted/30';

          return (
            <div key={group.key} className="col-span-1">
              <button
                onClick={() => setExpandedGroup(isExpanded ? null : group.key)}
                className={`w-full rounded-xl border p-3 text-left transition-all hover:scale-[1.01] ${cardStyle}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{group.icon}</span>
                    <span className="text-xl font-extrabold text-foreground">{group.items.length}</span>
                  </div>
                  {isExpanded
                    ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                    : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                </div>
                <p className="text-xs font-semibold text-foreground mt-1 leading-tight">{group.label}</p>
              </button>
            </div>
          );
        })}
      </div>

      {/* Expanded group items */}
      {expandedGroup && (() => {
        const group = visibleGroups.find(g => g.key === expandedGroup);
        if (!group) return null;
        return (
          <div className="space-y-1.5 pt-1">
            {group.items.map((item: AlertItem) => (
              <div
                key={item.id}
                className="flex items-start gap-2 bg-card rounded-xl border border-border p-3 group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{item.title}</p>
                  {item.subtitle && (
                    <p className="text-xs text-muted-foreground mt-0.5">{item.subtitle}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {item.path && (
                    <button
                      onClick={() => navigate(item.path!)}
                      className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title="Open"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={(e) => dismiss(item.id, e)}
                    className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Dismiss for 24 hours"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
