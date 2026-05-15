import { useState, useEffect } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import BusinessSection from '@/components/settings/BusinessSection';
import TeamSection from '@/components/settings/TeamSection';
import PricingSection from '@/components/settings/PricingSection';
import PropertiesSection from '@/components/settings/PropertiesSection';
import ClientsSection from '@/components/settings/ClientsSection';
import AppSettingsSection from '@/components/settings/AppSettingsSection';
import NotificationsSection from '@/components/settings/NotificationsSection';
import AlertTiersSection from '@/components/settings/AlertTiersSection';
import SMSTemplatesSection from '@/components/settings/SMSTemplatesSection';
import MergedIntegrationsSection from '@/components/settings/MergedIntegrationsSection';
import LegalSection from '@/components/settings/LegalSection';
import DangerZoneTab from '@/components/settings/DangerZoneTab';
import { Briefcase, Users, DollarSign, Building2, UserCircle, Settings, Bell, MessageSquare, Plug, Scale, AlertTriangle, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

function LinenSettingsSection() {
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('linen_settings').select('*').limit(1).single().then(({ data }) => {
      if (data) {
        setCompanyName((data as any).company_name || '');
        setPhone((data as any).phone || '');
        setNotes((data as any).notes || '');
      }
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Upsert the single settings row
      const { data: existing } = await supabase.from('linen_settings').select('id').limit(1).single();
      if (existing?.id) {
        await supabase.from('linen_settings').update({
          company_name: companyName,
          phone,
          notes: notes || null,
          updated_at: new Date().toISOString(),
        } as any).eq('id', existing.id);
      } else {
        await supabase.from('linen_settings').insert({ company_name: companyName, phone, notes: notes || null } as any);
      }
      toast.success('Linen settings saved.');
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6 mt-4">
      <div className="bg-card rounded-2xl shadow-sm border border-border p-6 space-y-5">
        <div>
          <h2 className="text-lg font-bold text-foreground">Linen Company Settings</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure the linen company that receives SMS notifications when Airbnb jobs are created.
            They log in at <span className="font-mono text-xs">app.brightly.cleaning/linen-portal</span>.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">Company name</Label>
          <Input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="e.g. Gold Coast Linen Co"
            className="h-12 rounded-xl"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">Phone number (receives SMS alerts + portal login)</Label>
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+61 400 000 000"
            className="h-12 rounded-xl"
          />
          <p className="text-xs text-muted-foreground">
            This is the only phone number that can log into the linen portal. Must match the number they use to sign in.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">Notes (optional)</Label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes about the linen company or delivery process…"
            rows={3}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto rounded-xl h-11">
          {saving ? 'Saving…' : 'Save linen settings'}
        </Button>
      </div>

      <div className="bg-muted/40 rounded-2xl border border-border p-5 space-y-2">
        <h3 className="text-sm font-bold text-foreground">How it works</h3>
        <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-4">
          <li>Set linen requirements on each property (in the SOP tab of the property profile, or in the property form).</li>
          <li>When any job is created for a property with linen requirements, an SMS is automatically sent to the linen company.</li>
          <li>The SMS includes the property address, clean date/time, and the deliver-by deadline (12 hours before clean).</li>
          <li>The linen company logs into <span className="font-mono text-xs">app.brightly.cleaning/linen-portal</span> to see all upcoming deliveries and mark them as delivered.</li>
        </ul>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('business');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-primary">Settings</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full flex flex-wrap gap-1 bg-muted rounded-xl p-1 h-auto">
          <TabsTrigger value="business" className="gap-1.5 text-xs rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Briefcase className="w-4 h-4" />
            <span className="hidden sm:inline">Business</span>
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-1.5 text-xs rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">Team</span>
          </TabsTrigger>
          <TabsTrigger value="pricing" className="gap-1.5 text-xs rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <DollarSign className="w-4 h-4" />
            <span className="hidden sm:inline">Pricing</span>
          </TabsTrigger>
          <TabsTrigger value="properties" className="gap-1.5 text-xs rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Building2 className="w-4 h-4" />
            <span className="hidden sm:inline">Properties</span>
          </TabsTrigger>
          <TabsTrigger value="clients" className="gap-1.5 text-xs rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <UserCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Clients</span>
          </TabsTrigger>
          <TabsTrigger value="app" className="gap-1.5 text-xs rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">App</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5 text-xs rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Bell className="w-4 h-4" />
            <span className="hidden sm:inline">Alerts</span>
          </TabsTrigger>
          <TabsTrigger value="sms" className="gap-1.5 text-xs rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <MessageSquare className="w-4 h-4" />
            <span className="hidden sm:inline">SMS</span>
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-1.5 text-xs rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Plug className="w-4 h-4" />
            <span className="hidden sm:inline">Integrations</span>
          </TabsTrigger>
          <TabsTrigger value="legal" className="gap-1.5 text-xs rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Scale className="w-4 h-4" />
            <span className="hidden sm:inline">Legal</span>
          </TabsTrigger>
          <TabsTrigger value="linen" className="gap-1.5 text-xs rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Package className="w-4 h-4" />
            <span className="hidden sm:inline">Linen</span>
          </TabsTrigger>
          <TabsTrigger value="danger" className="gap-1.5 text-xs rounded-lg data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground">
            <AlertTriangle className="w-4 h-4" />
            <span className="hidden sm:inline">Danger</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="business"><BusinessSection /></TabsContent>
        <TabsContent value="team"><TeamSection /></TabsContent>
        <TabsContent value="pricing"><PricingSection /></TabsContent>
        <TabsContent value="properties"><PropertiesSection /></TabsContent>
        <TabsContent value="clients"><ClientsSection /></TabsContent>
        <TabsContent value="app"><AppSettingsSection /></TabsContent>
        <TabsContent value="notifications">
          <NotificationsSection />
          <AlertTiersSection />
        </TabsContent>
        <TabsContent value="sms"><SMSTemplatesSection /></TabsContent>
        <TabsContent value="integrations"><MergedIntegrationsSection /></TabsContent>
        <TabsContent value="legal"><LegalSection /></TabsContent>
        <TabsContent value="linen"><LinenSettingsSection /></TabsContent>
        <TabsContent value="danger"><DangerZoneTab /></TabsContent>
      </Tabs>
    </div>
  );
}
