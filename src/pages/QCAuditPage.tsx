import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCleanersList } from '@/hooks/useCleanersList';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ArrowLeft, CalendarIcon, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type ScoreValue = 0 | 1 | 2 | null;

interface ScoreItem {
  key: string;
  label: string;
  description: string;
  hasNA?: boolean;
}

interface ScoredItem {
  key: string;
  score: ScoreValue;
  isNA: boolean;
}

const KITCHEN_ITEMS: ScoreItem[] = [
  { key: 'kitchen_benches', label: 'Benches & surfaces', description: 'Clear, wiped, no grease or crumbs, dry and streak-free' },
  { key: 'kitchen_stovetop', label: 'Stovetop & oven', description: 'Burners and grates clean. No carbon buildup' },
  { key: 'kitchen_microwave', label: 'Microwave', description: 'Interior clean, no splatter. Turntable clean' },
  { key: 'kitchen_sink', label: 'Sink & taps', description: 'Sink polished, no water spots. Taps streak-free' },
  { key: 'kitchen_fridge', label: 'Fridge', description: 'Wiped interior, no odour, no leftover food' },
  { key: 'kitchen_appliances', label: 'Appliances', description: 'Wiped clean, no crumbs. Exterior polished' },
  { key: 'kitchen_floor', label: 'Floor', description: 'Swept and mopped. No residue' },
];

const BATHROOM_ITEMS: ScoreItem[] = [
  { key: 'toilet', label: 'Toilet', description: 'No staining, sanitised. Seat and lid wiped' },
  { key: 'shower', label: 'Shower/bath & glass', description: 'Tiles and glass sparkling. No soap scum' },
  { key: 'sink_vanity', label: 'Sink & vanity', description: 'Clean basin, taps polished' },
  { key: 'mirror', label: 'Mirror', description: 'No smears, watermarks, or fingerprints' },
  { key: 'floor', label: 'Floor', description: 'Mopped. Grout clean. No hair or wet patches' },
  { key: 'consumables', label: 'Consumables restocked', description: 'Full roll + 1 spare TP. Soap restocked' },
];

const BEDROOM_ITEMS: ScoreItem[] = [
  { key: 'linen', label: 'Linen', description: 'Tight, smooth, symmetrical. Pillows plumped' },
  { key: 'surfaces', label: 'Surfaces dusted', description: 'Bedside tables, sills, skirting, lamps' },
  { key: 'under_bed', label: 'Under bed', description: 'Cleared and vacuumed. No dust or debris' },
  { key: 'mirrors', label: 'Mirrors & artwork', description: 'No smears or fingerprints' },
  { key: 'floor', label: 'Floor', description: 'Vacuumed all areas including corners' },
];

const LIVING_ITEMS: ScoreItem[] = [
  { key: 'living_soft', label: 'Soft furnishings', description: 'Cushions plumped. Blankets folded' },
  { key: 'living_hard', label: 'Hard surfaces', description: 'Coffee tables, shelves, TV unit wiped' },
  { key: 'living_entertainment', label: 'Entertainment area', description: 'TV screen wiped. Remotes placed neatly' },
  { key: 'living_floor', label: 'Floor', description: 'Vacuumed and/or mopped. Edges clear' },
  { key: 'living_outdoor', label: 'Outdoor areas', description: 'Furniture wiped, floor swept', hasNA: true },
];

const PRESENTATION_ITEMS: ScoreItem[] = [
  { key: 'pres_photos', label: 'Photo documentation', description: 'All rooms photographed. Photos clear' },
  { key: 'pres_guest_ready', label: 'Guest-ready standard', description: 'Property feels hotel-quality' },
  { key: 'pres_linen', label: 'Linen handover', description: 'Dirty linen bagged. Fresh linen correct' },
];

