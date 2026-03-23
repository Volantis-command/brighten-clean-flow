import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Loader2, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  staffId: string;
  staffName: string;
}

export function StaffPaySection({ staffId, staffName }: Props) {
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['staff-pay', staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('hourly_rate, employment_type, super_rate, pay_cycle')
        .eq('id', staffId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [rate, setRate] = useState('');
  const [empType, setEmpType] = useState('employee');
  const [superRate, setSuperRate] = useState('11.5');
  const [payCycle, setPayCycle] = useState('fortnightly');

  useEffect(() => {
    if (profile) {
      setRate(profile.hourly_rate?.toString() || '');
      setEmpType(profile.employment_type || 'employee');
      setSuperRate(profile.super_rate?.toString() || '11.5');
      setPayCycle(profile.pay_cycle || 'fortnightly');
    }
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('profiles').update({
        hourly_rate: rate ? parseFloat(rate) : null,
        employment_type: empType,
        super_rate: parseFloat(superRate),
        pay_cycle: payCycle,
      }).eq('id', staffId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-pay', staffId] });
      toast.success('Pay settings saved ✓');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="bg-card rounded-2xl shadow-md p-5 space-y-4">
      <div className="flex items-center gap-2">
        <DollarSign className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-bold text-foreground">Pay & Employment</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Base Hourly Rate ($)</Label>
          <Input type="number" step="0.50" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="55.00" />
        </div>
        <div>
          <Label>Employment Type</Label>
          <Select value={empType} onValueChange={setEmpType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="employee">Employee</SelectItem>
              <SelectItem value="contractor">Contractor</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {empType === 'employee' && (
          <div>
            <Label>Superannuation Rate (%)</Label>
            <Input type="number" step="0.5" value={superRate} onChange={(e) => setSuperRate(e.target.value)} />
          </div>
        )}
        <div>
          <Label>Pay Cycle</Label>
          <Select value={payCycle} onValueChange={setPayCycle}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="fortnightly">Fortnightly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="bg-primary text-primary-foreground font-bold rounded-xl gap-2">
        {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
        Save Pay Settings
      </Button>
    </div>
  );
}
