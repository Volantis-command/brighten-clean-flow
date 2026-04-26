import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowLeft, Clock, MapPin, Navigation, Key, ClipboardList, Users, Package, StickyNote, ChevronDown, ChevronUp, Phone, BedDouble, Check } from 'lucide-react';
import { format } from 'date-fns';
import { jobLabel } from '@/lib/jobLabel';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  const [onRouteAt, setOnRouteAt] = useState<string | null>(job.on_route_at || null);
  const [markingOnRoute, setMarkingOnRoute] = useState(false);

  const markOnRoute = async () => {
    setMarkingOnRoute(true);
    try {
      const ts = new Date().toISOString();
      const { error } = await supabase.from('jobs').update({ on_route_at: ts } as any).eq('id', job.id);
      if (error) throw error;
      setOnRouteAt(ts);
      toast.success('Client knows you are on the way.');
    } catch (e: any) {
      toast.error(e.message || 'Could not update — try again.');
    } finally {
      setMarkingOnRoute(false);
    }
  };
  // Default-open the Consumables panel when the property actually has
  // kits configured — saves a tap on every Airbnb turnover.
  const hasAnyKit =
    !!(property as any)?.amenities_kit ||
    !!(property as any)?.wash_kit ||
    !!(property as any)?.tea_coffee_kit;
  const [consumablesOpen, setConsumablesOpen] = useState(hasAnyKit);

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

        {/* On the way → Clock on flow */}
        {canClockOn && (
          <div className="space-y-2">
            {onRouteAt ? (
              <div className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-sm font-bold">
                <Check className="w-4 h-4" />
                Client notified — you marked on the way at {format(new Date(onRouteAt), 'h:mm a')}
              </div>
            ) : (
              <Button
                onClick={markOnRoute}
                disabled={markingOnRoute}
                variant="outline"
                className="w-full h-12 text-base font-bold rounded-2xl gap-2 border-amber-400 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/10"
              >
                <Navigation className="w-5 h-5" />
                {markingOnRoute ? 'Sending…' : "I'm on the way"}
              </Button>
            )}
            <Button
              onClick={onClockOn}
              disabled={clockingOn}
              className="w-full h-16 text-lg font-extrabold rounded-2xl bg-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/90 text-primary-foreground gap-2"
            >
              <Clock className="h-6 w-6" />
              {clockingOn ? 'Clocking On…' : 'Clock On'}
            </Button>
          </div>
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

        {/* Beds & Linen — Airbnb only, when there's any linen/bed config to show */}
        {property?.client_type === 'airbnb' && (() => {
          const p = property as any;
          const hasBedConfig = !!p?.bed_config;
          const linenRequired = p?.linen_required;
          const hasLinenInfo =
            linenRequired === true || linenRequired === false ||
            !!p?.linen_storage || !!p?.linen_sets || !!p?.linen_fold_style ||
            !!p?.linen_changeover || !!p?.linen_supply;

          if (!hasBedConfig && !hasLinenInfo) return null;

          return (
            <Card className="border-border">
              <CardContent className="p-4 space-y-3">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <BedDouble className="h-3.5 w-3.5" /> Beds &amp; Linen
                </p>

                {hasBedConfig && (
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Bed configuration</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{p.bed_config}</p>
                  </div>
                )}

                {linenRequired === true && (
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Linen</p>
                    <p className="text-sm text-foreground">Brightly supplies fresh linen for this clean</p>
                  </div>
                )}
                {linenRequired === false && (
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Linen</p>
                    <p className="text-sm text-foreground">Host provides linen — check the storage location</p>
                  </div>
                )}

                {p?.linen_storage && (
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Spare linen storage</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{p.linen_storage}</p>
                  </div>
                )}

                {p?.linen_sets != null && p.linen_sets !== '' && (
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Sets per bed</p>
                    <p className="text-sm text-foreground">{p.linen_sets}</p>
                  </div>
                )}

                {p?.linen_fold_style && (
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Fold style</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{p.linen_fold_style}</p>
                  </div>
                )}

                {p?.linen_changeover && (
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Changeover</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{p.linen_changeover}</p>
                  </div>
                )}
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
              <div className="px-4 pb-4 space-y-4">
                {(() => {
                  // Aggregate all instruction fields the property might have.
                  // Each is either a free-text note or absent. Displayed as
                  // labelled blocks so the cleaner doesn't miss any.
                  const blocks: { label: string; body: string }[] = [];
                  const p = property as any;
                  if (p?.special_instructions) blocks.push({ label: 'Special instructions', body: p.special_instructions });
                  if (p?.host_preferences) blocks.push({ label: 'Host preferences', body: p.host_preferences });
                  if (p?.focus_areas) blocks.push({ label: 'Focus areas', body: p.focus_areas });
                  if (p?.skip_areas) blocks.push({ label: 'Skip / don\u2019t clean', body: p.skip_areas });
                  if (p?.preferences_notes) blocks.push({ label: 'Client preferences', body: p.preferences_notes });
                  if (p?.product_restrictions) blocks.push({ label: 'Product restrictions', body: p.product_restrictions });
                  // pet_situation may be on properties; pet_notes is a separate text field.
                  if (p?.pet_situation) blocks.push({ label: 'Pets', body: p.pet_situation });
                  if (p?.pet_notes && p.pet_notes !== p.pet_situation) {
                    blocks.push({ label: 'Pet notes', body: p.pet_notes });
                  }
                  // Operational extras admin captures on the property passport
                  // but cleaner needs at the door / on arrival.
                  if (p?.neighbour_notes) blocks.push({ label: 'Neighbours', body: p.neighbour_notes });
                  if (p?.bin_details) blocks.push({ label: 'Bins', body: p.bin_details });
                  if (p?.guest_wifi) blocks.push({ label: 'Wi-Fi (cleaner can verify)', body: p.guest_wifi });
                  if (p?.amenities_notes) blocks.push({ label: 'Amenities notes', body: p.amenities_notes });
                  // Per-room notes from the property passport — kitchen,
                  // bathroom, bedrooms, living, etc.
                  const roomNotes = p?.room_notes;
                  if (roomNotes && typeof roomNotes === 'object') {
                    for (const [room, body] of Object.entries(roomNotes)) {
                      if (typeof body === 'string' && body.trim()) {
                        blocks.push({ label: `${room} notes`, body: body });
                      }
                    }
                  }
                  // Structural flags only render if they tell the cleaner
                  // something they should know (a property HAS a garage or
                  // outdoor area, vs. doesn't).
                  const features: string[] = [];
                  if (p?.has_garage) features.push('Garage');
                  if (p?.has_outdoor_area) features.push('Outdoor area');
                  if (typeof p?.linen_sets === 'number' && p.linen_sets > 0) features.push(`${p.linen_sets} linen set${p.linen_sets > 1 ? 's' : ''}`);
                  if (p?.linen_provided) features.push('Linen provided');
                  if (p?.amenities_restock) features.push('Amenities to restock');
                  if (features.length > 0) {
                    blocks.push({ label: 'Property features', body: features.join(' · ') });
                  }

                  if (blocks.length === 0) {
                    return (
                      <p className="text-sm text-muted-foreground italic">
                        No cleaning instructions for this property
                      </p>
                    );
                  }

                  return (
                    <>
                      {blocks.map((block) => (
                        <div key={block.label} className="space-y-1">
                          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            {block.label}
                          </p>
                          <p className="text-sm text-foreground whitespace-pre-wrap">{block.body}</p>
                        </div>
                      ))}
                    </>
                  );
                })()}
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
              <div className="px-4 pb-4 space-y-3">
                {(() => {
                  const kits: { name: string; contents: string }[] = [];
                  if ((property as any)?.amenities_kit) {
                    kits.push({
                      name: 'Amenities Kit',
                      contents: 'Shampoo · Conditioner · Body Wash · Hand Soap',
                    });
                  }
                  if ((property as any)?.wash_kit) {
                    kits.push({
                      name: 'Wash Kit',
                      contents: 'Dishwasher powder + liquid · Detergent · Scourer · Bin liners',
                    });
                  }
                  if ((property as any)?.tea_coffee_kit) {
                    kits.push({
                      name: 'Tea / Coffee Kit',
                      contents: 'Tea · Coffee · Milk · Sugar',
                    });
                  }

                  if (kits.length === 0) {
                    return (
                      <p className="text-sm text-muted-foreground italic">
                        No consumables this clean
                      </p>
                    );
                  }

                  return (
                    <>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                        Replace / restock for this turnover
                      </p>
                      {kits.map((kit) => (
                        <div key={kit.name} className="space-y-0.5">
                          <p className="text-sm font-bold text-foreground">{kit.name}</p>
                          <p className="text-xs text-muted-foreground">{kit.contents}</p>
                        </div>
                      ))}
                    </>
                  );
                })()}
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