function ScoreButton({ value, current, onClick, label }: { value: number; current: ScoreValue; onClick: () => void; label: string }) {
  const colors: Record<number, string> = {
    2: current === 2 ? 'bg-primary text-primary-foreground ring-2 ring-primary' : 'bg-muted text-muted-foreground hover:bg-primary/20',
    1: current === 1 ? 'bg-accent text-accent-foreground ring-2 ring-accent' : 'bg-muted text-muted-foreground hover:bg-accent/20',
    0: current === 0 ? 'bg-destructive text-destructive-foreground ring-2 ring-destructive' : 'bg-muted text-muted-foreground hover:bg-destructive/20',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 h-12 rounded-xl font-bold text-lg transition-all ${colors[value]}`}
    >
      {label}
    </button>
  );
}

function ScoreRow({ item, scored, onScore, onNA }: { item: ScoreItem; scored: ScoredItem; onScore: (v: ScoreValue) => void; onNA: () => void }) {
  return (
    <div className={`p-4 rounded-xl border transition-colors ${scored.isNA ? 'border-muted bg-muted/30 opacity-60' : 'border-border bg-card'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="font-bold text-foreground text-sm">{item.label}</p>
          <p className="text-xs text-muted-foreground">{item.description}</p>
        </div>
        {item.hasNA && (
          <button
            type="button"
            onClick={onNA}
            className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-full transition-colors ${scored.isNA ? 'bg-secondary text-secondary-foreground' : 'bg-muted text-muted-foreground hover:bg-secondary/50'}`}
          >
            N/A
          </button>
        )}
      </div>
      {!scored.isNA && (
        <div className="flex gap-2">
          <ScoreButton value={2} current={scored.score} onClick={() => onScore(2)} label="2" />
          <ScoreButton value={1} current={scored.score} onClick={() => onScore(1)} label="1" />
          <ScoreButton value={0} current={scored.score} onClick={() => onScore(0)} label="0" />
        </div>
      )}
    </div>
  );
}

function SectionScoreSummary({ label, scored, maxPerItem }: { label: string; scored: ScoredItem[]; maxPerItem: number }) {
  const active = scored.filter(s => !s.isNA);
  const total = active.reduce((sum, s) => sum + (s.score ?? 0), 0);
  const max = active.length * maxPerItem;
  return (
    <div className="flex items-center justify-between text-sm font-bold px-2 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{total} / {max}</span>
    </div>
  );
}

export default function QCAuditPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: cleaners = [] } = useCleanersList();

  const [propertyId, setPropertyId] = useState('');
  const [auditDate, setAuditDate] = useState<Date>(new Date());
  const [cleanerId, setCleanerId] = useState('');
  const [jobId, setJobId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Feedback
  const [positiveFeedback, setPositiveFeedback] = useState('');
  const [improvementFeedback, setImprovementFeedback] = useState('');
  const [issuesText, setIssuesText] = useState('');
  const [cleanerNotified, setCleanerNotified] = useState(false);
  const [reCleanDate, setReCleanDate] = useState<Date | undefined>();
  const [inspectorConfirmed, setInspectorConfirmed] = useState(false);

  // Properties
  const { data: properties = [] } = useQuery({
    queryKey: ['qc-properties'],
    queryFn: async () => {
      const { data, error } = await supabase.from('properties').select('id, property_name, bedrooms, bathrooms').order('property_name');
      if (error) throw error;
      return data || [];
    },
  });

  // Jobs for selected property
  const { data: jobs = [] } = useQuery({
    queryKey: ['qc-jobs', propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data, error } = await supabase
        .from('jobs')
        .select('id, scheduled_date, scheduled_time, status')
        .eq('property_id', propertyId)
        .eq('status', 'complete')
        .order('scheduled_date', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!propertyId,
  });

  const selectedProperty = properties.find((p: any) => p.id === propertyId);
  const bathroomCount = selectedProperty?.bathrooms || 1;
  const bedroomCount = selectedProperty?.bedrooms || 1;

  // Inspector profile
  const { data: inspectorProfile } = useQuery({
    queryKey: ['inspector-profile', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from('profiles').select('full_name').eq('id', user.id).single();
      return data;
    },
    enabled: !!user,
  });

  // Build all score items
  const allItems = useMemo(() => {
    const items: { sectionKey: string; sectionLabel: string; items: ScoreItem[] }[] = [
      { sectionKey: 'kitchen', sectionLabel: 'Kitchen', items: KITCHEN_ITEMS },
    ];
    for (let i = 0; i < bathroomCount; i++) {
      items.push({
        sectionKey: `bathroom_${i}`,
        sectionLabel: `Bathroom ${i + 1}`,
        items: BATHROOM_ITEMS.map(it => ({ ...it, key: `bath${i}_${it.key}` })),
      });
    }
    for (let i = 0; i < bedroomCount; i++) {
      items.push({
        sectionKey: `bedroom_${i}`,
        sectionLabel: `Bedroom ${i + 1}`,
        items: BEDROOM_ITEMS.map(it => ({ ...it, key: `bed${i}_${it.key}` })),
      });
    }
    items.push({ sectionKey: 'living', sectionLabel: 'Living Areas', items: LIVING_ITEMS });
    items.push({ sectionKey: 'presentation', sectionLabel: 'Overall Presentation', items: PRESENTATION_ITEMS });
    return items;
  }, [bathroomCount, bedroomCount]);

  // Scores state
  const [scores, setScores] = useState<Record<string, ScoredItem>>({});

  const getScored = (key: string): ScoredItem => scores[key] || { key, score: null, isNA: false };

  const setScore = (key: string, value: ScoreValue) => {
    setScores(prev => ({ ...prev, [key]: { key, score: value, isNA: false } }));
  };

  const toggleNA = (key: string) => {
    setScores(prev => {
      const current = prev[key] || { key, score: null, isNA: false };
      return { ...prev, [key]: { ...current, isNA: !current.isNA, score: null } };
    });
  };

  // Calculate totals
  const sectionTotals = useMemo(() => {
    return allItems.map(section => {
      const sectionScores = section.items.map(it => getScored(it.key));
      const active = sectionScores.filter(s => !s.isNA);
      const total = active.reduce((sum, s) => sum + (s.score ?? 0), 0);
      const max = active.length * 2;
      return { label: section.sectionLabel, total, max };
    });
  }, [allItems, scores]);

  const grandTotal = sectionTotals.reduce((s, t) => s + t.total, 0);
  const grandMax = sectionTotals.reduce((s, t) => s + t.max, 0);
  const percentage = grandMax > 0 ? Math.round((grandTotal / grandMax) * 100) : 0;
  const result = percentage >= 80 ? 'pass' : 'fail';

  // Failed items (score = 0)
  const failedItems = useMemo(() => {
    const failed: { label: string; section: string }[] = [];
    allItems.forEach(section => {
      section.items.forEach(item => {
        const s = getScored(item.key);
        if (s.score === 0 && !s.isNA) {
          failed.push({ label: item.label, section: section.sectionLabel });
        }
      });
    });
    return failed;
  }, [allItems, scores]);

  // Validation
  const allScored = useMemo(() => {
    return allItems.every(section =>
      section.items.every(item => {
        const s = getScored(item.key);
        return s.isNA || s.score !== null;
      })
    );
  }, [allItems, scores]);

  const canSubmit = propertyId && cleanerId && allScored && inspectorConfirmed && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !user) return;
    setSubmitting(true);
    try {
      const scoresData: Record<string, any> = {};
      Object.entries(scores).forEach(([key, val]) => {
        scoresData[key] = { score: val.score, isNA: val.isNA };
      });

      const { error } = await supabase.from('qc_audits').insert({
        property_id: propertyId,
        job_id: jobId || null,
        inspector_id: user.id,
        cleaner_id: cleanerId,
        audit_date: format(auditDate, 'yyyy-MM-dd'),
        scores: scoresData,
        total_score: grandTotal,
        max_score: grandMax,
        percentage,
        result,
        issues_text: issuesText || null,
        positive_feedback: positiveFeedback || null,
        improvement_feedback: improvementFeedback || null,
        action_required: result === 'fail',
        cleaner_notified: cleanerNotified,
        re_clean_date: reCleanDate ? format(reCleanDate, 'yyyy-MM-dd') : null,
      } as any);

      if (error) throw error;

      // Notify cleaner
      await supabase.from('notifications').insert({
        user_id: cleanerId,
        message: `QC Audit ${result === 'pass' ? 'PASSED ✅' : 'FAILED ❌'} — ${selectedProperty?.property_name || 'Property'} (${percentage}%)`,
        type: 'qc_audit',
      });

      // Notify admins
      const { data: adminRoles } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
      if (adminRoles) {
        const adminNotifs = adminRoles
          .filter(r => r.user_id !== user.id)
          .map(r => ({
            user_id: r.user_id,
            message: `QC Audit submitted for ${selectedProperty?.property_name || 'Property'} — ${result.toUpperCase()} (${percentage}%)`,
            type: 'qc_audit',
          }));
        if (adminNotifs.length > 0) {
          await supabase.from('notifications').insert(adminNotifs);
        }
      }

      // Fire-and-forget Google Drive sync — we need the inserted audit ID
      // Re-fetch the latest audit for this property to get the ID
      const { data: latestAudit } = await supabase
        .from("qc_audits")
        .select("id")
        .eq("property_id", propertyId)
        .eq("inspector_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (latestAudit) {
        syncToDrive("sync_qc_audit", { audit_id: latestAudit.id });
      }

      toast.success(`QC Audit submitted — ${result.toUpperCase()} (${percentage}%)`);
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit audit');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-extrabold text-primary">QC Audit</h1>
      </div>

      {/* Scoring Legend */}
      <div className="flex items-center gap-4 text-xs font-bold">
        <span className="flex items-center gap-1"><span className="w-6 h-6 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">2</span> Excellent</span>
        <span className="flex items-center gap-1"><span className="w-6 h-6 rounded-lg bg-accent text-accent-foreground flex items-center justify-center">1</span> Acceptable</span>
        <span className="flex items-center gap-1"><span className="w-6 h-6 rounded-lg bg-destructive text-destructive-foreground flex items-center justify-center">0</span> Fail</span>
      </div>

      {/* Form Header */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Audit Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Property</Label>
            <Select value={propertyId} onValueChange={(v) => { setPropertyId(v); setJobId(''); }}>
              <SelectTrigger><SelectValue placeholder="Select property" /></SelectTrigger>
              <SelectContent>
                {properties.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.property_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Date of Audit</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !auditDate && 'text-muted-foreground')}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(auditDate, 'PPP')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={auditDate} onSelect={(d) => d && setAuditDate(d)} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>Inspector</Label>
            <div className="h-10 flex items-center px-3 rounded-md border border-border bg-muted text-sm font-medium text-foreground">
              {inspectorProfile?.full_name || 'Loading…'}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Cleaner Being Audited</Label>
            <Select value={cleanerId} onValueChange={setCleanerId}>
              <SelectTrigger><SelectValue placeholder="Select cleaner" /></SelectTrigger>
              <SelectContent>
                {cleaners.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.full_name || c.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {propertyId && jobs.length > 0 && (
            <div className="space-y-2">
              <Label>Job Being Audited</Label>
              <Select value={jobId} onValueChange={setJobId}>
                <SelectTrigger><SelectValue placeholder="Select job (optional)" /></SelectTrigger>
                <SelectContent>
                  {jobs.map((j: any) => (
                    <SelectItem key={j.id} value={j.id}>
                      {format(new Date(j.scheduled_date + 'T00:00:00'), 'dd MMM yyyy')} {j.scheduled_time?.slice(0, 5) || ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Score Sections */}
      {propertyId && allItems.map(section => (
        <Card key={section.sectionKey}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{section.sectionLabel}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {section.items.map(item => (
              <ScoreRow
                key={item.key}
                item={item}
                scored={getScored(item.key)}
                onScore={(v) => setScore(item.key, v)}
                onNA={() => toggleNA(item.key)}
              />
            ))}
            <SectionScoreSummary
              label={`${section.sectionLabel} Total`}
              scored={section.items.map(it => getScored(it.key))}
              maxPerItem={2}
            />
          </CardContent>
        </Card>
      ))}

      {/* Score Summary */}
      {propertyId && (
        <Card className={result === 'pass' ? 'border-primary' : 'border-destructive'}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Score Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sectionTotals.map((s, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{s.label}</span>
                <span className="font-bold text-foreground">{s.total} / {s.max}</span>
              </div>
            ))}
            <div className="border-t border-border pt-3 flex justify-between text-base font-extrabold">
              <span>TOTAL</span>
              <span>{grandTotal} / {grandMax}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-extrabold text-foreground">{percentage}%</span>
              <span className={`text-xl font-extrabold px-5 py-2 rounded-full flex items-center gap-2 ${result === 'pass' ? 'bg-primary text-primary-foreground' : 'bg-destructive text-destructive-foreground'}`}>
                {result === 'pass' ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                {result.toUpperCase()}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Failed Items */}
      {failedItems.length > 0 && (
        <Card className="border-destructive">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-destructive">Issues Requiring Immediate Action</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {failedItems.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <XCircle className="h-4 w-4 text-destructive shrink-0" />
                <span className="text-foreground font-medium">{f.section} — {f.label}</span>
              </div>
            ))}
            <div className="pt-2">
              <Label>Additional Notes</Label>
              <Textarea
                value={issuesText}
                onChange={(e) => setIssuesText(e.target.value)}
                placeholder="Add notes about failed items…"
                className="mt-1"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Feedback */}
      {propertyId && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Feedback for Cleaner</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Positive Feedback</Label>
              <Textarea value={positiveFeedback} onChange={(e) => setPositiveFeedback(e.target.value)} placeholder="What was done well…" />
            </div>
            <div className="space-y-2">
              <Label>Areas to Improve</Label>
              <Textarea value={improvementFeedback} onChange={(e) => setImprovementFeedback(e.target.value)} placeholder="What needs improvement…" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sign-off */}
      {propertyId && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Sign-Off</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="inspector-confirm" className="cursor-pointer">Inspector confirms audit is complete</Label>
              <Switch id="inspector-confirm" checked={inspectorConfirmed} onCheckedChange={setInspectorConfirmed} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="cleaner-notified" className="cursor-pointer">Cleaner notified</Label>
              <Switch id="cleaner-notified" checked={cleanerNotified} onCheckedChange={setCleanerNotified} />
            </div>
            {result === 'fail' && (
              <div className="space-y-2">
                <Label>Re-clean Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !reCleanDate && 'text-muted-foreground')}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {reCleanDate ? format(reCleanDate, 'PPP') : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={reCleanDate} onSelect={setReCleanDate} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Submit */}
      <Button
        className="w-full h-14 text-lg font-extrabold"
        disabled={!canSubmit}
        onClick={handleSubmit}
      >
        {submitting ? 'Submitting…' : 'Submit QC Audit'}
      </Button>
    </div>
  );
}
