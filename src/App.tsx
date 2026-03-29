import { Component, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useNavigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import LoginPage from "./pages/LoginPage";
import ClientLoginPage from "./pages/ClientLoginPage";
import AppLayout from "./components/AppLayout";
import ClientPortalLayout from "./components/portal/ClientPortalLayout";
import { ActiveClockBanner } from "./components/ActiveClockBanner";
import DashboardPage from "./pages/DashboardPage";
import ActionsPage from "./pages/ActionsPage";
import SchedulePage from "./pages/SchedulePage";
import AddJobPage from "./pages/AddJobPage";
import JobChecklistPage from "./pages/JobChecklistPage";
import JobDetailPage from "./pages/JobDetailPage";
import EditJobPage from "./pages/EditJobPage";
import PropertiesPage from "./pages/PropertiesPage";
import PropertyProfilePage from "./pages/PropertyProfilePage";
import PropertyFormPage from "./pages/PropertyFormPage";
import FormsPage from "./pages/FormsPage";
import AIAssistantPage from "./pages/AIAssistantPage";
import QuotingPage from "./pages/QuotingPage";
import StaffPage from "./pages/StaffPage";
import SettingsPage from "./pages/SettingsPage";
import ClientsPage from "./pages/ClientsPage";
import QCAuditPage from "./pages/QCAuditPage";
import FormDetailPage from "./pages/FormDetailPage";
import ClientDetailPage from "./pages/ClientDetailPage";
import ClientPortalPage from "./pages/ClientPortalPage";
import ClientPropertyDetailPage from "./pages/ClientPropertyDetailPage";
import MagicLinkPortalPage from "./pages/MagicLinkPortalPage";
import MagicLinkPropertyPage from "./pages/MagicLinkPropertyPage";
import FeedbackPage from "./pages/FeedbackPage";
import OnboardingPage from "./pages/OnboardingPage";
import BookingRequestsPage from "./pages/BookingRequestsPage";
import NotificationsPage from "./pages/NotificationsPage";
import CleanerProfilePage from "./pages/CleanerProfilePage";
import QuoteRequestFormPage from "./pages/QuoteRequestFormPage";
import QuoteAcceptPage from "./pages/QuoteAcceptPage";
import QuoteViewPage from "./pages/QuoteViewPage";
import TimesheetsPage from "./pages/TimesheetsPage";
import StaffOnboardingPage from "./pages/StaffOnboardingPage";
import ClientSchedulePage from "./pages/ClientSchedulePage";
import ClientRebookPage from "./pages/ClientRebookPage";
import CleanerPortalPage from "./pages/CleanerPortalPage";
import CleanReportPage from "./pages/CleanReportPage";
import EnquiryPage from "./pages/EnquiryPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

class AppErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background px-10 py-12 text-destructive">
          <h2 className="text-2xl font-bold">App crashed</h2>
          <pre className="mt-4 whitespace-pre-wrap text-sm">{String(this.state.error)}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}

/** Branded loading screen — shown while auth resolves. Never a blank div. */
function BrandedLoading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-primary">
      <h1
        className="text-5xl font-extrabold text-primary-foreground tracking-tight"
        style={{ fontFamily: 'Nunito, sans-serif' }}
      >
        Brightly<span className="text-accent">.</span>
      </h1>
      <p className="text-primary-foreground/60 text-sm mt-3 animate-pulse">Loading…</p>
    </div>
  );
}

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { user, role, loading } = useAuth();

  if (loading || (user && role === undefined)) {
    return <BrandedLoading />;
  }

  if (!user) return <Navigate to="/login" replace />;
  if (role === 'client') return <Navigate to="/portal" replace />;
  if (allowedRoles && role && !allowedRoles.includes(role)) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}

function ClientRoute({ children }: { children: React.ReactNode }) {
  const { user, role, loading } = useAuth();

  if (loading || (user && role === undefined)) {
    return <BrandedLoading />;
  }

  if (!user) return <Navigate to="/client-login" replace />;
  if (role !== 'client') return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}

function SpaRedirectHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    const redirect = sessionStorage.getItem('spa-redirect');
    if (redirect) {
      sessionStorage.removeItem('spa-redirect');
      navigate(redirect, { replace: true });
    }
  }, [navigate]);
  return null;
}

function RootRedirect() {
  const navigate = useNavigate();
  const redirect = sessionStorage.getItem('spa-redirect');

  useEffect(() => {
    if (redirect) {
      sessionStorage.removeItem('spa-redirect');
      navigate(redirect, { replace: true });
    }
  }, [redirect, navigate]);

  if (redirect) {
    return <BrandedLoading />;
  }
  return <Navigate to="/login" replace />;
}

