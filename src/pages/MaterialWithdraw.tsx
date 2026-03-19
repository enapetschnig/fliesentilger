import { useEffect, useState } from "react";
import { Trash2, Package, ArrowDown, ArrowUp, Minus, Filter, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";

type Project = { id: string; name: string };

type MaterialEntry = {
  id: string;
  project_id: string | null;
  user_id: string;
  material: string;
  menge: string | null;
  notizen: string | null;
  einheit: string | null;
  einzelpreis: number | null;
  typ: string | null;
  datum: string | null;
  created_at: string;
  profiles?: { vorname: string; nachname: string } | null;
  projects?: { name: string } | null;
};

export default function MaterialWithdraw() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<MaterialEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [filterProject, setFilterProject] = useState<string>("alle");

  // Form
  const [showForm, setShowForm] = useState(false);
  const [newMaterial, setNewMaterial] = useState("");
  const [newMenge, setNewMenge] = useState("");
  const [newEinheit, setNewEinheit] = useState("Stk.");
  const [newTyp, setNewTyp] = useState<string>("entnahme");
  const [newNotizen, setNewNotizen] = useState("");
  const [newProjectId, setNewProjectId] = useState<string>("none");
  const [submitting, setSubmitting] = useState(false);
  // Track which entry we're returning (for pre-filled form)
  const [returningEntryId, setReturningEntryId] = useState<string | null>(null);

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
    await Promise.all([fetchProjects(), fetchEntries()]);
    setLoading(false);
  };

  const fetchProjects = async () => {
    const { data } = await supabase
      .from("projects")
      .select("id, name")
      .order("name");
    if (data) setProjects(data);
  };

  const fetchEntries = async () => {
    const { data, error } = await supabase
      .from("material_entries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (!error && data) {
      const userIds = [...new Set(data.map(e => e.user_id))];
      const projectIds = [...new Set(data.map(e => e.project_id).filter(Boolean))] as string[];

      const [{ data: profiles }, { data: projectsData }] = await Promise.all([
        supabase.from("profiles").select("id, vorname, nachname").in("id", userIds),
        projectIds.length > 0
          ? supabase.from("projects").select("id, name").in("id", projectIds)
          : Promise.resolve({ data: [] }),
      ]);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      const projectMap = new Map(projectsData?.map(p => [p.id, p]) || []);

      setEntries(data.map(entry => ({
        ...entry,
        profiles: profileMap.get(entry.user_id) || null,
        projects: entry.project_id ? projectMap.get(entry.project_id) || null : null,
      })) as MaterialEntry[]);
    }
  };

  const openNewForm = (typ: string) => {
    setNewTyp(typ);
    setNewMaterial("");
    setNewMenge("");
    setNewEinheit("Stk.");
    setNewNotizen("");
    setNewProjectId("none");
    setReturningEntryId(null);
    setShowForm(true);
  };

  const openReturnForm = (entry: MaterialEntry) => {
    setNewTyp("rueckgabe");
    setNewMaterial(entry.material);
    setNewMenge(entry.menge || "");
    setNewEinheit(entry.einheit || "Stk.");
    setNewProjectId(entry.project_id || "none");
    setNewNotizen("");
    setReturningEntryId(entry.id);
    setShowForm(true);
    // Scroll to top
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserId || !newMaterial.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.from("material_entries").insert({
      project_id: newProjectId === "none" ? null : newProjectId,
      user_id: currentUserId,
      material: newMaterial.trim(),
      menge: newMenge.trim() || null,
      einheit: newEinheit,
      einzelpreis: 0,
      typ: newTyp,
      notizen: newNotizen.trim() || null,
      datum: new Date().toISOString().split("T")[0],
    });
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Konnte nicht gespeichert werden" });
    } else {
      toast({ title: newTyp === "rueckgabe" ? "Material zurückgebucht" : "Material entnommen" });
      setNewMaterial("");
      setNewMenge("");
      setNewNotizen("");
      setNewProjectId("none");
      setReturningEntryId(null);
      setShowForm(false);
      fetchEntries();
    }
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("material_entries").delete().eq("id", id);
    if (!error) {
      toast({ title: "Gelöscht" });
      fetchEntries();
    }
  };

  const canDelete = (entry: MaterialEntry) => isAdmin || entry.user_id === currentUserId;

  const typIcon = (typ: string | null) => {
    if (typ === "entnahme") return <ArrowUp className="h-3.5 w-3.5 text-red-500" />;
    if (typ === "rueckgabe") return <ArrowDown className="h-3.5 w-3.5 text-green-500" />;
    return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  const typLabel = (typ: string | null) => {
    if (typ === "entnahme") return "Entnommen";
    if (typ === "rueckgabe") return "Zurückgebracht";
    return "Verbrauch";
  };

  const typColor = (typ: string | null) => {
    if (typ === "entnahme") return "bg-red-100 text-red-800";
    if (typ === "rueckgabe") return "bg-green-100 text-green-800";
    return "bg-muted text-muted-foreground";
  };

  const filtered = filterProject === "alle"
    ? entries
    : filterProject === "none"
      ? entries.filter(e => !e.project_id)
      : entries.filter(e => e.project_id === filterProject);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><p>Lädt...</p></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Material entnehmen" backPath="/" />

      <main className="container mx-auto px-4 py-6 max-w-3xl space-y-4">
        {/* Neuer Eintrag / Buttons */}
        {!showForm && (
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => openNewForm("entnahme")} className="gap-2 bg-orange-600 hover:bg-orange-700">
              <ArrowUp className="h-4 w-4" />
              Material entnehmen
            </Button>
            <Button onClick={() => openNewForm("rueckgabe")} variant="outline" className="gap-2">
              <ArrowDown className="h-4 w-4" />
              Material zurückbringen
            </Button>
          </div>
        )}

        {/* Formular */}
        {showForm && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                {newTyp === "entnahme" ? (
                  <><ArrowUp className="h-5 w-5 text-red-500" /> Material entnehmen</>
                ) : (
                  <><ArrowDown className="h-5 w-5 text-green-500" /> Material zurückbringen</>
                )}
              </CardTitle>
              {returningEntryId && (
                <CardDescription>Vorausgefüllt von der Entnahme — Menge anpassen falls nötig</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-sm font-medium">Material *</label>
                    <Input value={newMaterial} onChange={(e) => setNewMaterial(e.target.value)} placeholder="z.B. Fliese 30x60 anthrazit" required />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Menge</label>
                    <Input value={newMenge} onChange={(e) => setNewMenge(e.target.value)} placeholder="z.B. 25" type="number" step="0.1" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Einheit</label>
                    <Select value={newEinheit} onValueChange={setNewEinheit}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Stk.">Stk.</SelectItem>
                        <SelectItem value="m²">m²</SelectItem>
                        <SelectItem value="m">lfm</SelectItem>
                        <SelectItem value="kg">kg</SelectItem>
                        <SelectItem value="Sack">Sack</SelectItem>
                        <SelectItem value="Eimer">Eimer</SelectItem>
                        <SelectItem value="Pkg.">Pkg.</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
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
                  <div className="col-span-2">
                    <label className="text-sm font-medium">Notizen</label>
                    <Input value={newNotizen} onChange={(e) => setNewNotizen(e.target.value)} placeholder="Optionale Bemerkung" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={submitting || !newMaterial.trim()} className={newTyp === "entnahme" ? "bg-orange-600 hover:bg-orange-700" : "bg-green-600 hover:bg-green-700"}>
                    {submitting ? "Speichert..." : newTyp === "entnahme" ? "Entnehmen" : "Zurückbuchen"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => { setShowForm(false); setReturningEntryId(null); }}>Abbrechen</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Übersicht */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Materialübersicht
                </CardTitle>
                <CardDescription>{filtered.length} Einträge</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <Select value={filterProject} onValueChange={setFilterProject}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle Projekte</SelectItem>
                    <SelectItem value="none">Ohne Projekt</SelectItem>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <div className="text-center py-12">
                <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-semibold mb-2">Keine Einträge</p>
                <p className="text-sm text-muted-foreground">Noch kein Material entnommen</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((entry) => (
                  <div key={entry.id} className="p-3 rounded-lg border bg-card flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {typIcon(entry.typ)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm truncate">{entry.material}</p>
                          <Badge variant="secondary" className={`text-xs shrink-0 ${typColor(entry.typ)}`}>
                            {typLabel(entry.typ)}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {entry.menge && `${entry.menge} ${entry.einheit || ""}`}
                          {entry.profiles ? ` · ${entry.profiles.vorname} ${entry.profiles.nachname}` : ""}
                          {entry.projects ? ` · ${entry.projects.name}` : " · Kein Projekt"}
                          {" · "}
                          {entry.datum ? new Date(entry.datum).toLocaleDateString("de-AT") : new Date(entry.created_at).toLocaleDateString("de-AT")}
                        </p>
                        {entry.notizen && <p className="text-xs text-muted-foreground italic mt-0.5">{entry.notizen}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {entry.typ === "entnahme" && (
                        <Button variant="outline" size="sm" onClick={() => openReturnForm(entry)} className="gap-1 text-green-700 border-green-300 hover:bg-green-50">
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Zurückgeben</span>
                        </Button>
                      )}
                      {canDelete(entry) && (
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(entry.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
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
