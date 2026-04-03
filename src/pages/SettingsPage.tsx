import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import TeamSection from '@/components/settings/TeamSection';
import ClientsSection from '@/components/settings/ClientsSection';
import PropertiesSection from '@/components/settings/PropertiesSection';
import AppSettingsSection from '@/components/settings/AppSettingsSection';
import NotificationsSection from '@/components/settings/NotificationsSection';
import XeroSection from '@/components/settings/XeroSection';
import LegalSection from '@/components/settings/LegalSection';

import GuestySection from '@/components/settings/GuestySection';
import GoogleCalendarSection from '@/components/settings/GoogleCalendarSection';
import { Users, Building2, Settings, Bell, Receipt, UserCircle, Scale, Link2, Calendar } from 'lucide-react';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('team');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-primary">Settings</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full flex flex-wrap gap-1 bg-muted rounded-xl p-1 h-auto">
          <TabsTrigger value="team" className="gap-1.5 text-xs rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">Team</span>
          </TabsTrigger>
          <TabsTrigger value="clients" className="gap-1.5 text-xs rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <UserCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Clients</span>
          </TabsTrigger>
          <TabsTrigger value="properties" className="gap-1.5 text-xs rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Building2 className="w-4 h-4" />
            <span className="hidden sm:inline">Properties</span>
          </TabsTrigger>
          <TabsTrigger value="app" className="gap-1.5 text-xs rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">App</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5 text-xs rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Bell className="w-4 h-4" />
            <span className="hidden sm:inline">Alerts</span>
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-1.5 text-xs rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <CreditCard className="w-4 h-4" />
            <span className="hidden sm:inline">Payments</span>
          </TabsTrigger>
          <TabsTrigger value="legal" className="gap-1.5 text-xs rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Scale className="w-4 h-4" />
            <span className="hidden sm:inline">Legal</span>
          </TabsTrigger>
          <TabsTrigger value="guesty" className="gap-1.5 text-xs rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Link2 className="w-4 h-4" />
            <span className="hidden sm:inline">Guesty</span>
          </TabsTrigger>
          <TabsTrigger value="xero" className="gap-1.5 text-xs rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Receipt className="w-4 h-4" />
            <span className="hidden sm:inline">Xero</span>
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5 text-xs rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Calendar className="w-4 h-4" />
            <span className="hidden sm:inline">Calendar</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="team"><TeamSection /></TabsContent>
        <TabsContent value="clients"><ClientsSection /></TabsContent>
        <TabsContent value="properties"><PropertiesSection /></TabsContent>
        <TabsContent value="app"><AppSettingsSection /></TabsContent>
        <TabsContent value="notifications"><NotificationsSection /></TabsContent>
        <TabsContent value="payments"><PaymentsSection /></TabsContent>
        <TabsContent value="legal"><LegalSection /></TabsContent>
        <TabsContent value="guesty"><GuestySection /></TabsContent>
        <TabsContent value="xero"><XeroSection /></TabsContent>
        <TabsContent value="calendar"><GoogleCalendarSection /></TabsContent>
      </Tabs>
    </div>
  );
}
