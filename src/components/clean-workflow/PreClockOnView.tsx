import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowLeft, Clock, MapPin, Navigation, Key, ClipboardList, Users, Package, StickyNote, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  job: any;
  property: any;
  profiles: { id: string; full_name: string; role?: string }[];
  onClockOn: () => void;
  clockingOn: boolean;
}

function openMaps(address: string) {
  const encoded = encodeURIComponent(address);
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
  window.open(
    isIos ? `maps://maps.apple.com/?q=${encoded}` : `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    '_blank',
  );
}

export default function PreClockOnView({ job, property, profiles, onClockOn, clockingOn }: Props) {
  const navigate = useNavigate();
  const [accessOpen, setAccessOpen] = useState(true);
  const [instructionsOpen, setInstructionsOpen] = useState(true);
  const [consumablesOpen, setConsumablesOpen] = useState(false);

  const jobDate = new Date(job.scheduled_date + 'T' + (job.scheduled_time ?? '00:00'));
  const durationHrs = job.estimated_duration ? job.estimated_duration / 60 : null;
  const endTime = durationHrs ? new Date(jobDate.getTime() + durationHrs * 3600000) : null;
  const clientFirstName = property?.client_name?.split(' ')[0] || null;
  const address = property?.address || '';

  const canClockOn = job.status === 'scheduled' || job.status === 'confirmed';
  const isCompleted = job.status === 'completed';

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
      {/* Top Nav */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
        <button onClick={() => navigate('/my-jobs')} className="p-2 -ml-2">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="text-base font-extrabold text-foreground truncate flex-1 text-center">{property?.property_name ?? 'Job'}</h1>
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
            <p className="font-bold text-foreground">{property?.property_name}</p>
            {address && <p className="text-sm text-muted-foreground">{address}</p>}
            {address && (
              <Button
                variant="outline"
                className="w-full h-12 rounded-xl gap-2 font-bold"
                onClick={() => openMaps(address)}
              >
                <Navigation className="h-4 w-4" /> 📍 Open in Maps
              </Button>
            )}
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
              <div className="px-4 pb-4">
                {property?.access_notes ? (
                  <p className="text-sm text-foreground whitespace-pre-wrap">{property.access_notes}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No access notes on file — contact admin</p>
                )}
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
