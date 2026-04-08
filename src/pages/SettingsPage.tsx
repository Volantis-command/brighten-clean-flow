import { useState } from 'react';
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
import { Briefcase, Users, DollarSign, Building2, UserCircle, Settings, Bell, MessageSquare, Plug, Scale, AlertTriangle } from 'lucide-react';

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
        <TabsContent value="danger"><DangerZoneTab /></TabsContent>
      </Tabs>
    </div>
  );
}
