import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import NewQuoteCalculator from '@/components/pricing/NewQuoteCalculator';
import SavedQuotesList from '@/components/pricing/SavedQuotesList';
import RateSettings from '@/components/pricing/RateSettings';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function QuotingPage() {
  const [tab, setTab] = useState('new');
  const [editQuote, setEditQuote] = useState<any>(null);

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
