import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import LoginPage from "./pages/LoginPage";
import AppLayout from "./components/AppLayout";
import DashboardPage from "./pages/DashboardPage";
import SchedulePage from "./pages/SchedulePage";
import AddJobPage from "./pages/AddJobPage";
import JobChecklistPage from "./pages/JobChecklistPage";
import JobDetailPage from "./pages/JobDetailPage";
import PropertiesPage from "./pages/PropertiesPage";
import PropertyProfilePage from "./pages/PropertyProfilePage";
import PropertyFormPage from "./pages/PropertyFormPage";
import FormsPage from "./pages/FormsPage";
import AIAssistantPage from "./pages/AIAssistantPage";
import QuotingPage from "./pages/QuotingPage";
import StaffPage from "./pages/StaffPage";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-primary font-bold text-lg">Loading...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && role && !allowedRoles.includes(role)) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-primary font-bold text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />} />

      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/schedule/new" element={<ProtectedRoute allowedRoles={['admin', 'head_cleaner']}><AddJobPage /></ProtectedRoute>} />
        <Route path="/properties" element={<ProtectedRoute allowedRoles={['admin', 'head_cleaner']}><PropertiesPage /></ProtectedRoute>} />
        <Route path="/properties/new" element={<ProtectedRoute allowedRoles={['admin']}><PropertyFormPage /></ProtectedRoute>} />
        <Route path="/properties/:id" element={<ProtectedRoute allowedRoles={['admin', 'head_cleaner']}><PropertyProfilePage /></ProtectedRoute>} />
        <Route path="/properties/:id/edit" element={<ProtectedRoute allowedRoles={['admin']}><PropertyFormPage /></ProtectedRoute>} />
        <Route path="/forms" element={<FormsPage />} />
        <Route path="/jobs/:jobId/checklist" element={<JobChecklistPage />} />
        <Route path="/ai-assistant" element={<AIAssistantPage />} />
        <Route path="/quoting" element={<ProtectedRoute allowedRoles={['admin']}><QuotingPage /></ProtectedRoute>} />
        <Route path="/staff" element={<ProtectedRoute allowedRoles={['admin']}><StaffPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute allowedRoles={['admin']}><SettingsPage /></ProtectedRoute>} />
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
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
