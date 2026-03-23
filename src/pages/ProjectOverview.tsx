import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, FileText, FileCheck, Package, Camera, ImagePlus, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type DocumentCategory = {
  type: "plans" | "reports" | "photos" | "chef";
  title: string;
  description: string;
  icon: React.ReactNode;
  count: number;
  adminOnly?: boolean;
};

const ProjectOverview = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [projectName, setProjectName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [lieferscheinCount, setLieferscheinCount] = useState(0);
  const [invoiceCount, setInvoiceCount] = useState(0);
  const [categories, setCategories] = useState<DocumentCategory[]>([
    {
      type: "photos",
      title: "Fotos",
      description: "Baufortschritt und Dokumentationsfotos",
      icon: <Camera className="h-8 w-8" />,
      count: 0,
    },
    {
      type: "plans",
      title: "Pläne",
      description: "Baupläne und technische Zeichnungen",
      icon: <FileText className="h-8 w-8" />,
      count: 0,
    },
    {
      type: "chef",
      title: "🔒 Chefordner",
      description: "Vertrauliche Chef-Dokumente",
      icon: <Lock className="h-8 w-8" />,
      count: 0,
      adminOnly: true,
    },
  ]);

  useEffect(() => {
    if (projectId) {
      checkAdminStatus();
      fetchProjectName();
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId) {
      fetchFileCounts();
      fetchLieferscheinCount();
      fetchInvoiceCount();
    }
  }, [projectId, isAdmin]);

  const checkAdminStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "administrator")
      .maybeSingle();

    setIsAdmin(!!data);
  };

  const fetchProjectName = async () => {
    if (!projectId) return;
    
    const { data } = await supabase
      .from("projects")
      .select("name")
      .eq("id", projectId)
      .single();

    if (data) {
      setProjectName(data.name);
    }
  };

  const fetchLieferscheinCount = async () => {
    if (!projectId) return;
    const { count } = await supabase
      .from("lieferscheine")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId);
    setLieferscheinCount(count || 0);
  };

  const fetchInvoiceCount = async () => {
    if (!projectId) return;
    const { count } = await supabase
      .from("invoices")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId);
    setInvoiceCount(count || 0);
  };

  const fetchFileCounts = async () => {
    if (!projectId) return;

    const bucketMap: Record<string, string> = {
      plans: "project-plans",
      reports: "project-reports",
      photos: "project-photos",
      chef: "project-chef",
    };

    const updatedCategories = await Promise.all(
      categories.map(async (category) => {
        // Skip chef bucket for non-admins
        if (category.type === "chef" && !isAdmin) {
          return { ...category, count: 0 };
        }
        
        const bucket = bucketMap[category.type];
        const { data } = await supabase
          .storage
          .from(bucket)
          .list(projectId);

        return {
          ...category,
          count: data?.length || 0,
        };
      })
    );

    setCategories(updatedCategories);
  };

  const handleQuickPhotoUpload = () => {
    navigate(`/projects/${projectId}/photos`);
  };

  // Filter categories based on admin status
  const visibleCategories = categories.filter(
    (category) => !category.adminOnly || isAdmin
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/projects")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Zurück</span>
            </Button>
            <img 
              src="/logo-tilger.png"
              alt="Fliesentechnik Tilger"
              className="h-8 sm:h-10 w-auto cursor-pointer hover:opacity-80 transition-opacity object-contain" 
              onClick={() => navigate("/projects")}
            />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">{projectName}</h1>
          <p className="text-muted-foreground">Dokumentation und Dateien</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {visibleCategories.map((category) => (
            <Card 
              key={category.type}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => navigate(`/projects/${projectId}/${category.type}`)}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="text-primary">{category.icon}</div>
                  <div className="text-2xl font-bold">{category.count}</div>
                </div>
                <CardTitle className="text-xl">{category.title}</CardTitle>
                <CardDescription>{category.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full">
                  Öffnen
                </Button>
              </CardContent>
            </Card>
          ))}

          {/* Lieferscheine */}
          <Card
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate(`/material?project=${projectId}`)}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="text-primary"><Package className="h-8 w-8" /></div>
                <div className="text-2xl font-bold">{lieferscheinCount}</div>
              </div>
              <CardTitle className="text-xl">Lieferscheine</CardTitle>
              <CardDescription>Material-Entnahmen und Rückgaben</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">
                Öffnen
              </Button>
            </CardContent>
          </Card>

          {/* Angebote & Rechnungen */}
          {isAdmin && (
            <Card
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => navigate(`/invoices?project=${projectId}`)}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="text-primary"><FileText className="h-8 w-8" /></div>
                  <div className="text-2xl font-bold">{invoiceCount}</div>
                </div>
                <CardTitle className="text-xl">Angebote & Rechnungen</CardTitle>
                <CardDescription>Zugeordnete Angebote und Rechnungen</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full">
                  Öffnen
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Floating Action Button für Fotos */}
        <Button 
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg"
          size="icon"
          onClick={handleQuickPhotoUpload}
        >
          <ImagePlus className="h-6 w-6" />
        </Button>
      </main>
    </div>
  );
};

export default ProjectOverview;
