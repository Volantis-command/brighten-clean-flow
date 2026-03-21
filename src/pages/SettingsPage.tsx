import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import TeamSection from '@/components/settings/TeamSection';
import PropertiesSection from '@/components/settings/PropertiesSection';
import AppSettingsSection from '@/components/settings/AppSettingsSection';
import NotificationsSection from '@/components/settings/NotificationsSection';
import XeroSection from '@/components/settings/XeroSection';
import { Users, Building2, Settings, Bell, Receipt } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-primary">Settings</h1>

      <Tabs defaultValue="team" className="w-full">
        <TabsList className="w-full grid grid-cols-5 bg-muted rounded-xl">
          <TabsTrigger value="team" className="gap-1.5 text-xs sm:text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">Team</span>
          </TabsTrigger>
          <TabsTrigger value="properties" className="gap-1.5 text-xs sm:text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Building2 className="w-4 h-4" />
            <span className="hidden sm:inline">Properties</span>
          </TabsTrigger>
          <TabsTrigger value="app" className="gap-1.5 text-xs sm:text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">App</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5 text-xs sm:text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Bell className="w-4 h-4" />
            <span className="hidden sm:inline">Alerts</span>
          </TabsTrigger>
          <TabsTrigger value="xero" className="gap-1.5 text-xs sm:text-sm rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Receipt className="w-4 h-4" />
            <span className="hidden sm:inline">Xero</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="team"><TeamSection /></TabsContent>
        <TabsContent value="properties"><PropertiesSection /></TabsContent>
        <TabsContent value="app"><AppSettingsSection /></TabsContent>
        <TabsContent value="notifications"><NotificationsSection /></TabsContent>
        <TabsContent value="xero"><XeroSection /></TabsContent>
      </Tabs>
    </div>
  );
}
