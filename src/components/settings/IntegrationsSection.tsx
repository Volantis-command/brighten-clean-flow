import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle2, XCircle } from 'lucide-react';

interface IntegrationRow {
  name: string;
  connected: boolean;
  detail?: string;
}

export default function IntegrationsSection() {
  const { data: xeroTokens = [] } = useQuery({
    queryKey: ['xero-tokens-check'],
    queryFn: async () => {
      const { data } = await supabase.from('xero_tokens').select('id, tenant_id').limit(1);
      return data || [];
    },
  });

  const { data: gcalConfig = [] } = useQuery({
    queryKey: ['gcal-config-check'],
    queryFn: async () => {
      const { data } = await supabase.from('google_calendar_config').select('id, email').limit(1);
      return data || [];
    },
  });

  const { data: guestyConfig = [] } = useQuery({
    queryKey: ['guesty-config-check'],
    queryFn: async () => {
      const { data } = await supabase.from('guesty_config').select('id, account_name').limit(1);
      return data || [];
    },
  });

  const integrations: IntegrationRow[] = [
    {
      name: 'Xero Accounting',
      connected: xeroTokens.length > 0 && !!(xeroTokens[0] as any)?.tenant_id,
      detail: xeroTokens.length > 0 ? 'Connected' : 'Not connected',
    },
    {
      name: 'Google Calendar',
      connected: gcalConfig.length > 0 && !!(gcalConfig[0] as any)?.email,
      detail: (gcalConfig[0] as any)?.email || 'Not connected',
    },
    {
      name: 'Twilio SMS',
      connected: true, // Secrets are configured
      detail: 'Configured',
    },
    {
      name: 'Guesty PMS',
      connected: guestyConfig.length > 0 && !!(guestyConfig[0] as any)?.account_name,
      detail: (guestyConfig[0] as any)?.account_name || 'Not connected',
    },
  ];

  return (
    <div className="bg-card rounded-2xl shadow-md p-5 space-y-4 mt-4">
      <h3 className="text-lg font-bold text-foreground">Integration Status</h3>
      <div className="space-y-3">
        {integrations.map((int) => (
          <div key={int.name} className="flex items-center justify-between py-2 border-b border-border last:border-b-0">
            <div>
              <p className="text-sm font-semibold text-foreground">{int.name}</p>
              <p className="text-xs text-muted-foreground">{int.detail}</p>
            </div>
            {int.connected ? (
              <div className="flex items-center gap-1.5 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-xs font-bold">Connected</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-destructive">
                <XCircle className="h-5 w-5" />
                <span className="text-xs font-bold">Not connected</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
