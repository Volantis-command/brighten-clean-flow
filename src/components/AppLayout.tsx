import { Outlet } from 'react-router-dom';
import { DesktopSidebar, MobileNav } from '@/components/Navigation';
import { TopBar } from '@/components/TopBar';
import { useActiveTimeEntry } from '@/hooks/useActiveTimeEntry';

export default function AppLayout() {
  const { data: activeEntry } = useActiveTimeEntry();

  return (
    <div className={`min-h-screen flex w-full bg-background ${activeEntry ? 'pt-[60px]' : ''}`}>
      <DesktopSidebar />
      <div className="flex-1 flex flex-col min-h-screen">
        <TopBar />
        <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6 overflow-x-hidden overflow-y-auto">
          <Outlet />
        </main>
        <MobileNav />
      </div>
    </div>
  );
}
