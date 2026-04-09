import { useState } from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, Star } from 'lucide-react';
import CleanerProfileChip from './CleanerProfileChip';

interface CleanHistoryListProps {
  jobs: any[];
  properties: any[];
  cleanerProfiles: any[];
  feedback: any[];
  propertyFilter?: string;
  onPropertyFilterChange?: (id: string) => void;
}

function statusBadge(status: string) {
  if (status === 'complete' || status === 'completed')
    return { label: 'Completed', cls: 'bg-brightly/10 text-brightly' };
  if (['scheduled', 'confirmed'].includes(status))
    return { label: 'Scheduled', cls: 'bg-blue-100 text-blue-800' };
  if (status === 'in_progress')
    return { label: 'In Progress', cls: 'bg-yellow-100 text-yellow-800' };
  if (status === 'cancelled')
    return { label: 'Cancelled', cls: 'bg-red-100 text-red-800' };
  return { label: status, cls: 'bg-muted text-muted-foreground' };
}

export default function CleanHistoryList({
  jobs,
  properties,
  cleanerProfiles,
  feedback,
  propertyFilter,
  onPropertyFilterChange,
}: CleanHistoryListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = propertyFilter && propertyFilter !== 'all'
    ? jobs.filter((j) => j.property_id === propertyFilter)
    : jobs;

  const getPropertyName = (propId: string) => {
    const p = properties.find((pr: any) => pr.id === propId);
    return p ? (p.property_name || p.address) : 'Property';
  };

  const getCleanerName = (id: string) => {
    const c = cleanerProfiles.find((p: any) => p.id === id);
    return c?.full_name?.split(' ')[0] || null;
  };

  const getFeedbackScore = (jobId: string) => {
    const fb = feedback.find((f: any) => f.job_id === jobId);
    return fb?.score || null;
  };

  if (filtered.length === 0) {
    return <p className="text-muted-foreground text-sm text-center py-8">No cleans found.</p>;
  }

  return (
    <div className="space-y-3">
      {properties.length > 1 && onPropertyFilterChange && (
        <div className="flex gap-2 flex-wrap mb-2">
          <button
            onClick={() => onPropertyFilterChange('all')}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
              !propertyFilter || propertyFilter === 'all'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground border-border'
            }`}
          >
            All
          </button>
          {properties.map((p: any) => (
            <button
              key={p.id}
              onClick={() => onPropertyFilterChange(p.id)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                propertyFilter === p.id
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-muted-foreground border-border'
              }`}
            >
              {p.property_name || p.address}
            </button>
          ))}
        </div>
      )}

      {filtered.slice(0, 50).map((job: any) => {
        const st = statusBadge(job.status);
        const cleanerName = job.cleaner_1_id ? getCleanerName(job.cleaner_1_id) : null;
        const score = getFeedbackScore(job.id);
        const isExpanded = expandedId === job.id;

        return (
          <div key={job.id} className="bg-card rounded-2xl border border-border/50 overflow-hidden">
            <button
              onClick={() => setExpandedId(isExpanded ? null : job.id)}
              className="w-full p-4 text-left"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm text-foreground">
                    {format(new Date(job.scheduled_date + 'T00:00:00'), 'EEE, dd MMM yyyy')}
                    {job.scheduled_time ? ` at ${job.scheduled_time.slice(0, 5)}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {getPropertyName(job.property_id)}
                    {cleanerName ? ` — ${cleanerName}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {score && (
                    <div className="flex items-center gap-1 text-accent">
                      <Star className="w-3.5 h-3.5 fill-current" />
                      <span className="text-xs font-bold">{score}/5</span>
                    </div>
                  )}
                  {job.price_inc_gst && (
                    <span className="text-xs font-bold text-foreground">${Number(job.price_inc_gst).toFixed(2)}</span>
                  )}
                  <Badge className={`${st.cls} text-[10px]`}>{st.label}</Badge>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </div>
            </button>
            {isExpanded && (
              <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  {job.clean_type && (
                    <div>
                      <span className="text-muted-foreground text-xs">Clean Type</span>
                      <p className="font-semibold">{job.clean_type}</p>
                    </div>
                  )}
                  {cleanerName && (
                    <div>
                      <span className="text-muted-foreground text-xs">Cleaner</span>
                      <div className="mt-0.5">
                        <CleanerProfileChip name={cleanerName} />
                      </div>
                    </div>
                  )}
                  {job.notes && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground text-xs">Notes</span>
                      <p className="text-foreground">{job.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
