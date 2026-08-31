import { useEffect, useState, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useParams, useSearchParams } from "react-router-dom";
import { OnboardingProvider } from "./contexts/OnboardingContext";
import { InstallPromptDialog } from "./components/InstallPromptDialog";
import { useOnboarding } from "./contexts/OnboardingContext";
import { supabase } from "@/integrations/supabase/client";

// Code-Splitting: jede Seite ist ein eigener Chunk — der Browser lädt
// beim Öffnen nur das, was die jeweilige Seite braucht (statt 2,3 MB
// für alles inkl. Excel/PDF-Libraries).
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const TimeTracking = lazy(() => import("./pages/TimeTracking"));
const Projects = lazy(() => import("./pages/Projects"));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail"));
const ProjectOverview = lazy(() => import("./pages/ProjectOverview"));
const MyHours = lazy(() => import("./pages/MyHours"));
const MyDocuments = lazy(() => import("./pages/MyDocuments"));
const Reports = lazy(() => import("./pages/Reports"));
const ConstructionSites = lazy(() => import("./pages/ConstructionSites"));
const Admin = lazy(() => import("./pages/Admin"));
const HoursReport = lazy(() => import("./pages/HoursReport"));
const Employees = lazy(() => import("./pages/Employees"));
const Notepad = lazy(() => import("./pages/Notepad"));
const MaterialList = lazy(() => import("./pages/MaterialList"));
const Disturbances = lazy(() => import("./pages/Disturbances"));
const DisturbanceDetail = lazy(() => import("./pages/DisturbanceDetail"));
const Invoices = lazy(() => import("./pages/Invoices"));
const InvoiceDetail = lazy(() => import("./pages/InvoiceDetail"));
const InvoiceTemplates = lazy(() => import("./pages/InvoiceTemplates"));
const Customers = lazy(() => import("./pages/Customers"));
const OfferPackages = lazy(() => import("./pages/OfferPackages"));
const MaterialWithdraw = lazy(() => import("./pages/MaterialWithdraw"));
const LieferscheinDetail = lazy(() => import("./pages/LieferscheinDetail"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Wrapper that forces re-mount when id or query params change
function InvoiceDetailKeyed() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const key = `${id || "new"}-${searchParams.get("typ") || ""}-${searchParams.get("from_angebot") || ""}`;
  return <InvoiceDetail key={key} />;
}
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AenderungswunschKnopf } from "./components/aenderungswunsch/AenderungswunschKnopf";

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
    </div>
  );
}

const queryClient = new QueryClient();

function AppContent() {
  const {
    showInstallDialog,
    handleInstallDialogClose,
  } = useOnboarding();
  // Melden setzt eine Anmeldung voraus (der Wunsch wird auf die eigene
  // user-id gebucht) — auf der Anmeldeseite darf der Knopf nicht erscheinen.
  const [angemeldet, setAngemeldet] = useState(false);

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAngemeldet(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setAngemeldet(!!session),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <>
      <Suspense fallback={<PageLoader />}>
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
        <Route path="/invoices/new" element={<ProtectedRoute><InvoiceDetailKeyed /></ProtectedRoute>} />
        <Route path="/invoices/:id" element={<ProtectedRoute><InvoiceDetailKeyed /></ProtectedRoute>} />
        <Route path="/materials" element={<ProtectedRoute><InvoiceTemplates /></ProtectedRoute>} />
        <Route path="/material-withdraw" element={<ProtectedRoute><MaterialWithdraw /></ProtectedRoute>} />
        <Route path="/material" element={<ProtectedRoute><MaterialWithdraw /></ProtectedRoute>} />
        <Route path="/material/:id" element={<ProtectedRoute><LieferscheinDetail /></ProtectedRoute>} />
        <Route path="/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>

      {/* Für Seiten ohne eigene Kopfzeile. Blendet sich selbst aus, sobald
          auf der Seite ein [data-seitenkopf] steht. */}
      {angemeldet && <AenderungswunschKnopf gestalt="schwebend" />}

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
