import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Send, Eye, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Props {
  clientId: string;
  onboardToken: string | null;
  onboardUsed: boolean;
  onboardingSentAt: string | null;
  phone: string | null;
  email: string | null;
  clientName: string;
  properties: any[];
  onRefresh: () => void;
}

export default function OnboardingStatusSection({
  clientId, onboardToken, onboardUsed, onboardingSentAt, phone, clientName, onRefresh, properties
}: Props) {
  const [sending, setSending] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);

  const status = onboardUsed ? 'submitted' : onboardingSentAt ? 'sent' : 'pending';

  const sendOnboarding = async () => {
    if (!phone) {
      toast.error('No phone number on file. Please edit the client and add a mobile number first.');
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-onboarding-sms', {
        body: { client_id: clientId },
      });

      if (error) {
        throw new Error(error.message || 'Failed to send onboarding SMS');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast.success(`Onboarding form sent to ${data?.name || clientName} ✓`);
      onRefresh();
    } catch (e: any) {
      toast.error(e.message || 'Failed to send onboarding SMS');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-foreground">Onboarding Form Status</h3>
        <Badge className={
          status === 'submitted' ? 'bg-brightly/10 text-brightly' :
          status === 'sent' ? 'bg-blue-100 text-blue-800' :
          'bg-yellow-100 text-yellow-800'
        }>
          {status === 'submitted' ? '✓ Submitted' : status === 'sent' ? '📨 Sent' : '⏳ Pending'}
        </Badge>
      </div>

      {onboardingSentAt && (
        <p className="text-xs text-muted-foreground mb-2">
          {status === 'sent' ? 'Sent' : 'Last sent'} {format(new Date(onboardingSentAt), 'dd MMM yyyy HH:mm')}
        </p>
      )}

      <div className="flex gap-2">
        <Button size="sm" onClick={sendOnboarding} disabled={sending || !phone} variant="outline" className="gap-1.5">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {onboardingSentAt ? 'Resend' : 'Send Onboarding Form'}
        </Button>
        {onboardUsed && (
          <Button size="sm" variant="outline" onClick={() => setViewOpen(true)} className="gap-1.5">
            <Eye className="w-4 h-4" /> View Submission
          </Button>
        )}
      </div>

      {!phone && <p className="text-xs text-muted-foreground mt-2">Add a phone number to send via SMS.</p>}

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="rounded-2xl max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Onboarding Submission</DialogTitle>
            <DialogDescription>Property details submitted by {clientName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {properties.length === 0 ? (
              <p className="text-sm text-muted-foreground">No property data found.</p>
            ) : properties.map(p => (
              <div key={p.id} className="border border-border rounded-xl p-4 space-y-2">
                <p className="font-semibold text-foreground">{p.property_name}</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Detail label="Address" value={[p.address, p.suburb, p.state, p.postcode].filter(Boolean).join(', ')} />
                  <Detail label="Bedrooms" value={p.bedrooms} />
                  <Detail label="Bathrooms" value={p.bathrooms} />
                  <Detail label="Type" value={p.property_type} />
                  <Detail label="Access" value={p.access_method} />
                  <Detail label="Access Code" value={p.access_code} />
                  <Detail label="Access Notes" value={p.access_notes} />
                  <Detail label="Linen" value={p.linen_fold_style} />
                  <Detail label="Preferences" value={p.host_preferences} />
                  <Detail label="Product Restrictions" value={p.product_restrictions} />
                  <Detail label="Amenities" value={p.amenities_notes} />
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: any }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-muted-foreground">{label}:</span>{' '}
      <span className="text-foreground">{String(value)}</span>
    </div>
  );
}
