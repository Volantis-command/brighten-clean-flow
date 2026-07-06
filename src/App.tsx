import { Component, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { BrowserRouter, Route, Routes, Navigate, useNavigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import LoginPage from "./pages/LoginPage";
import PhoneLoginPage from "./pages/PhoneLoginPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import ClientLoginPage from "./pages/ClientLoginPage";
import AppLayout from "./components/AppLayout";
import { ActiveClockBanner } from "./components/ActiveClockBanner";
import DashboardPage from "./pages/DashboardPage";
import ActionsPage from "./pages/ActionsPage";
import SchedulePage from "./pages/SchedulePage";
import AddJobPage from "./pages/AddJobPage";
import JobChecklistPage from "./pages/JobChecklistPage";
import JobDetailPage from "./pages/JobDetailPage";
import EditJobPage from "./pages/EditJobPage";
import PropertyProfilePage from "./pages/PropertyProfilePage";
import PropertyFormPage from "./pages/PropertyFormPage";
import AIAssistantPage from "./pages/AIAssistantPage";
import QuotingPage from "./pages/QuotingPage";
import AirbnbQuotePage from "./pages/AirbnbQuotePage";
import StaffPage from "./pages/StaffPage";
import SettingsPage from "./pages/SettingsPage";
import ClientsPage from "./pages/ClientsPage";
import QCAuditPage from "./pages/QCAuditPage";
import FormDetailPage from "./pages/FormDetailPage";
import ClientDetailPage from "./pages/ClientDetailPage";
import MagicLinkPortalPage from "./pages/MagicLinkPortalPage";
import MagicLinkPropertyPage from "./pages/MagicLinkPropertyPage";
import FeedbackPage from "./pages/FeedbackPage";

import LinenPortalLoginPage from "./pages/LinenPortalLoginPage";
import LinenPortalDashboardPage from "./pages/LinenPortalDashboardPage";
import LinenAdminPage from "./pages/LinenAdminPage";
import BookingRequestsPage from "./pages/BookingRequestsPage";
import BookingSuggestionsPage from "./pages/BookingSuggestionsPage";
import QuoteFollowupsPage from "./pages/QuoteFollowupsPage";
import CleanerProfilePage from "./pages/CleanerProfilePage";
// QuoteRequestFormPage deleted — /quote/:token now uses QuoteIntakePage
// QuoteAcceptPage removed — redirects to QuoteViewPage
import QuoteViewPage from "./pages/QuoteViewPage";
import TimesheetsPage from "./pages/TimesheetsPage";
import StaffOnboardingPage from "./pages/StaffOnboardingPage";
import CleanerOnboardingPage from "./pages/CleanerOnboardingPage";
import CleanerAvailabilityPage from "./pages/CleanerAvailabilityPage";
import MyBrightlyScorePage from "./pages/MyBrightlyScorePage";
import MyPaySummaryPage from "./pages/MyPaySummaryPage";
import HeadCleanerQCPage from "./pages/HeadCleanerQCPage";
import HeadCleanerQCAuditPage from "./pages/HeadCleanerQCAuditPage";
import ClientSchedulePage from "./pages/ClientSchedulePage";
import ClientRebookPage from "./pages/ClientRebookPage";
import CleanerPortalPage from "./pages/CleanerPortalPage";
import CleanReportPage from "./pages/CleanReportPage";
// EnquiryPage deleted — enquiries go through the pipeline
import BookingPage from "./pages/BookingPage";
import QuoteIntakePage from "./pages/QuoteIntakePage";
import MyCleans from "./pages/MyCleans";
import MyJobsPage from "./pages/MyJobsPage";
import CleanWorkflowPage from "./pages/CleanWorkflowPage";
import CompletionFormPage from "./pages/CompletionFormPage";
import JobCompleteDonePage from "./pages/JobCompleteDonePage";
import JobAuditPage from "./pages/JobAuditPage";

import PendingInvoicesPage from "./pages/PendingInvoicesPage";
import FinancialsPage from "./pages/FinancialsPage";
import PendingTimeEditsPage from "./pages/PendingTimeEditsPage";

import LiveTrackerPage from "./pages/LiveTrackerPage";
import MapPage from "./pages/MapPage";
import GuestReadyReportPage from "./pages/GuestReadyReportPage";
import PropertyPassportPage from "./pages/PropertyPassportPage";
import NotFound from "./pages/NotFound";
import SmokeTestPage from "./pages/SmokeTestPage";
import StaffMagicAuthPage from "./pages/auth/StaffMagicAuthPage";
// ClientPortalLoginPage deleted — /client-portal now uses ClientLoginPage
import ClientPortalVerifyPage from "./pages/ClientPortalVerifyPage";
import ClientPortalDashboardPage from "./pages/ClientPortalDashboardPage";
import ClientPortalPropertyPage from "./pages/ClientPortalPropertyPage";

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
  if (role === 'client') return <Navigate to="/client-portal" replace />;
  if (allowedRoles && role && !allowedRoles.includes(role)) return <Navigate to="/dashboard" replace />;

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
  const { user, loading } = useAuth();
  const redirect = sessionStorage.getItem('spa-redirect');

  useEffect(() => {
    if (redirect) {
      sessionStorage.removeItem('spa-redirect');
      navigate(redirect, { replace: true });
    }
  }, [redirect, navigate]);

  if (redirect || loading) {
    return <BrandedLoading />;
  }
  // Logged in → go straight to dashboard; not logged in → login page.
  return <Navigate to={user ? '/dashboard' : '/login'} replace />;
}

function QuoteAcceptRedirect() {
  const { token } = useParams();
  return <Navigate to={`/quote-view/${token}`} replace />;
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
      {/* Phone OTP is the canonical login for everyone. /login-emergency
          is the legacy email+password page kept as a backdoor in case
          the OTP flow breaks (Twilio outage, dashboard misconfig, etc).
          Don't link to it from anywhere — admin uses it via direct URL. */}
      <Route path="/login" element={<AuthenticatedArea><PhoneLoginPage /></AuthenticatedArea>} />
      <Route path="/login-emergency" element={<LoginPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Old auth surfaces redirect to the unified phone login. */}
      <Route path="/auth/staff" element={<Navigate to="/login" replace />} />
      <Route path="/client-login" element={<Navigate to="/login" replace />} />

      <Route path="/" element={<AuthenticatedArea><RootRedirect /></AuthenticatedArea>} />

      {/* Public token routes */}
      <Route path="/client/:token" element={<MagicLinkPortalPage />} />
      <Route path="/client/:token/property/:id" element={<MagicLinkPropertyPage />} />
      <Route path="/feedback/:token" element={<FeedbackPage />} />
      <Route path="/quote/:token" element={<QuoteIntakePage />} />
      <Route path="/quote/:token/accept" element={<QuoteAcceptRedirect />} />
      <Route path="/quote-view/:token" element={<QuoteViewPage />} />
      <Route path="/staff-onboarding/:token" element={<StaffOnboardingPage />} />
      <Route path="/client/:token/schedule" element={<ClientSchedulePage />} />
      <Route path="/client/:token/rebook" element={<ClientRebookPage />} />
      <Route path="/client/:token/property/:id/rebook" element={<ClientRebookPage />} />
      <Route path="/cleaner/:token" element={<CleanerPortalPage />} />
      <Route path="/report/:token" element={<CleanReportPage />} />
      <Route path="/book" element={<BookingPage />} />
      <Route path="/quote" element={<QuoteIntakePage />} />
      {/* Legacy redirects — the marketing SMS + Airbnb rebook button send clients to
          these paths. Do not delete without also updating send-quote-link-sms edge
          function and GuestReadyReportPage. The /onboard path is the main marketing
          site's "Get a Quote" CTA (brightly.cleaning). */}
      <Route path="/residential-quote" element={<Navigate to="/quote" replace />} />
      <Route path="/airbnb" element={<Navigate to="/quote" replace />} />
      <Route path="/onboard" element={<Navigate to="/quote" replace />} />
      <Route path="/contact" element={<Navigate to="/quote" replace />} />
      <Route path="/get-quote" element={<Navigate to="/quote" replace />} />
      <Route path="/track/:jobId" element={<LiveTrackerPage />} />
      <Route path="/guest-report/:jobId" element={<GuestReadyReportPage />} />
      <Route path="/cleaner-onboarding" element={<AuthenticatedArea><CleanerOnboardingPage /></AuthenticatedArea>} />
      <Route path="/passport/:propertyId" element={<PropertyPassportPage />} />

      {/* Linen company portal (phone OTP, no Supabase session) */}
      <Route path="/linen-portal" element={<LinenPortalLoginPage />} />
      <Route path="/linen-portal/dashboard" element={<LinenPortalDashboardPage />} />

      {/* Client portal (SMS magic link session) */}
      <Route path="/client-portal" element={<Navigate to="/login" replace />} />
      <Route path="/client-portal/verify" element={<ClientPortalVerifyPage />} />
      <Route path="/client-portal/dashboard" element={<ClientPortalDashboardPage />} />
      <Route path="/client-portal/property/:id" element={<ClientPortalPropertyPage />} />

      {/* Protected staff routes */}
      <Route element={<AuthenticatedArea><><ActiveClockBanner /><ProtectedRoute><AppLayout /></ProtectedRoute></></AuthenticatedArea>}>
        <Route path="/actions" element={<ProtectedRoute allowedRoles={['admin', 'head_cleaner']}><ActionsPage /></ProtectedRoute>} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/map" element={<ProtectedRoute allowedRoles={['admin', 'head_cleaner']}><MapPage /></ProtectedRoute>} />
        <Route path="/schedule/new" element={<ProtectedRoute allowedRoles={['admin', 'head_cleaner']}><AddJobPage /></ProtectedRoute>} />
        <Route path="/properties/new" element={<ProtectedRoute allowedRoles={['admin']}><PropertyFormPage /></ProtectedRoute>} />
        <Route path="/properties/:id" element={<ProtectedRoute allowedRoles={['admin', 'head_cleaner']}><PropertyProfilePage /></ProtectedRoute>} />
        <Route path="/properties/:id/edit" element={<ProtectedRoute allowedRoles={['admin']}><PropertyFormPage /></ProtectedRoute>} />
        <Route path="/forms/:formId" element={<FormDetailPage />} />
        <Route path="/jobs/:jobId" element={<JobDetailPage />} />
        <Route path="/jobs/:jobId/edit" element={<ProtectedRoute allowedRoles={['admin', 'head_cleaner']}><EditJobPage /></ProtectedRoute>} />
        <Route path="/jobs/:jobId/checklist" element={<JobChecklistPage />} />
        <Route path="/ai-assistant" element={<AIAssistantPage />} />
        <Route path="/quoting" element={<ProtectedRoute allowedRoles={['admin']}><QuotingPage /></ProtectedRoute>} />
        <Route path="/airbnb-quote" element={<ProtectedRoute allowedRoles={['admin']}><AirbnbQuotePage /></ProtectedRoute>} />
        <Route path="/staff" element={<ProtectedRoute allowedRoles={['admin']}><StaffPage /></ProtectedRoute>} />
        <Route path="/clients" element={<ProtectedRoute allowedRoles={['admin']}><ClientsPage /></ProtectedRoute>} />
        <Route path="/clients/:id" element={<ProtectedRoute allowedRoles={['admin']}><ClientDetailPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute allowedRoles={['admin']}><SettingsPage /></ProtectedRoute>} />
        <Route path="/requests" element={<ProtectedRoute allowedRoles={['admin']}><BookingRequestsPage /></ProtectedRoute>} />
        <Route path="/qc-audit" element={<ProtectedRoute allowedRoles={['admin', 'head_cleaner']}><QCAuditPage /></ProtectedRoute>} />
        <Route path="/bookings/suggestions" element={<ProtectedRoute allowedRoles={['admin']}><BookingSuggestionsPage /></ProtectedRoute>} />
        <Route path="/quotes/followups-pending" element={<ProtectedRoute allowedRoles={['admin']}><QuoteFollowupsPage /></ProtectedRoute>} />
        <Route path="/linen" element={<ProtectedRoute allowedRoles={['admin']}><LinenAdminPage /></ProtectedRoute>} />
        <Route path="/timesheets" element={<ProtectedRoute allowedRoles={['admin']}><TimesheetsPage /></ProtectedRoute>} />
        <Route path="/invoices/pending" element={<ProtectedRoute allowedRoles={['admin']}><PendingInvoicesPage /></ProtectedRoute>} />
        <Route path="/financials" element={<ProtectedRoute allowedRoles={['admin']}><FinancialsPage /></ProtectedRoute>} />
        <Route path="/timesheets/pending-edits" element={<ProtectedRoute allowedRoles={['admin']}><PendingTimeEditsPage /></ProtectedRoute>} />
        <Route path="/profile" element={<CleanerProfilePage />} />
        <Route path="/my-cleans" element={<MyCleans />} />
        <Route path="/my-jobs" element={<MyJobsPage />} />
        <Route path="/clean/:jobId" element={<CleanWorkflowPage />} />
        <Route path="/clean/:jobId/complete" element={<CompletionFormPage />} />
        <Route path="/clean/:jobId/done" element={<JobCompleteDonePage />} />
        <Route path="/jobs/:jobId/audit" element={<ProtectedRoute allowedRoles={['admin', 'head_cleaner']}><JobAuditPage /></ProtectedRoute>} />
        {/* cleaner-onboarding moved to public routes for token access */}
        <Route path="/availability" element={<CleanerAvailabilityPage />} />
        <Route path="/my-score" element={<MyBrightlyScorePage />} />
        <Route path="/my-pay" element={<MyPaySummaryPage />} />
        <Route path="/qc" element={<ProtectedRoute allowedRoles={['admin', 'head_cleaner']}><HeadCleanerQCPage /></ProtectedRoute>} />
        <Route path="/qc/:jobId" element={<ProtectedRoute allowedRoles={['admin', 'head_cleaner']}><HeadCleanerQCAuditPage /></ProtectedRoute>} />
        <Route path="/smoke-test" element={<ProtectedRoute allowedRoles={['admin']}><SmokeTestPage /></ProtectedRoute>} />


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
