import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { OnboardingProvider } from "./contexts/OnboardingContext";
import { InstallPromptDialog } from "./components/InstallPromptDialog";
import { useOnboarding } from "./contexts/OnboardingContext";
import { supabase } from "@/integrations/supabase/client";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import TimeTracking from "./pages/TimeTracking";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import ProjectOverview from "./pages/ProjectOverview";
import MyHours from "./pages/MyHours";
import MyDocuments from "./pages/MyDocuments";
import Reports from "./pages/Reports";
import ConstructionSites from "./pages/ConstructionSites";
import Admin from "./pages/Admin";
import HoursReport from "./pages/HoursReport";
import Employees from "./pages/Employees";
import Notepad from "./pages/Notepad";
import MaterialList from "./pages/MaterialList";
import Disturbances from "./pages/Disturbances";
import DisturbanceDetail from "./pages/DisturbanceDetail";
import Invoices from "./pages/Invoices";
import InvoiceDetail from "./pages/InvoiceDetail";
import InvoiceTemplates from "./pages/InvoiceTemplates";
import Customers from "./pages/Customers";
import OfferPackages from "./pages/OfferPackages";
import MaterialWithdraw from "./pages/MaterialWithdraw";
import LieferscheinDetail from "./pages/LieferscheinDetail";
import NotFound from "./pages/NotFound";
import { ProtectedRoute } from "./components/ProtectedRoute";

const queryClient = new QueryClient();

function AppContent() {
  const {
    showInstallDialog,
    handleInstallDialogClose,
  } = useOnboarding();

  // Ensure user profile exists (for users created via Cloud dashboard)
  useEffect(() => {
    const ensureProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.rpc('ensure_user_profile');
      }
    };
    ensureProfile();
  }, []);

  return (
    <>
      <Routes>
        {/* Public routes */}
        <Route path="/auth" element={<Auth />} />

        {/* Protected routes — require active account */}
        <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
        <Route path="/time-tracking" element={<ProtectedRoute><TimeTracking /></ProtectedRoute>} />
        <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
        <Route path="/projects/:projectId" element={<ProtectedRoute><ProjectOverview /></ProtectedRoute>} />
        <Route path="/projects/:projectId/:type" element={<ProtectedRoute><ProjectDetail /></ProtectedRoute>} />
        <Route path="/projects/:projectId/materials" element={<ProtectedRoute><MaterialList /></ProtectedRoute>} />
        <Route path="/my-hours" element={<ProtectedRoute><MyHours /></ProtectedRoute>} />
        <Route path="/my-documents" element={<ProtectedRoute><MyDocuments /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
        <Route path="/construction-sites" element={<ProtectedRoute><ConstructionSites /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
        <Route path="/hours-report" element={<ProtectedRoute><HoursReport /></ProtectedRoute>} />
        <Route path="/employees" element={<ProtectedRoute><Employees /></ProtectedRoute>} />
        <Route path="/notepad" element={<ProtectedRoute><Notepad /></ProtectedRoute>} />
        <Route path="/disturbances" element={<ProtectedRoute><Disturbances /></ProtectedRoute>} />
        <Route path="/disturbances/:id" element={<ProtectedRoute><DisturbanceDetail /></ProtectedRoute>} />
        <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
        <Route path="/invoices/templates" element={<ProtectedRoute><InvoiceTemplates /></ProtectedRoute>} />
        <Route path="/invoices/packages" element={<ProtectedRoute><OfferPackages /></ProtectedRoute>} />
        <Route path="/invoices/new" element={<ProtectedRoute><InvoiceDetail /></ProtectedRoute>} />
        <Route path="/invoices/:id" element={<ProtectedRoute><InvoiceDetail /></ProtectedRoute>} />
        <Route path="/materials" element={<ProtectedRoute><InvoiceTemplates /></ProtectedRoute>} />
        <Route path="/material-withdraw" element={<ProtectedRoute><MaterialWithdraw /></ProtectedRoute>} />
        <Route path="/material" element={<ProtectedRoute><MaterialWithdraw /></ProtectedRoute>} />
        <Route path="/material/:id" element={<ProtectedRoute><LieferscheinDetail /></ProtectedRoute>} />
        <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>

      {/* Install Prompt Dialog */}
      <InstallPromptDialog
        open={showInstallDialog}
        onClose={handleInstallDialogClose}
      />
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <OnboardingProvider>
          <AppContent />
        </OnboardingProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
