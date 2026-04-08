import GuestySection from './GuestySection';
import XeroSection from './XeroSection';
import GoogleCalendarSection from './GoogleCalendarSection';
import IntegrationsSection from './IntegrationsSection';
import { Badge } from '@/components/ui/badge';
import { Plug } from 'lucide-react';

const PLACEHOLDER_INTEGRATIONS = [
  { name: 'Airbnb', status: 'Coming Soon' },
  { name: 'Stayz', status: 'Coming Soon' },
  { name: 'Bookings.com', status: 'Coming Soon' },
  { name: 'Google Maps API', status: 'Coming Soon' },
];

export default function MergedIntegrationsSection() {
  return (
    <div className="space-y-8">
      <h2 className="text-lg font-bold text-primary flex items-center gap-2">
        <Plug className="w-5 h-5" /> Integrations
      </h2>

      {/* Status overview card */}
      <IntegrationsSection />

      {/* Individual integration configs */}
      <GuestySection />
      <XeroSection />
      <GoogleCalendarSection />

      {/* Placeholder integrations */}
      <div className="bg-card rounded-2xl shadow-sm border border-border p-5 space-y-3">
        <h3 className="font-bold text-foreground text-base">More Integrations</h3>
        {PLACEHOLDER_INTEGRATIONS.map((int) => (
          <div key={int.name} className="flex items-center justify-between py-2 border-b border-border last:border-b-0">
            <span className="text-sm font-semibold text-foreground">{int.name}</span>
            <Badge variant="secondary" className="text-xs">{int.status}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
