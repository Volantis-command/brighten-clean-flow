import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Send, Link2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getAppBaseUrl } from '@/lib/appUrl';

interface PortalLinkSectionProps {
  clientId: string;
  portalToken: string | null;
  portalLinkSentAt: string | null;
  linkCreatedAt: string | null;
  phone: string | null;
  email: string | null;
  clientName: string;
  onRefresh: () => void;
}

export default function PortalLinkSection({
  clientId, portalToken, portalLinkSentAt, linkCreatedAt, phone, email, clientName, onRefresh
}: PortalLinkSectionProps) {
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const portalLink = portalToken ? `${getAppBaseUrl()}/client/${portalToken}` : null;

  const generateToken = async () => {
    setGenerating(true);
    try {
      const newToken = crypto.randomUUID();
      const { error } = await supabase.from('client_properties')
        .update({ portal_token: newToken })
        .eq('client_id', clientId);
      if (error) throw error;
      toast.success('Portal link generated');
      onRefresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const sendLink = async () => {
    if (!portalLink) return;
    setSending(true);
    try {
      if (phone) {
        const { error } = await supabase.functions.invoke('send-job-sms', {
          body: {
            to: phone,
            message: `Hi ${clientName}, here's your Brightly property portal: ${portalLink}`,
          },
        });
        if (error) throw error;
      }
      await supabase.from('client_properties')
        .update({ portal_link_sent_at: new Date().toISOString() })
        .eq('client_id', clientId);
      toast.success(phone ? 'Portal link sent via SMS' : 'Link recorded (no phone — add one to send SMS)');
      onRefresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <h3 className="font-bold text-foreground mb-3">Magic Link Portal URL</h3>
      {portalLink ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <code className="text-xs bg-muted px-3 py-2 rounded-lg flex-1 truncate">{portalLink}</code>
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(portalLink); toast.success('Copied'); }}>
              <Copy className="w-4 h-4" />
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button size="sm" variant="outline" onClick={sendLink} disabled={sending || !phone}>
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                  </span>
                </TooltipTrigger>
                {!phone && <TooltipContent>Add phone number to enable SMS</TooltipContent>}
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            {linkCreatedAt && <span>Link generated {format(new Date(linkCreatedAt), 'dd MMM yyyy')}</span>}
            {portalLinkSentAt && <span>Last sent {format(new Date(portalLinkSentAt), 'dd MMM yyyy HH:mm')}</span>}
          </div>
        </div>
      ) : (
        <Button onClick={generateToken} disabled={generating} variant="outline" className="gap-2">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
          Generate Portal Link
        </Button>
      )}
    </div>
  );
}
