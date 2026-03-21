import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useXeroInvoiceSync } from '@/hooks/useXeroInvoiceSync';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, Building2, Clock, User, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';

type ViewMode = 'date' | 'property';

interface FormEntry {
  id: string;
  job_id: string | null;
  property_id: string | null;
  cleaner_id: string | null;
  second_cleaner_id: string | null;
  submitted_at: string | null;
  form_data: any;
  propertyName: string;
  cleaner1Name: string;
  cleaner2Name: string;
  timeIn: string;
  timeOut: string;
  qcResult: 'pass' | 'fail' | null;
  qcPercentage: number | null;
}

export default function FormsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('date');
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null);
  const { user, role } = useAuth();
  const navigate = useNavigate();

  // Fetch all job forms with joined data
  const { data: forms, isLoading } = useQuery({
    queryKey: ['all-job-forms', role, user?.id],
    queryFn: async () => {
      let query = supabase
        .from('job_forms')
        .select('*, jobs(property_id, scheduled_date, scheduled_time, cleaner_1_id, cleaner_2_id, properties(property_name))')
        .not('submitted_at', 'is', null)
        .order('submitted_at', { ascending: false });

      // Role filter: cleaners only see their own
      if (role === 'cleaner' && user?.id) {
        query = query.or(`cleaner_id.eq.${user.id},second_cleaner_id.eq.${user.id}`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Fetch profiles for cleaner names
  const cleanerIds = useMemo(() => {
    if (!forms) return [];
    const ids = new Set<string>();
    forms.forEach((f: any) => {
      if (f.cleaner_id) ids.add(f.cleaner_id);
      if (f.second_cleaner_id) ids.add(f.second_cleaner_id);
    });
    return Array.from(ids);
  }, [forms]);

  const { data: profiles } = useQuery({
    queryKey: ['form-profiles', cleanerIds],
    queryFn: async () => {
      if (cleanerIds.length === 0) return [];
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', cleanerIds);
      return data || [];
    },
    enabled: cleanerIds.length > 0,
  });

  // Fetch QC audits for these jobs
  const jobIds = useMemo(() => {
    if (!forms) return [];
    return forms.map((f: any) => f.job_id).filter(Boolean);
  }, [forms]);

  const { data: qcAudits } = useQuery({
    queryKey: ['form-qc-audits', jobIds],
    queryFn: async () => {
      if (jobIds.length === 0) return [];
      const { data } = await supabase
        .from('qc_audits')
        .select('job_id, result, percentage')
        .in('job_id', jobIds);
      return data || [];
    },
    enabled: jobIds.length > 0,
  });

  // Build enriched form entries
  const enrichedForms: FormEntry[] = useMemo(() => {
    if (!forms) return [];
    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p.full_name || 'Unknown']));
    const qcMap = new Map((qcAudits || []).map((q: any) => [q.job_id, q]));

    return forms.map((f: any) => {
      const job = f.jobs as any;
      const formData = (f.form_data || {}) as any;
      const qc = f.job_id ? qcMap.get(f.job_id) : null;

      return {
        id: f.id,
        job_id: f.job_id,
        property_id: f.property_id,
        cleaner_id: f.cleaner_id,
        second_cleaner_id: f.second_cleaner_id,
        submitted_at: f.submitted_at,
        form_data: formData,
        propertyName: job?.properties?.property_name || 'Unknown Property',
        cleaner1Name: f.cleaner_id ? (profileMap.get(f.cleaner_id) || 'Unknown') : '',
        cleaner2Name: f.second_cleaner_id ? (profileMap.get(f.second_cleaner_id) || '') : '',
        timeIn: formData.time_in || '',
        timeOut: formData.time_out || '',
        qcResult: qc?.result || null,
        qcPercentage: qc?.percentage || null,
      };
    });
  }, [forms, profiles, qcAudits]);

  // Group by date
  const groupedByDate = useMemo(() => {
    const groups: Record<string, FormEntry[]> = {};
    enrichedForms.forEach((f) => {
      const date = f.submitted_at ? format(parseISO(f.submitted_at), 'yyyy-MM-dd') : 'Unknown';
      if (!groups[date]) groups[date] = [];
      groups[date].push(f);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [enrichedForms]);

  // Group by property
  const groupedByProperty = useMemo(() => {
    const groups: Record<string, { name: string; forms: FormEntry[] }> = {};
    enrichedForms.forEach((f) => {
      const key = f.property_id || 'unknown';
      if (!groups[key]) groups[key] = { name: f.propertyName, forms: [] };
      groups[key].forms.push(f);
    });
    return Object.entries(groups).sort(([, a], [, b]) => a.name.localeCompare(b.name));
  }, [enrichedForms]);

  const formatDateHeader = (dateStr: string) => {
    if (dateStr === 'Unknown') return 'Unknown Date';
    return format(parseISO(dateStr), 'EEEE d MMMM yyyy');
  };

  const formatTime = (t: string) => {
    if (!t) return '--:--';
    try {
      return format(parseISO(t), 'h:mm a');
    } catch {
      return t;
    }
  };

  const renderQCBadge = (form: FormEntry) => {
    if (form.qcResult === 'pass') {
      return <Badge className="bg-primary text-primary-foreground">Pass {form.qcPercentage}%</Badge>;
    }
    if (form.qcResult === 'fail') {
      return <Badge className="bg-destructive text-destructive-foreground">Fail {form.qcPercentage}%</Badge>;
    }
    return <Badge variant="secondary" className="text-muted-foreground">No QC</Badge>;
  };

  const renderFormCard = (form: FormEntry) => (
    <div
      key={form.id}
      onClick={() => navigate(`/forms/${form.id}`)}
      className="bg-card rounded-2xl shadow-md p-4 flex items-center justify-between gap-3 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] transition-all"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-bold text-foreground truncate">{form.propertyName}</p>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <User className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {form.cleaner1Name}
            {form.cleaner2Name ? ` & ${form.cleaner2Name}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>{formatTime(form.timeIn)} → {formatTime(form.timeOut)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {renderQCBadge(form)}
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-extrabold text-primary">Forms</h1>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  // Property detail view
  if (viewMode === 'property' && selectedProperty) {
    const group = groupedByProperty.find(([key]) => key === selectedProperty);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedProperty(null)} className="text-primary font-bold text-sm">← Back</button>
          <h1 className="text-xl font-extrabold text-primary">{group?.[1].name || 'Property'}</h1>
        </div>
        <div className="space-y-3">
          {group?.[1].forms.length === 0 ? (
            <p className="text-muted-foreground text-sm p-4">No forms submitted for this property.</p>
          ) : (
            group?.[1].forms.map(renderFormCard)
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-primary">Forms</h1>

      <ToggleGroup
        type="single"
        value={viewMode}
        onValueChange={(v) => { if (v) setViewMode(v as ViewMode); }}
        className="bg-muted rounded-xl p-1 w-full"
      >
        <ToggleGroupItem value="date" className="flex-1 rounded-lg data-[state=on]:bg-card data-[state=on]:shadow-sm font-semibold text-sm">
          <Calendar className="h-4 w-4 mr-1.5" /> By Date
        </ToggleGroupItem>
        <ToggleGroupItem value="property" className="flex-1 rounded-lg data-[state=on]:bg-card data-[state=on]:shadow-sm font-semibold text-sm">
          <Building2 className="h-4 w-4 mr-1.5" /> By Property
        </ToggleGroupItem>
      </ToggleGroup>

      {enrichedForms.length === 0 ? (
        <div className="bg-card rounded-2xl shadow-md p-6 text-center">
          <p className="text-muted-foreground">No submitted forms yet.</p>
        </div>
      ) : viewMode === 'date' ? (
        <div className="space-y-6">
          {groupedByDate.map(([date, dateForms]) => (
            <div key={date}>
              <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wide mb-3">
                {formatDateHeader(date)}
              </h2>
              <div className="space-y-3">
                {dateForms.map(renderFormCard)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {groupedByProperty.map(([key, group]) => (
            <div
              key={key}
              onClick={() => setSelectedProperty(key)}
              className="bg-card rounded-2xl shadow-md p-4 flex items-center justify-between cursor-pointer hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] transition-all"
            >
              <div>
                <p className="font-bold text-foreground">{group.name}</p>
                <p className="text-sm text-muted-foreground">{group.forms.length} form{group.forms.length !== 1 ? 's' : ''}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
