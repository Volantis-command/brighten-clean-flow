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

  // BJ, 3 Nov 2026: "the page should be fixed and not move, the only thing that
  // can move up and down is the calendar." The shell is min-h-screen everywhere
  // else so pages grow and the window scrolls, which is right for a list and
  // wrong for a calendar. The schedule locks to the viewport instead, and the
  // grid inside it does the scrolling. Only this route changes.
  // ⚠️ EXACT match, never startsWith. /schedule/new is the Add Job form, which
  // is taller than the screen and has to scroll (BJ, 5 Nov 2026: "i cant scroll
  // down on this page"). Only the calendar itself gets locked to the viewport.
  // Query strings are not part of pathname, so /schedule?date=... still matches.
  const fixedPage = pathname === '/schedule' || pathname === '/schedule/';

  return (
    <div className={`brightly-canvas flex w-full min-w-0 max-w-full ${fixedPage ? 'h-dvh overflow-hidden' : 'min-h-screen'} ${activeEntry ? 'pt-[60px]' : ''}`}>
      <DesktopSidebar />
      <div className={`flex-1 min-w-0 w-full max-w-full flex flex-col ${fixedPage ? 'h-full min-h-0' : 'min-h-screen'}`}>
        <TopBar />
        <main className={`min-w-0 w-full max-w-full flex-1 p-4 md:p-6 ${inCleanWorkflow ? '' : 'pb-24 md:pb-6'} overflow-x-clip ${fixedPage ? 'min-h-0 overflow-y-hidden' : 'overflow-y-auto'}`}>
          <Outlet />
        </main>
        {!inCleanWorkflow && <MobileNav />}
      </div>
    </div>
  );
}
