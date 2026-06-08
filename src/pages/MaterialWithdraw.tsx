import { useEffect, useState, useMemo } from "react";
import { Trash2, Package, Plus, FileText, ArrowRight, Info, CheckCircle2, AlertTriangle, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  const [searchParams] = useSearchParams();
  const filterProjectId = searchParams.get("project");
  const [lieferscheine, setLieferscheine] = useState<Lieferschein[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  // Projekt-Konsolidierung: alle Material-Entries + Angebot-Positionen für dieses Projekt
  const [projectEntries, setProjectEntries] = useState<{ material: string; einheit: string; menge: number; typ: string }[]>([]);
  const [projectAngebot, setProjectAngebot] = useState<{ beschreibung: string; menge: number; einheit: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Form
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newProjectId, setNewProjectId] = useState<string>(filterProjectId || "none");
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
    const { data } = await supabase.from("projects").select("id, name").eq("status", "aktiv").order("name");
    if (data) setProjects(data);
  };

  const fetchLieferscheine = async () => {
    let query = supabase
      .from("lieferscheine")
      .select("*")
      .order("created_at", { ascending: false });
    if (filterProjectId) query = query.eq("project_id", filterProjectId);
    const { data: lsData } = await query;

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

    // Im Projekt-Modus: Aggregat über alle Materialien dieses Projekts laden
    if (filterProjectId) {
      await fetchProjectAggregate(filterProjectId);
    }
  };

  const fetchProjectAggregate = async (projectId: string) => {
    // Material-Entries für dieses Projekt: direkt per project_id ODER
    // indirekt über Lieferscheine die zum Projekt gehören.
    // (Historisch werden Entries oft nur per lieferschein_id verknüpft.)
    const { data: lsIdsData } = await supabase
      .from("lieferscheine")
      .select("id")
      .eq("project_id", projectId);
    const lsIds = (lsIdsData || []).map((l: any) => l.id);

    const directEntriesPromise = supabase
      .from("material_entries")
      .select("id, material, einheit, menge, typ")
      .eq("project_id", projectId);

    const lsEntriesPromise = lsIds.length > 0
      ? supabase
          .from("material_entries")
          .select("id, material, einheit, menge, typ")
          .in("lieferschein_id", lsIds)
      : Promise.resolve({ data: [] as any[] });

    const [{ data: direct }, { data: viaLs }] = await Promise.all([directEntriesPromise, lsEntriesPromise]);

    // Dedupe per ID (Eintrag kann theoretisch über beide Wege geladen werden)
    const byId = new Map<string, any>();
    [...(direct || []), ...(viaLs || [])].forEach((e: any) => {
      if (!byId.has(e.id)) byId.set(e.id, e);
    });
    const merged = Array.from(byId.values());

    setProjectEntries(merged.map((e: any) => ({
      material: e.material,
      einheit: e.einheit || "Stk.",
      menge: parseFloat(e.menge || "0") || 0,
      typ: e.typ,
    })));

    // Neuestes nicht-storniertes Angebot dieses Projekts
    const { data: angebote } = await supabase
      .from("invoices")
      .select("id")
      .eq("project_id", projectId)
      .eq("typ", "angebot")
      .not("status", "eq", "storniert")
      .order("datum", { ascending: false })
      .limit(1);

    if (angebote && angebote.length > 0) {
      const { data: items } = await supabase
        .from("invoice_items")
        .select("position, beschreibung, kurztext, menge, einheit")
        .eq("invoice_id", angebote[0].id)
        .order("position");
      setProjectAngebot((items || []).map((i: any) => ({
        beschreibung: i.kurztext || i.beschreibung,
        menge: Number(i.menge) || 0,
        einheit: i.einheit || "Stk.",
      })));
    } else {
      setProjectAngebot([]);
    }
  };

  const canCreate = newProjectId !== "none" || newName.trim().length > 0;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserId) return;
    if (!canCreate) {
      toast({ variant: "destructive", title: "Bitte Projekt auswählen oder Name eingeben" });
      return;
    }
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
    if (!confirm("Lieferschein und alle Materialeinträge wirklich löschen?")) return;
    // Delete material entries first, then lieferschein
    await supabase.from("material_entries").delete().eq("lieferschein_id", id);
    const { error } = await supabase.from("lieferscheine").delete().eq("id", id);
    if (!error) {
      toast({ title: "Lieferschein gelöscht" });
      fetchLieferscheine();
    } else {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><p>Lädt...</p></div>;
  }

  // Konsolidierte Material-Übersicht für das Projekt (nur im Projekt-Modus)
  type MaterialRow = { material: string; einheit: string; soll: number; entnommen: number; zurueck: number; verbraucht: number; inAngebot: boolean };
  const materialAggregat: MaterialRow[] = (() => {
    if (!filterProjectId) return [];
    const map = new Map<string, MaterialRow>();
    // Aus Angebot: soll-Mengen
    projectAngebot.forEach(p => {
      const key = p.beschreibung.toLowerCase().trim();
      if (!key) return;
      map.set(key, { material: p.beschreibung, einheit: p.einheit, soll: p.menge, entnommen: 0, zurueck: 0, verbraucht: 0, inAngebot: true });
    });
    // Aus material_entries: entnommen/zurück aufsummieren
    projectEntries.forEach(e => {
      const key = e.material.toLowerCase().trim();
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, { material: e.material, einheit: e.einheit, soll: 0, entnommen: 0, zurueck: 0, verbraucht: 0, inAngebot: false });
      }
      const row = map.get(key)!;
      if (e.typ === "entnahme") row.entnommen += e.menge;
      else if (e.typ === "rueckgabe") row.zurueck += e.menge;
      row.verbraucht = row.entnommen - row.zurueck;
    });
    return Array.from(map.values()).sort((a, b) => {
      // Angebots-Positionen zuerst, dann extras
      if (a.inAngebot !== b.inAngebot) return a.inAngebot ? -1 : 1;
      return a.material.localeCompare(b.material);
    });
  })();

  const aggregatTotalEntnommen = materialAggregat.reduce((s, r) => s + r.entnommen, 0);
  const aggregatTotalZurueck = materialAggregat.reduce((s, r) => s + r.zurueck, 0);

  const fmt = (n: number) => n.toLocaleString("de-AT", { maximumFractionDigits: 2 });
  const projektName = filterProjectId ? projects.find(p => p.id === filterProjectId)?.name : null;

  const filteredLieferscheine = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return lieferscheine;
    return lieferscheine.filter(ls => {
      const name = (ls.name || "").toLowerCase();
      const projekt = ((ls.projects as any)?.name || "").toLowerCase();
      const verfasser = `${ls.profiles?.vorname || ""} ${ls.profiles?.nachname || ""}`.toLowerCase();
      const datum = ls.datum ? new Date(ls.datum).toLocaleDateString("de-AT") : "";
      return name.includes(q) || projekt.includes(q) || verfasser.includes(q) || datum.includes(q);
    });
  }, [lieferscheine, searchQuery]);

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title={filterProjectId ? `Lieferscheine — ${projects.find(p => p.id === filterProjectId)?.name || "Projekt"}` : "Material / Lieferscheine"} backPath={filterProjectId ? `/projects/${filterProjectId}` : "/"} />

      <main className={`container mx-auto px-4 py-6 space-y-4 ${filterProjectId ? "max-w-5xl" : "max-w-3xl"}`}>
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
                    <label className="text-sm font-medium">Name {newProjectId === "none" ? "*" : "(optional)"}</label>
                    <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="z.B. Badezimmer EG" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Projekt {!newName.trim() ? "*" : "(optional)"}</label>
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
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-blue-50 border border-blue-200 rounded-md p-2.5">
                  <Info className="h-4 w-4 text-blue-500 shrink-0" />
                  <span>Projekt oder Name ist erforderlich. Wähle ein Projekt, um Angebotspositionen automatisch zu laden.</span>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={submitting || !canCreate} className="bg-orange-600 hover:bg-orange-700">
                    {submitting ? "Erstellt..." : "Erstellen & öffnen"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Abbrechen</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Projekt-Modus: konsolidierte Material-Übersicht oben */}
        {filterProjectId && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Material-Gesamtübersicht
              </CardTitle>
              <CardDescription>
                {projektName ? `${projektName} · ` : ""}
                {lieferscheine.length} {lieferscheine.length === 1 ? "Lieferschein" : "Lieferscheine"} ·
                {" "}{materialAggregat.length} {materialAggregat.length === 1 ? "Material" : "Materialien"}
                {aggregatTotalEntnommen > 0 && ` · ${fmt(aggregatTotalEntnommen)} entnommen, ${fmt(aggregatTotalZurueck)} zurück`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {materialAggregat.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Noch keine Materialien für dieses Projekt verbucht.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Material</TableHead>
                        <TableHead className="text-right">Soll</TableHead>
                        <TableHead className="text-right">Entnommen</TableHead>
                        <TableHead className="text-right">Zurück</TableHead>
                        <TableHead className="text-right">Verbraucht</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {materialAggregat.map((row, idx) => {
                        const isExtra = !row.inAngebot;
                        const isComplete = row.inAngebot && row.soll > 0 && Math.abs(row.verbraucht - row.soll) < 0.01;
                        const isOver = row.inAngebot && row.soll > 0 && row.verbraucht > row.soll + 0.01;
                        const isPartial = row.inAngebot && row.soll > 0 && row.verbraucht > 0 && row.verbraucht < row.soll - 0.01;
                        return (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{row.material}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{row.inAngebot ? `${fmt(row.soll)} ${row.einheit}` : "—"}</TableCell>
                            <TableCell className="text-right">{fmt(row.entnommen)} {row.einheit}</TableCell>
                            <TableCell className="text-right text-green-700">{fmt(row.zurueck)} {row.einheit}</TableCell>
                            <TableCell className={`text-right font-medium ${isOver ? "text-red-600" : ""}`}>{fmt(row.verbraucht)} {row.einheit}</TableCell>
                            <TableCell>
                              {isExtra && <Badge variant="outline" className="text-xs">Extra</Badge>}
                              {isComplete && (
                                <Badge variant="outline" className="text-xs text-green-700 border-green-200 gap-1">
                                  <CheckCircle2 className="h-3 w-3" /> Vollständig
                                </Badge>
                              )}
                              {isOver && (
                                <Badge variant="outline" className="text-xs text-red-600 border-red-200 gap-1">
                                  <AlertTriangle className="h-3 w-3" /> Übermäßig
                                </Badge>
                              )}
                              {isPartial && <Badge variant="outline" className="text-xs text-muted-foreground">Teilweise</Badge>}
                              {row.inAngebot && row.verbraucht <= 0.01 && <Badge variant="outline" className="text-xs text-muted-foreground">Offen</Badge>}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {filterProjectId ? "Einzelne Lieferscheine" : "Lieferscheine"}
            </CardTitle>
            <CardDescription>
              {searchQuery.trim()
                ? `${filteredLieferscheine.length} von ${lieferscheine.length} Lieferscheinen`
                : filterProjectId
                  ? "Klick öffnet den jeweiligen Lieferschein"
                  : `${lieferscheine.length} Lieferscheine`}
            </CardDescription>
            {lieferscheine.length > 0 && (
              <div className="relative mt-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Suchen nach Name, Projekt, Verfasser oder Datum..."
                  className="pl-9 pr-9"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"
                    aria-label="Suche leeren"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent>
            {lieferscheine.length === 0 ? (
              <div className="text-center py-12">
                <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-semibold mb-2">Keine Lieferscheine</p>
                <p className="text-sm text-muted-foreground">Erstelle einen Lieferschein um Material zu verwalten</p>
              </div>
            ) : filteredLieferscheine.length === 0 ? (
              <div className="text-center py-8">
                <Search className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium mb-1">Keine Treffer</p>
                <p className="text-xs text-muted-foreground mb-3">für "{searchQuery}"</p>
                <Button variant="outline" size="sm" onClick={() => setSearchQuery("")}>Suche leeren</Button>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredLieferscheine.map((ls) => (
                  <div
                    key={ls.id}
                    className={`rounded-lg border bg-card hover:bg-muted/50 cursor-pointer flex items-center justify-between gap-3 transition-colors ${filterProjectId ? "p-2.5" : "p-4"}`}
                    onClick={() => navigate(`/material/${ls.id}`)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={filterProjectId ? "text-sm font-medium" : "font-medium"}>
                          {ls.name || "Lieferschein"}
                        </p>
                        {!filterProjectId && (ls.projects ? (
                          <Badge variant="secondary" className="text-xs">{(ls.projects as any).name}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">Kein Projekt</Badge>
                        ))}
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
                      {(isAdmin || (ls.user_id === currentUserId && ls.entnahmen === 0 && ls.rueckgaben === 0)) && (
                        <Button variant="ghost" size="sm" onClick={(e) => handleDelete(ls.id, e)} title="Lieferschein löschen">
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
