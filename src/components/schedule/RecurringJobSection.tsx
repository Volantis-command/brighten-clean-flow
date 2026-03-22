import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { CalendarIcon, Repeat } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface RecurringConfig {
  enabled: boolean;
  frequency: 'weekly' | 'fortnightly' | 'monthly' | 'custom';
  customWeeks: number;
  endType: 'ongoing' | 'until';
  endDate: Date | undefined;
  preferredDays: number[]; // 0=Mon ... 6=Sun
}

export const defaultRecurringConfig: RecurringConfig = {
  enabled: false,
  frequency: 'weekly',
  customWeeks: 3,
  endType: 'ongoing',
  endDate: undefined,
  preferredDays: [],
};

export function getIntervalWeeks(config: RecurringConfig): number {
  switch (config.frequency) {
    case 'weekly': return 1;
    case 'fortnightly': return 2;
    case 'monthly': return 4;
    case 'custom': return config.customWeeks;
    default: return 1;
  }
}

interface Props {
  config: RecurringConfig;
  onChange: (config: RecurringConfig) => void;
}

export function RecurringJobSection({ config, onChange }: Props) {
  const update = (partial: Partial<RecurringConfig>) => onChange({ ...config, ...partial });

  return (
    <div className="bg-card rounded-2xl shadow-md p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Repeat className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold text-primary">Recurring Job</h2>
        </div>
        <Switch checked={config.enabled} onCheckedChange={(v) => update({ enabled: v })} />
      </div>

      {config.enabled && (
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">Frequency</Label>
            <Select value={config.frequency} onValueChange={(v: any) => update({ frequency: v })}>
              <SelectTrigger className="h-14 rounded-2xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="fortnightly">Fortnightly</SelectItem>
                <SelectItem value="monthly">Monthly (every 4 weeks)</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {config.frequency === 'custom' && (
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Every X weeks</Label>
              <Input
                type="number"
                min={1}
                max={52}
                value={config.customWeeks}
                onChange={(e) => update({ customWeeks: Math.max(1, parseInt(e.target.value) || 1) })}
                className="h-14 rounded-2xl"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">Repeat until</Label>
            <div className="flex gap-2">
              <button
                onClick={() => update({ endType: 'ongoing' })}
                className={cn(
                  'flex-1 h-12 rounded-2xl font-bold text-sm transition-colors',
                  config.endType === 'ongoing' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                Ongoing
              </button>
              <button
                onClick={() => update({ endType: 'until' })}
                className={cn(
                  'flex-1 h-12 rounded-2xl font-bold text-sm transition-colors',
                  config.endType === 'until' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                Until date
              </button>
            </div>
          </div>

          {config.endType === 'until' && (
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">End date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full h-14 rounded-2xl justify-start text-left font-semibold', !config.endDate && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-5 w-5" />
                    {config.endDate ? format(config.endDate, 'PPP') : 'Pick end date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={config.endDate}
                    onSelect={(d) => update({ endDate: d })}
                    disabled={(d) => d < new Date()}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">Preferred days</Label>
            <div className="flex gap-1.5">
              {DAYS.map((day, i) => (
                <button
                  key={day}
                  onClick={() => {
                    const next = config.preferredDays.includes(i)
                      ? config.preferredDays.filter((d) => d !== i)
                      : [...config.preferredDays, i];
                    update({ preferredDays: next });
                  }}
                  className={cn(
                    'flex-1 h-10 rounded-xl font-bold text-xs transition-colors',
                    config.preferredDays.includes(i)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  )}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Jobs will be created up to {config.endType === 'ongoing' ? '12 months ahead' : config.endDate ? format(config.endDate, 'PPP') : 'the end date'}.
          </p>
        </div>
      )}
    </div>
  );
}
