import { Outlet } from 'react-router-dom';
import { DesktopSidebar, MobileNav } from '@/components/Navigation';
import { TopBar } from '@/components/TopBar';

export default function AppLayout() {
  return (
    <div className="min-h-screen flex w-full bg-background">
      <DesktopSidebar />
      <div className="flex-1 flex flex-col min-h-screen">
        <TopBar />
        <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6 overflow-auto">
          <Outlet />
        </main>
        <MobileNav />
      </div>
    </div>
  );
}
