import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, DollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  staffId: string;
  staffName: string;
}

export function StaffPayRatesSection({ staffId, staffName }: Props) {
  const queryClient = useQueryClient();

  const { data: payRate, isLoading } = useQuery({
    queryKey: ['staff-pay-rates', staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_pay_rates' as any)
        .select('*')
        .eq('staff_id', staffId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [rateType, setRateType] = useState<'hourly' | 'per_job'>('hourly');
  const [hourlyRate, setHourlyRate] = useState('30');
  const [standardRate, setStandardRate] = useState('65');
  const [deepRate, setDeepRate] = useState('120');
  const [airbnbRate, setAirbnbRate] = useState('75');
  const [commercialRate, setCommercialRate] = useState('90');

  useEffect(() => {
    if (payRate) {
      setRateType((payRate as any).rate_type || 'hourly');
      setHourlyRate(String((payRate as any).hourly_rate ?? 30));
      setStandardRate(String((payRate as any).standard_rate ?? 65));
      setDeepRate(String((payRate as any).deep_rate ?? 120));
      setAirbnbRate(String((payRate as any).airbnb_rate ?? 75));
      setCommercialRate(String((payRate as any).commercial_rate ?? 90));
    }
  }, [payRate]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        staff_id: staffId,
        rate_type: rateType,
        hourly_rate: parseFloat(hourlyRate) || 30,
        standard_rate: parseFloat(standardRate) || 65,
        deep_rate: parseFloat(deepRate) || 120,
        airbnb_rate: parseFloat(airbnbRate) || 75,
        commercial_rate: parseFloat(commercialRate) || 90,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('staff_pay_rates' as any)
        .upsert(payload, { onConflict: 'staff_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-pay-rates', staffId] });
      toast.success('Pay rates saved ✓');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="bg-card rounded-2xl shadow-md p-5 space-y-4">
      <div className="flex items-center gap-2">
        <DollarSign className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-bold text-foreground">Pay Rates</h3>
      </div>

      {/* Toggle */}
      <div className="flex rounded-xl border border-border overflow-hidden">
        <button
          type="button"
          onClick={() => setRateType('hourly')}
          className={cn(
            'flex-1 px-4 py-2.5 text-sm font-bold transition-colors',
            rateType === 'hourly' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'
          )}
        >
          Hourly Rate
        </button>
        <button
          type="button"
          onClick={() => setRateType('per_job')}
          className={cn(
            'flex-1 px-4 py-2.5 text-sm font-bold transition-colors',
            rateType === 'per_job' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'
          )}
        >
          Per-Job Rates
        </button>
      </div>

      {rateType === 'hourly' ? (
        <div>
          <Label>Hourly Rate ($)</Label>
          <Input type="number" step="0.50" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} placeholder="30.00" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Standard Clean ($)</Label>
            <Input type="number" step="1" value={standardRate} onChange={e => setStandardRate(e.target.value)} />
          </div>
          <div>
            <Label>Deep Clean ($)</Label>
            <Input type="number" step="1" value={deepRate} onChange={e => setDeepRate(e.target.value)} />
          </div>
          <div>
            <Label>Airbnb Turnover ($)</Label>
            <Input type="number" step="1" value={airbnbRate} onChange={e => setAirbnbRate(e.target.value)} />
          </div>
          <div>
            <Label>Commercial ($)</Label>
            <Input type="number" step="1" value={commercialRate} onChange={e => setCommercialRate(e.target.value)} />
          </div>
        </div>
      )}

      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="bg-primary text-primary-foreground font-bold rounded-xl gap-2">
        {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
        Save Pay Rates
      </Button>
    </div>
  );
}
