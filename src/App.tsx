import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-primary font-bold text-lg">Loading...</div>
    </div>
  );
}

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { user, role, loading } = useAuth();

  if (loading || (user && role === undefined)) {
    return <RouteLoading />;
  }

  if (!user) return <Navigate to="/login" replace />;
  if (role === 'client') return <Navigate to="/portal" replace />;
  if (allowedRoles && role && !allowedRoles.includes(role)) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}

function ClientRoute({ children }: { children: React.ReactNode }) {
  const { user, role, loading } = useAuth();

  if (loading || (user && role === undefined)) {
    return <RouteLoading />;
  }

  if (!user) return <Navigate to="/client-login" replace />;
  if (role !== 'client') return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}

function AppRoutes() {
  const { user, role, loading } = useAuth();

  if (loading || (user && role === undefined)) {
    return <RouteLoading />;
  }

  const getHomeRedirect = () => {
    if (!user) return <Navigate to="/login" replace />;
    if (role === 'client') return <Navigate to="/portal" replace />;
    return <Navigate to="/dashboard" replace />;
  };

  const getLoginRedirect = () => {
    if (!user) return <LoginPage />;
    if (role === 'client') return <Navigate to="/portal" replace />;
    return <Navigate to="/dashboard" replace />;
  };

  const getClientLoginRedirect = () => {
    if (!user) return <ClientLoginPage />;
    if (role === 'client') return <Navigate to="/portal" replace />;
    return <Navigate to="/dashboard" replace />;
  };

  return (
    <Routes>
      <Route path="/login" element={getLoginRedirect()} />
      <Route path="/client-login" element={getClientLoginRedirect()} />
      <Route path="/" element={getHomeRedirect()} />

      <Route element={<ClientRoute><ClientPortalLayout /></ClientRoute>}>
        <Route path="/portal" element={<ClientPortalPage />} />
        <Route path="/portal/property/:id" element={<ClientPropertyDetailPage />} />
      </Route>

      {/* Public routes — no auth required */}
      <Route path="/client/:token" element={<MagicLinkPortalPage />} />
      <Route path="/client/:token/property/:id" element={<MagicLinkPropertyPage />} />
      <Route path="/feedback/:token" element={<FeedbackPage />} />
      <Route path="/onboard/:token" element={<OnboardingPage />} />

      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
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
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ActiveClockBanner />
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
