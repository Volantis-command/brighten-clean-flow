import { Outlet, useLocation } from 'react-router-dom';
import { DesktopSidebar, MobileNav } from '@/components/Navigation';
import { TopBar } from '@/components/TopBar';
import { useActiveTimeEntry } from '@/hooks/useActiveTimeEntry';

export default function AppLayout() {
  const { data: activeEntry } = useActiveTimeEntry();
  const { pathname } = useLocation();

  // Active clean workflow is a focused, single-task flow with its own
  // back button — hiding the bottom nav keeps the COMPLETE JOB / Clock Off
  // button visible and stops accidental taps that would yank a cleaner
  // out of an in-progress clean.
  const inCleanWorkflow = pathname.startsWith('/clean/');

  return (
    <div className={`min-h-screen flex w-full min-w-0 max-w-full bg-background ${activeEntry ? 'pt-[60px]' : ''}`}>
      <DesktopSidebar />
      <div className="flex-1 min-w-0 w-full max-w-full flex flex-col min-h-screen">
        <TopBar />
        <main className={`min-w-0 w-full max-w-full flex-1 p-4 md:p-6 ${inCleanWorkflow ? '' : 'pb-24 md:pb-6'} overflow-x-clip overflow-y-auto`}>
          <Outlet />
        </main>
        {!inCleanWorkflow && <MobileNav />}
      </div>
    </div>
  );
}
