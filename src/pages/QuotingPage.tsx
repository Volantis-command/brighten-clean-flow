import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SavedQuotesList from '@/components/pricing/SavedQuotesList';
import RateSettings from '@/components/pricing/RateSettings';

// The manual Pricing Calculator was retired 21 Jul 2026 — the instant quote
// (app.brightly.cleaning/instant-quote) now prices Airbnb turnovers + standard
// cleans, and leads are actioned from the Clients → Leads tab. This page keeps
// the two things that are still needed: the saved-quote record and the rates.
export default function QuotingPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const [tab, setTab] = useState('saved');

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-primary">Quotes</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-2 rounded-2xl h-12">
          <TabsTrigger value="saved" className="rounded-xl font-bold">Saved Quotes</TabsTrigger>
          <TabsTrigger value="settings" className="rounded-xl font-bold">Rate Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="saved" className="mt-4">
          <SavedQuotesList onEdit={() => {}} />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <RateSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
