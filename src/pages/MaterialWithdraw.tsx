import { useEffect, useState } from "react";
import { Trash2, Package, Plus, FileText, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";

type Project = { id: string; name: string };

type Lieferschein = {
  id: string;
  name: string | null;
  project_id: string | null;
  user_id: string;
  datum: string | null;
  notizen: string | null;
  created_at: string;
  projects?: { name: string } | null;
  profiles?: { vorname: string; nachname: string } | null;
  entnahmen: number;
  rueckgaben: number;
  materialCount: number;
};

export default function MaterialWithdraw() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [lieferscheine, setLieferscheine] = useState<Lieferschein[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newProjectId, setNewProjectId] = useState<string>("none");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUserId(user.id);
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();
    setIsAdmin(roleData?.role === "administrator");
    await Promise.all([fetchProjects(), fetchLieferscheine()]);
    setLoading(false);
  };

  const fetchProjects = async () => {
    const { data } = await supabase.from("projects").select("id, name").order("name");
    if (data) setProjects(data);
  };

  const fetchLieferscheine = async () => {
    const { data: lsData } = await supabase
      .from("lieferscheine")
      .select("*")
      .order("created_at", { ascending: false });

    if (!lsData) return;

    const userIds = [...new Set(lsData.map(l => l.user_id))];
    const projectIds = [...new Set(lsData.map(l => l.project_id).filter(Boolean))] as string[];
    const lsIds = lsData.map(l => l.id);

    const [{ data: profiles }, { data: projectsData }, { data: entries }] = await Promise.all([
      supabase.from("profiles").select("id, vorname, nachname").in("id", userIds),
      projectIds.length > 0
        ? supabase.from("projects").select("id, name").in("id", projectIds)
        : Promise.resolve({ data: [] }),
      lsIds.length > 0
        ? supabase.from("material_entries").select("lieferschein_id, typ, material").in("lieferschein_id", lsIds)
        : Promise.resolve({ data: [] }),
    ]);

    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
    const projectMap = new Map(projectsData?.map(p => [p.id, p]) || []);

    const entryStats = new Map<string, { entnahmen: number; rueckgaben: number; materials: Set<string> }>();
    (entries || []).forEach(e => {
      if (!e.lieferschein_id) return;
      if (!entryStats.has(e.lieferschein_id)) {
        entryStats.set(e.lieferschein_id, { entnahmen: 0, rueckgaben: 0, materials: new Set() });
      }
      const stats = entryStats.get(e.lieferschein_id)!;
      if (e.typ === "entnahme") stats.entnahmen++;
      else if (e.typ === "rueckgabe") stats.rueckgaben++;
      stats.materials.add(e.material);
    });

    setLieferscheine(lsData.map(ls => {
      const stats = entryStats.get(ls.id) || { entnahmen: 0, rueckgaben: 0, materials: new Set() };
      return {
        ...ls,
        profiles: profileMap.get(ls.user_id) || null,
        projects: ls.project_id ? projectMap.get(ls.project_id) || null : null,
        entnahmen: stats.entnahmen,
        rueckgaben: stats.rueckgaben,
        materialCount: stats.materials.size,
      };
    }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserId) return;
    setSubmitting(true);

    const { data, error } = await supabase
      .from("lieferscheine")
      .insert({
        name: newName.trim() || null,
        project_id: newProjectId === "none" ? null : newProjectId,
        user_id: currentUserId,
        datum: new Date().toISOString().split("T")[0],
      })
      .select("id")
      .single();

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Konnte nicht erstellt werden" });
    } else if (data) {
      toast({ title: "Lieferschein erstellt" });
      setShowForm(false);
      setNewName("");
      setNewProjectId("none");
      navigate(`/material/${data.id}`);
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const { error } = await supabase.from("lieferscheine").delete().eq("id", id);
    if (!error) {
      toast({ title: "Gelöscht" });
      fetchLieferscheine();
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><p>Lädt...</p></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Material / Lieferscheine" backPath="/" />

      <main className="container mx-auto px-4 py-6 max-w-3xl space-y-4">
        {!showForm ? (
          <Button onClick={() => setShowForm(true)} className="gap-2 bg-orange-600 hover:bg-orange-700">
            <Plus className="h-4 w-4" />
            Neuer Lieferschein
          </Button>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Neuer Lieferschein
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium">Name (optional)</label>
                    <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="z.B. Badezimmer EG" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Projekt (optional)</label>
                    <Select value={newProjectId} onValueChange={setNewProjectId}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Kein Projekt</SelectItem>
                        {projects.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={submitting} className="bg-orange-600 hover:bg-orange-700">
                    {submitting ? "Erstellt..." : "Erstellen & öffnen"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Abbrechen</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Lieferscheine
            </CardTitle>
            <CardDescription>{lieferscheine.length} Lieferscheine</CardDescription>
          </CardHeader>
          <CardContent>
            {lieferscheine.length === 0 ? (
              <div className="text-center py-12">
                <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-semibold mb-2">Keine Lieferscheine</p>
                <p className="text-sm text-muted-foreground">Erstelle einen Lieferschein um Material zu verwalten</p>
              </div>
            ) : (
              <div className="space-y-2">
                {lieferscheine.map((ls) => (
                  <div
                    key={ls.id}
                    className="p-4 rounded-lg border bg-card hover:bg-muted/50 cursor-pointer flex items-center justify-between gap-3 transition-colors"
                    onClick={() => navigate(`/material/${ls.id}`)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">
                          {ls.name || "Lieferschein"}
                        </p>
                        {ls.projects ? (
                          <Badge variant="secondary" className="text-xs">{(ls.projects as any).name}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">Kein Projekt</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                        <span>{ls.datum ? new Date(ls.datum).toLocaleDateString("de-AT") : ""}</span>
                        {ls.profiles && <span>· {ls.profiles.vorname} {ls.profiles.nachname}</span>}
                        <span>· {ls.materialCount} Materialien</span>
                        {ls.entnahmen > 0 && (
                          <Badge variant="outline" className="text-xs text-red-600 border-red-200">
                            {ls.entnahmen} entnommen
                          </Badge>
                        )}
                        {ls.rueckgaben > 0 && (
                          <Badge variant="outline" className="text-xs text-green-600 border-green-200">
                            {ls.rueckgaben} zurück
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {(isAdmin || ls.user_id === currentUserId) && ls.entnahmen === 0 && ls.rueckgaben === 0 && (
                        <Button variant="ghost" size="sm" onClick={(e) => handleDelete(ls.id, e)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