function AuthenticatedArea({ children }: { children: React.ReactNode }) {
  return (
    <AppErrorBoundary>
      <AuthProvider>{children}</AuthProvider>
    </AppErrorBoundary>
  );
}

function AppRoutes() {
  return (
    <Routes>
      {/* === FULLY PUBLIC — no auth check at all === */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/client-login" element={<AuthenticatedArea><ClientLoginPage /></AuthenticatedArea>} />

      {/* Root — always redirect to login */}
      <Route path="/" element={<RootRedirect />} />

      {/* Client portal */}
      <Route element={<AuthenticatedArea><ClientRoute><ClientPortalLayout /></ClientRoute></AuthenticatedArea>}>
        <Route path="/portal" element={<ClientPortalPage />} />
        <Route path="/portal/property/:id" element={<ClientPropertyDetailPage />} />
      </Route>

      {/* Public token routes */}
      <Route path="/client/:token" element={<MagicLinkPortalPage />} />
      <Route path="/client/:token/property/:id" element={<MagicLinkPropertyPage />} />
      <Route path="/feedback/:token" element={<FeedbackPage />} />
      <Route path="/onboard/:token" element={<OnboardingPage />} />
      <Route path="/quote/:token" element={<QuoteRequestFormPage />} />
      <Route path="/quote/:token/accept" element={<QuoteAcceptPage />} />
      <Route path="/quote-view/:token" element={<QuoteViewPage />} />
      <Route path="/staff-onboarding/:token" element={<StaffOnboardingPage />} />
      <Route path="/staff-onboard/:token" element={<StaffOnboardingPage />} />
      <Route path="/client/:token/schedule" element={<ClientSchedulePage />} />
      <Route path="/client/:token/rebook" element={<ClientRebookPage />} />
      <Route path="/cleaner/:token" element={<CleanerPortalPage />} />
      <Route path="/report/:token" element={<CleanReportPage />} />
      <Route path="/enquire" element={<EnquiryPage />} />

      {/* Protected staff routes */}
      <Route element={<AuthenticatedArea><><ActiveClockBanner /><ProtectedRoute><AppLayout /></ProtectedRoute></></AuthenticatedArea>}>
        <Route path="/actions" element={<ProtectedRoute allowedRoles={['admin', 'head_cleaner']}><ActionsPage /></ProtectedRoute>} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/schedule/new" element={<ProtectedRoute allowedRoles={['admin', 'head_cleaner']}><AddJobPage /></ProtectedRoute>} />
        <Route path="/properties" element={<ProtectedRoute allowedRoles={['admin', 'head_cleaner']}><PropertiesPage /></ProtectedRoute>} />
        <Route path="/properties/new" element={<ProtectedRoute allowedRoles={['admin']}><PropertyFormPage /></ProtectedRoute>} />
        <Route path="/properties/:id" element={<ProtectedRoute allowedRoles={['admin', 'head_cleaner']}><PropertyProfilePage /></ProtectedRoute>} />
        <Route path="/properties/:id/edit" element={<ProtectedRoute allowedRoles={['admin']}><PropertyFormPage /></ProtectedRoute>} />
        <Route path="/forms" element={<FormsPage />} />
        <Route path="/forms/:formId" element={<FormDetailPage />} />
        <Route path="/jobs/:jobId" element={<JobDetailPage />} />
        <Route path="/jobs/:jobId/edit" element={<ProtectedRoute allowedRoles={['admin']}><EditJobPage /></ProtectedRoute>} />
        <Route path="/jobs/:jobId/checklist" element={<JobChecklistPage />} />
        <Route path="/ai-assistant" element={<AIAssistantPage />} />
        <Route path="/quoting" element={<ProtectedRoute allowedRoles={['admin']}><QuotingPage /></ProtectedRoute>} />
        <Route path="/staff" element={<ProtectedRoute allowedRoles={['admin']}><StaffPage /></ProtectedRoute>} />
        <Route path="/clients" element={<ProtectedRoute allowedRoles={['admin']}><ClientsPage /></ProtectedRoute>} />
        <Route path="/clients/:id" element={<ProtectedRoute allowedRoles={['admin']}><ClientDetailPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute allowedRoles={['admin']}><SettingsPage /></ProtectedRoute>} />
        <Route path="/requests" element={<ProtectedRoute allowedRoles={['admin']}><BookingRequestsPage /></ProtectedRoute>} />
        <Route path="/qc-audit" element={<ProtectedRoute allowedRoles={['admin', 'head_cleaner']}><QCAuditPage /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute allowedRoles={['admin']}><NotificationsPage /></ProtectedRoute>} />
        <Route path="/timesheets" element={<ProtectedRoute allowedRoles={['admin']}><TimesheetsPage /></ProtectedRoute>} />
        <Route path="/profile" element={<CleanerProfilePage />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <SpaRedirectHandler />
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
