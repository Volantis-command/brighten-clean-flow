import { useState, useEffect } from 'react';
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import NewQuoteCalculator from '@/components/pricing/NewQuoteCalculator';
import SavedQuotesList from '@/components/pricing/SavedQuotesList';
import RateSettings from '@/components/pricing/RateSettings';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export default function QuotingPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const quoteRequestId = (location.state as any)?.quoteRequestId || searchParams.get('lead');
  const quoteId = searchParams.get('quote');
  const [tab, setTab] = useState('new');
  const [editQuote, setEditQuote] = useState<any>(null);

  // Auto-open a specific quote from ?quote=ID
  useEffect(() => {
    if (!quoteId) return;
    (async () => {
      const { data } = await supabase
        .from('quotes')
        .select('*')
        .eq('id', quoteId)
        .single();
      if (data) {
        setEditQuote(data);
        setTab('new');
      }
    })();
  }, [quoteId]);

  // Pre-populate from quote_request or lead data
  useEffect(() => {
    if (!quoteRequestId) return;
    (async () => {
      // Try quote_requests first — let NewQuoteCalculator handle full form_data parsing via ?lead= param
      const { data: qrData } = await supabase
        .from('quote_requests')
        .select('id')
        .eq('id', quoteRequestId)
        .maybeSingle();
      if (qrData) {
        setTab('new');
        return;
      }

      // Fallback: try leads table
      const { data: leadData } = await supabase
        .from('leads')
        .select('*')
        .eq('id', quoteRequestId)
        .single();
      if (leadData) {
        const serviceMap: Record<string, string> = {
          'house_clean': 'Standard Clean',
          'standard_clean': 'Standard Clean',
          'deep_clean': 'Deep Clean',
          'end_of_lease': 'Bond / End of Lease Clean',
          'airbnb': 'Airbnb / Short-Stay Turnover',
          'office_commercial': 'Office / Commercial Clean',
          'post_renovation': 'Post-Renovation Clean',
        };
        const mappedType = serviceMap[leadData.service_type] || leadData.service_type || '';
        setEditQuote({
          client_name: [leadData.first_name, leadData.last_name].filter(Boolean).join(' '),
          client_phone: leadData.phone || '',
          client_email: leadData.email || '',
          property_address: [leadData.address, leadData.suburb].filter(Boolean).join(', '),
          bedrooms: parseInt(leadData.bedrooms, 10) || 1,
          bathrooms: parseInt(leadData.bathrooms, 10) || 1,
          clean_type: mappedType,
          notes: leadData.notes || '',
          _lead_id: leadData.id,
        });
        setTab('new');
      }
    })();
  }, [quoteRequestId]);

  const handleEditFromList = (q: any) => {
    setEditQuote(q);
    setTab('new');
  };

  const handleSaved = () => {
    setEditQuote(null);
    setTab('saved');
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-primary">Pricing Calculator</h1>

      <Tabs value={tab} onValueChange={(v) => { setTab(v); if (v !== 'new') setEditQuote(null); }}>
        <TabsList className="w-full grid grid-cols-3 rounded-2xl h-12">
          <TabsTrigger value="new" className="rounded-xl font-bold">New Quote</TabsTrigger>
          <TabsTrigger value="saved" className="rounded-xl font-bold">Saved Quotes</TabsTrigger>
          <TabsTrigger value="settings" className="rounded-xl font-bold">Rate Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="mt-4">
          {editQuote && (
            <Button variant="ghost" size="sm" onClick={() => setEditQuote(null)} className="gap-1 mb-3">
              <ArrowLeft className="h-4 w-4" /> New Quote
            </Button>
          )}
          <NewQuoteCalculator editQuote={editQuote} onSaved={handleSaved} />
        </TabsContent>

        <TabsContent value="saved" className="mt-4">
          <SavedQuotesList onEdit={handleEditFromList} />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <RateSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
