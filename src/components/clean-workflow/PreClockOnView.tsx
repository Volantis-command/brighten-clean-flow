import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowLeft, Clock, MapPin, Navigation, Key, ClipboardList, Users, Package, StickyNote, ChevronDown, ChevronUp, Phone } from 'lucide-react';
import { format } from 'date-fns';
import { jobLabel } from '@/lib/jobLabel';

interface Props {
  job: any;
  property: any;
  profiles: { id: string; full_name: string; role?: string }[];
  onClockOn: () => void;
  clockingOn: boolean;
  clientPhone?: string | null;
}

function openMaps(address: string) {
  const encoded = encodeURIComponent(address);
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
  window.open(
    isIos ? `maps://maps.apple.com/?q=${encoded}` : `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    '_blank',
  );
}

export default function PreClockOnView({ job, property, profiles, onClockOn, clockingOn, clientPhone }: Props) {
  const navigate = useNavigate();
  const [accessOpen, setAccessOpen] = useState(true);
  const [instructionsOpen, setInstructionsOpen] = useState(true);
  const [consumablesOpen, setConsumablesOpen] = useState(false);

  const jobDate = new Date(job.scheduled_date + 'T' + (job.scheduled_time ?? '00:00'));
  const durationHrs = job.estimated_duration ? job.estimated_duration / 60 : null;
  const endTime = durationHrs ? new Date(jobDate.getTime() + durationHrs * 3600000) : null;
  // Fallback chain: property record -> client_name on job (set at quote time)
  const clientFirstName = (property?.client_name || job?.client_name)?.split(' ')[0] || null;
  // Address — fallback to job.property_address (captured at quote time, lives on the job row)
  const address = property?.address || job?.property_address || '';
  const headerLabel = jobLabel(job);

  // 'confirmed' is the new "ready to clock on" state. Keep 'scheduled' for legacy jobs.
  const canClockOn = job.status === 'confirmed' || job.status === 'scheduled' || job.status === 'awaiting_cleaner_acceptance';
  const isCompleted = job.status === 'completed';

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
      {/* Top Nav */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
        <button onClick={() => navigate('/my-jobs')} className="p-2 -ml-2">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="text-base font-extrabold text-foreground truncate flex-1 text-center">{headerLabel}</h1>
        <div className="w-9" />
      </div>

      <main className="flex-1 px-4 py-4 space-y-4 pb-8">
        {/* Notes for This Clean — top priority yellow card */}
        {(property as any)?.property_notes && (
          <Card className="border-amber-300 bg-amber-50 dark:bg-amber-500/10">
            <CardContent className="p-4">
              <p className="text-xs font-bold text-amber-700 uppercase mb-1">🔧 Notes for This Clean</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{(property as any).property_notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Clock On Button */}
        {canClockOn && (
          <Button
            onClick={onClockOn}
            disabled={clockingOn}
            className="w-full h-16 text-lg font-extrabold rounded-2xl bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90 text-primary-foreground gap-2"
          >
            <Clock className="h-6 w-6" />
            {clockingOn ? 'Clocking On…' : 'Clock On'}
          </Button>
        )}

        {isCompleted && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 text-center">
              <p className="text-lg font-extrabold text-primary">✓ Job Completed</p>
              {job.clock_off && (
                <p className="text-sm text-muted-foreground mt-1">
                  Clocked off at {format(new Date(job.clock_off), 'h:mm a')}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Airbnb Turnaround Window — only for Airbnb properties with timing data */}
        {property?.client_type === 'airbnb' && (property?.checkout_time || property?.checkin_time) && (() => {
          const formatTime = (raw: string): string => {
            const parts = String(raw).split(':');
            if (parts.length < 2) return raw;
            const h = parseInt(parts[0], 10);
            const m = parts[1];
            if (isNaN(h)) return raw;
            const period = h >= 12 ? 'PM' : 'AM';
            const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
            return `${h12}:${m} ${period}`;
          };
          const checkout = property.checkout_time ? formatTime(property.checkout_time) : null;
          const checkin = property.checkin_time ? formatTime(property.checkin_time) : null;
          let windowLabel: string | null = null;
          if (property.checkout_time && property.checkin_time) {
            const [coH, coM] = property.checkout_time.split(':').map(Number);
            const [ciH, ciM] = property.checkin_time.split(':').map(Number);
            const diffMin = (ciH * 60 + (ciM || 0)) - (coH * 60 + (coM || 0));
            if (diffMin > 0) {
              const h = Math.floor(diffMin / 60);
              const m = diffMin % 60;
              windowLabel = m === 0 ? `${h} hr${h === 1 ? '' : 's'}` : `${h} hr ${m} min`;
            }
          }
          return (
            <Card className="border-amber-300 bg-amber-50 dark:bg-amber-500/10">
              <CardContent className="p-4 space-y-2">
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Turnaround Window
                </p>
                <div className="space-y-1.5 pt-1">
                  {checkout && (
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm text-foreground">Guest checkout</span>
                      <span className="text-base font-extrabold text-foreground font-mono">{checkout}</span>
                    </div>
                  )}
                  {checkin && (
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm text-foreground">Next check-in</span>
                      <span className="text-base font-extrabold text-foreground font-mono">{checkin}</span>
                    </div>
                  )}
                  {windowLabel && (
                    <div className="flex items-baseline justify-between gap-3 pt-1.5 border-t border-amber-300/40">
                      <span className="text-sm font-bold text-amber-800 dark:text-amber-200">Window</span>
                      <span className="text-lg font-extrabold text-amber-800 dark:text-amber-200">{windowLabel}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* Job Info */}
        <Card className="border-border">
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-bold text-foreground">
              {format(jobDate, 'EEEE, d MMMM')} · {format(jobDate, 'h:mm a')}
              {endTime && ` – ${format(endTime, 'h:mm a')}`}
            </p>
            {durationHrs && (
              <p className="text-xs text-muted-foreground">{durationHrs} hours allocated</p>
            )}
            <p className="text-xs text-muted-foreground">
              {property?.client_type === 'airbnb' ? 'Airbnb Turnover' : 'House Clean'}
            </p>
            {clientFirstName && (
              <p className="text-xs text-muted-foreground">Client: {clientFirstName}</p>
            )}
          </CardContent>
        </Card>

        {/* Property Card */}
        <Card className="border-border">
          <CardContent className="p-4 space-y-3">
            <p className="font-bold text-foreground">{headerLabel}</p>
            {address ? (
              <p className="text-sm text-muted-foreground">{address}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">No address on file — contact admin</p>
            )}
            <div className="flex gap-2">
              {address && (
                <Button
                  variant="outline"
                  className="flex-1 h-12 rounded-xl gap-2 font-bold"
                  onClick={() => openMaps(address)}
                >
                  <Navigation className="h-4 w-4" /> Open in Maps
                </Button>
              )}
              {clientPhone && (
                <Button variant="outline" className="h-12 rounded-xl gap-2 font-bold shrink-0" asChild>
                  <a href={`tel:${clientPhone}`}>
                    <Phone className="h-4 w-4" /> Call Client
                  </a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Access Info */}
        <Collapsible open={accessOpen} onOpenChange={setAccessOpen}>
          <Card className="border-border">
            <CollapsibleTrigger className="w-full">
              <CardContent className="p-4 flex items-center justify-between">
                <span className="font-bold text-foreground flex items-center gap-2">
                  <Key className="h-4 w-4" /> 🔑 Property Access
                </span>
                {accessOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </CardContent>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 pb-4 space-y-3">
                {(() => {
                  const codeRows: { label: string; value: string }[] = [];
                  if (property?.access_method) codeRows.push({ label: 'Method', value: property.access_method });
                  if (property?.access_code) codeRows.push({ label: 'Access code', value: property.access_code });
                  if (property?.lockbox_code && property.lockbox_code !== property.access_code) {
                    codeRows.push({ label: 'Lockbox code', value: property.lockbox_code });
                  }
                  if (property?.garage_code) codeRows.push({ label: 'Garage code', value: property.garage_code });
                  if (property?.alarm_code) codeRows.push({ label: 'Alarm code', value: property.alarm_code });
                  const hasAnyCodes = codeRows.length > 0;
                  const hasNotes = !!property?.access_notes;

                  if (!hasAnyCodes && !hasNotes) {
                    return (
                      <p className="text-sm text-muted-foreground italic">
                        No access info on file — contact admin
                      </p>
                    );
                  }

                  return (
                    <>
                      {codeRows.map((row) => (
                        <div key={row.label} className="flex items-baseline justify-between gap-3">
                          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider shrink-0">
                            {row.label}
                          </span>
                          <span className="text-lg font-extrabold text-foreground font-mono tracking-wide text-right break-all">
                            {row.value}
                          </span>
                        </div>
                      ))}
                      {hasNotes && (
                        <div className={hasAnyCodes ? 'pt-3 border-t border-border' : ''}>
                          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                            Notes
                          </p>
                          <p className="text-sm text-foreground whitespace-pre-wrap">{property.access_notes}</p>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Special Instructions */}
        <Collapsible open={instructionsOpen} onOpenChange={setInstructionsOpen}>
          <Card className="border-border">
            <CollapsibleTrigger className="w-full">
              <CardContent className="p-4 flex items-center justify-between">
                <span className="font-bold text-foreground flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" /> 📋 Cleaning Instructions
                </span>
                {instructionsOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </CardContent>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 pb-4">
                {property?.special_instructions ? (
                  <p className="text-sm text-foreground whitespace-pre-wrap">{property.special_instructions}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No special instructions</p>
                )}
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Team */}
        {profiles.length > 0 && (
          <Card className="border-border">
            <CardContent className="p-4 space-y-2">
              <p className="font-bold text-foreground flex items-center gap-2">
                <Users className="h-4 w-4" /> Your Team Today
              </p>
              {profiles.map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                    {p.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-foreground">{p.full_name}</span>
                  {p.role && (
                    <span className="text-[10px] font-bold bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{p.role}</span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Consumables */}
        <Collapsible open={consumablesOpen} onOpenChange={setConsumablesOpen}>
          <Card className="border-border">
            <CollapsibleTrigger className="w-full">
              <CardContent className="p-4 flex items-center justify-between">
                <span className="font-bold text-foreground flex items-center gap-2">
                  <Package className="h-4 w-4" /> Consumables
                </span>
                {consumablesOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </CardContent>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 pb-4">
                <p className="text-sm text-muted-foreground italic">No consumables this clean</p>
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Admin Notes */}
        {job.notes && (
          <Card className="border-border">
            <CardContent className="p-4 space-y-2">
              <p className="font-bold text-foreground flex items-center gap-2">
                <StickyNote className="h-4 w-4" /> Admin Notes
              </p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{job.notes}</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
