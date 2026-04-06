import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, differenceInHours, parseISO, isToday } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ArrowRight, ChevronRight, Clock, Plus, Search, Send, DollarSign, ClipboardList, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';

type PipelineStatus = 'new_enquiry' | 'quote_sent' | 'accepted' | 'scheduled' | 'in_progress' | 'complete';

const PIPELINE_COLUMNS: { key: PipelineStatus; label: string }[] = [
  { key: 'new_enquiry', label: 'New Enquiry' },
  { key: 'quote_sent', label: 'Quote Sent' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'complete', label: 'Complete' },
];

export default function OperationsDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const now = new Date();
  const todayStr = format(now, 'yyyy-MM-dd');

  // Alerts
  const { data: alerts = [] } = useQuery({
    queryKey: ['ops-alerts'],
    queryFn: async () => {
      const alertItems: { type: string; color: string; icon: string; message: string; link?: string }[] = [];

      // Quotes not followed up (>24hrs, still form_submitted)
      const { data: staleQuotes } = await supabase
        .from('quote_requests')
        .select('id, first_name, last_name, form_submitted_at')
        .eq('status', 'form_submitted');
      (staleQuotes || []).forEach((q: any) => {
        if (q.form_submitted_at && differenceInHours(now, new Date(q.form_submitted_at)) > 24) {
          alertItems.push({ type: 'stale_quote', color: 'bg-destructive', icon: '🔴', message: `Quote not followed up: ${q.first_name} ${q.last_name}` });
        }
      });

      // Client went quiet (accepted >48hrs, no booking)
      const { data: quietClients } = await supabase
        .from('quote_requests')
        .select('id, first_name, last_name, accepted_at')
        .eq('status', 'accepted');
      (quietClients || []).forEach((q: any) => {
        if (q.accepted_at && differenceInHours(now, new Date(q.accepted_at)) > 48) {
          alertItems.push({ type: 'quiet_client', color: 'bg-orange-500', icon: '🟠', message: `Client went quiet: ${q.first_name} ${q.last_name}` });
        }
      });

      // Clean starting soon (within 2 hours)
      const { data: soonJobs } = await supabase
        .from('jobs')
        .select('id, scheduled_time, property_id, properties(property_name)')
        .eq('scheduled_date', todayStr)
        .in('status', ['scheduled', 'confirmed']);
      (soonJobs || []).forEach((j: any) => {
        if (j.scheduled_time) {
          const [h, m] = j.scheduled_time.split(':').map(Number);
          const jobTime = new Date();
          jobTime.setHours(h, m, 0, 0);
          const diff = (jobTime.getTime() - now.getTime()) / (1000 * 60 * 60);
          if (diff > 0 && diff <= 2) {
            alertItems.push({ type: 'soon', color: 'bg-blue-500', icon: '🔵', message: `Clean starting soon: ${(j as any).properties?.property_name || 'Property'}`, link: `/jobs/${j.id}` });
          }
        }
      });

      // Completed awaiting review
      const { data: awaitingReview } = await supabase
        .from('jobs')
        .select('id, property_id, properties(property_name)')
        .eq('status', 'completed')
        .is('feedback_score', null)
        .limit(5);
      (awaitingReview || []).forEach((j: any) => {
        alertItems.push({ type: 'review', color: 'bg-green-500', icon: '🟢', message: `Awaiting review: ${(j as any).properties?.property_name || 'Property'}`, link: `/jobs/${j.id}` });
      });

      return alertItems;
    },
  });

  // Quick stats
  const { data: stats } = useQuery({
    queryKey: ['ops-stats'],
    queryFn: async () => {
      // This week revenue
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const { data: weekJobs } = await supabase
        .from('jobs')
        .select('price_inc_gst')
        .in('status', ['completed', 'complete'])
        .gte('scheduled_date', format(weekStart, 'yyyy-MM-dd'));
      const weekRevenue = (weekJobs || []).reduce((s: number, j: any) => s + (j.price_inc_gst || 0), 0);

      // Outstanding quotes
      const { count: outstandingQuotes } = await supabase
        .from('quote_requests')
        .select('id', { count: 'exact', head: true })
        .in('status', ['form_submitted', 'quote_sent']);

      // Cleans today
      const { count: cleansToday } = await supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('scheduled_date', todayStr);

      // Avg score
      const { data: scores } = await supabase
        .from('job_feedback')
        .select('score')
        .not('score', 'is', null)
        .limit(100);
      const avgScore = (scores && scores.length > 0)
        ? (scores.reduce((s: number, f: any) => s + f.score, 0) / scores.length).toFixed(1)
        : '—';

      return { weekRevenue, outstandingQuotes: outstandingQuotes || 0, cleansToday: cleansToday || 0, avgScore };
    },
  });

  // Pipeline data
  const { data: pipeline = {} as Record<PipelineStatus, any[]> } = useQuery({
    queryKey: ['ops-pipeline'],
    queryFn: async () => {
      const result: Record<PipelineStatus, any[]> = {
        new_enquiry: [], quote_sent: [], accepted: [], scheduled: [], in_progress: [], complete: [],
      };

      // Quote requests
      const { data: qrs } = await supabase
        .from('quote_requests')
        .select('*')
        .in('status', ['form_submitted', 'quote_sent', 'accepted', 'booking_requested'])
        .order('created_at', { ascending: false });

      (qrs || []).forEach((q: any) => {
        if (q.status === 'form_submitted') result.new_enquiry.push(q);
        else if (q.status === 'quote_sent') result.quote_sent.push(q);
        else if (['accepted', 'booking_requested'].includes(q.status)) result.accepted.push(q);
      });

      // Jobs
      const { data: jobs } = await supabase
        .from('jobs')
        .select('*, properties(property_name, address)')
        .in('status', ['scheduled', 'confirmed', 'in_progress', 'completed'])
        .gte('scheduled_date', format(new Date(Date.now() - 7 * 86400000), 'yyyy-MM-dd'))
        .order('scheduled_date', { ascending: false })
        .limit(100);

      (jobs || []).forEach((j: any) => {
        if (['scheduled', 'confirmed'].includes(j.status)) result.scheduled.push(j);
        else if (j.status === 'in_progress') result.in_progress.push(j);
        else if (j.status === 'completed') result.complete.push(j);
      });

      return result;
    },
  });

  return (
    <div className="space-y-6">
      {/* Alerts strip */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.slice(0, 5).map((a, i) => (
            <div key={i} onClick={() => a.link && navigate(a.link)}
              className={cn('rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer transition-colors',
                a.color === 'bg-destructive' ? 'bg-destructive/10 border border-destructive/30 hover:bg-destructive/15' :
                a.color === 'bg-orange-500' ? 'bg-orange-50 border border-orange-200 hover:bg-orange-100' :
                a.color === 'bg-blue-500' ? 'bg-blue-50 border border-blue-200 hover:bg-blue-100' :
                'bg-green-50 border border-green-200 hover:bg-green-100')}>
              <span className="text-sm">{a.icon}</span>
              <p className="text-sm font-semibold text-foreground flex-1">{a.message}</p>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          ))}
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile icon={<DollarSign className="h-5 w-5" />} label="This Week Revenue" value={`$${(stats?.weekRevenue || 0).toLocaleString()}`} />
        <StatTile icon={<ClipboardList className="h-5 w-5" />} label="Outstanding Quotes" value={`${stats?.outstandingQuotes || 0}`} />
        <StatTile icon={<Clock className="h-5 w-5" />} label="Cleans Today" value={`${stats?.cleansToday || 0}`} />
        <StatTile icon={<Star className="h-5 w-5" />} label="Avg Brightly Score" value={`${stats?.avgScore || '—'}`} />
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" className="rounded-xl h-12 gap-2" onClick={() => navigate('/quoting')}>
          <Plus className="h-4 w-4" /> New Enquiry
        </Button>
        <Button variant="outline" className="rounded-xl h-12 gap-2" onClick={() => navigate('/quoting')}>
          <Send className="h-4 w-4" /> Send SMS Quote Link
        </Button>
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search clients…" className="h-12 rounded-xl pl-10" />
          </div>
        </div>
      </div>

      {/* Pipeline Kanban */}
      <div>
        <h2 className="text-xl font-bold text-primary mb-4">Pipeline</h2>
        <ScrollArea className="w-full">
          <div className="flex gap-4 pb-4" style={{ minWidth: PIPELINE_COLUMNS.length * 280 }}>
            {PIPELINE_COLUMNS.map(col => (
              <div key={col.key} className="w-[270px] shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-foreground">{col.label}</h3>
                  <Badge variant="secondary" className="text-xs">{(pipeline[col.key] || []).length}</Badge>
                </div>
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {(pipeline[col.key] || []).map((item: any) => (
                    <PipelineCard key={item.id} item={item} column={col.key} navigate={navigate} />
                  ))}
                  {(pipeline[col.key] || []).length === 0 && (
                    <div className="bg-muted/50 rounded-xl p-4 text-center">
                      <p className="text-xs text-muted-foreground">No items</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </div>
  );
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 space-y-1">
      <div className="flex items-center gap-2 text-primary">{icon}</div>
      <p className="text-xl font-extrabold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function PipelineCard({ item, column, navigate }: { item: any; column: PipelineStatus; navigate: (path: string) => void }) {
  const isQuoteRequest = ['new_enquiry', 'quote_sent', 'accepted'].includes(column);

  if (isQuoteRequest) {
    const name = [item.first_name, item.last_name].filter(Boolean).join(' ');
    const daysWaiting = item.form_submitted_at
      ? Math.floor(differenceInHours(new Date(), new Date(item.form_submitted_at)) / 24)
      : 0;

    return (
      <div className={cn('bg-card rounded-xl border p-3 cursor-pointer hover:shadow-md transition-shadow',
        column === 'quote_sent' && daysWaiting >= 2 ? 'border-destructive/50' :
        column === 'quote_sent' && daysWaiting >= 1 ? 'border-orange-300' : 'border-border'
      )} onClick={() => navigate('/quoting')}>
        <p className="text-sm font-bold text-foreground truncate">{name || 'Unknown'}</p>
        <p className="text-xs text-muted-foreground truncate">{item.address || item.clean_type}</p>
        {column === 'quote_sent' && daysWaiting > 0 && (
          <p className="text-xs text-orange-600 font-semibold mt-1">{daysWaiting}d waiting</p>
        )}
        {item.clean_type && <Badge variant="secondary" className="text-[10px] mt-1">{item.clean_type}</Badge>}
      </div>
    );
  }

  // Job card
  const propName = (item as any).properties?.property_name || 'Property';
  return (
    <div className="bg-card rounded-xl border border-border p-3 cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => navigate(`/jobs/${item.id}`)}>
      <p className="text-sm font-bold text-foreground truncate">{propName}</p>
      <p className="text-xs text-muted-foreground">
        {item.scheduled_date ? format(new Date(item.scheduled_date + 'T00:00:00'), 'EEE, d MMM') : ''}
        {item.scheduled_time ? ` · ${item.scheduled_time.slice(0, 5)}` : ''}
      </p>
      {column === 'in_progress' && (
        <div className="flex items-center gap-1 mt-1">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-green-600 font-semibold">Live</span>
        </div>
      )}
      {item.invoice_status && column === 'complete' && (
        <Badge variant="secondary" className="text-[10px] mt-1">{item.invoice_status}</Badge>
      )}
    </div>
  );
}
