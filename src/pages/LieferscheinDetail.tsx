import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Trash2, Package, ArrowDown, ArrowUp, RotateCcw, Plus, Mic, FileText, HelpCircle, ChevronDown, ChevronUp, Lock, LockOpen, Search } from "lucide-react";
import { MaterialCatalogDialog } from "@/components/MaterialCatalogDialog";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useEinheiten } from "@/hooks/useEinheiten";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";

type MaterialEntry = {
  id: string;
  material: string;
  menge: string | null;
  einheit: string | null;
  typ: string | null;
  datum: string | null;
  notizen: string | null;
  created_at: string;
  user_id: string;
  profiles?: { vorname: string; nachname: string } | null;
};

type MaterialSummary = {
  material: string;
  einheit: string;
  entnommen: number;
  zurueck: number;
  verbraucht: number;
};

export default function LieferscheinDetail() {
  const { id } = useParams();
  const { toast } = useToast();
  const einheiten = useEinheiten();
  const [lsName, setLsName] = useState("");
  const [lsProjectId, setLsProjectId] = useState<string | null>(null);
  const [lsProject, setLsProject] = useState<string | null>(null);
  const [lsDatum, setLsDatum] = useState("");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [entries, setEntries] = useState<MaterialEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [formTyp, setFormTyp] = useState<string>("entnahme");
  const [formMaterial, setFormMaterial] = useState("");
  const [formMenge, setFormMenge] = useState("");
  const [formEinheit, setFormEinheit] = useState("Stk.");
  const [formNotizen, setFormNotizen] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [returningEntry, setReturningEntry] = useState<MaterialEntry | null>(null);
  const [voiceTyp, setVoiceTyp] = useState<"entnahme" | "rueckgabe" | null>(null);
  const [angebotPositionen, setAngebotPositionen] = useState<{position: number; beschreibung: string; menge: number; einheit: string; einzelpreis: number}[]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const [lsStatus, setLsStatus] = useState<string>("offen");
  const [positionenOpen, setPositionenOpen] = useState(true);
  const [returnDialog, setReturnDialog] = useState<{ material: string; einheit: string; max: number } | null>(null);
  const [returnMenge, setReturnMenge] = useState("");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const isAbgeschlossen = lsStatus === "abgeschlossen";

  // Quick-add inline (like Rechnungen)
  const [quickMaterial, setQuickMaterial] = useState("");
  const [quickMenge, setQuickMenge] = useState("1");
  const [quickEinheit, setQuickEinheit] = useState("Stk.");
  const [quickPreis, setQuickPreis] = useState(0);
  const [quickAcOpen, setQuickAcOpen] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);

  useEffect(() => {
    init();
  }, [id]);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUserId(user.id);
    const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).single();
    setIsAdmin(roleData?.role === "administrator");
    const { data: prjData } = await supabase.from("projects").select("id, name").eq("status", "aktiv").order("name");
    if (prjData) setProjects(prjData);
    await fetchData();
    // Load templates for autocomplete
    const { data: tplData } = await supabase.from("invoice_templates").select("*").order("kategorie, name").limit(5000);
    if (tplData) setTemplates(tplData);
    setLoading(false);
  };

  const fetchData = async () => {
    if (!id) return;

    // Fetch lieferschein
    const { data: ls } = await supabase.from("lieferscheine").select("*, projects(name)").eq("id", id).single();
    if (ls) {
      setLsName(ls.name || (ls.projects as any)?.name || "Lieferschein");
      setLsProjectId(ls.project_id || null);
      setLsProject((ls.projects as any)?.name || null);
      setLsDatum(ls.datum || "");
      setLsStatus((ls as any).status || "offen");
      await fetchAngebotPositionen(ls.project_id || null);
    }

    // Fetch entries
    const { data: entryData } = await supabase
      .from("material_entries")
      .select("*")
      .eq("lieferschein_id", id)
      .order("created_at", { ascending: false });

    if (entryData) {
      const userIds = [...new Set(entryData.map(e => e.user_id))];
      const { data: profiles } = await supabase.from("profiles").select("id, vorname, nachname").in("id", userIds);
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      setEntries(entryData.map(e => ({
        ...e,
        profiles: profileMap.get(e.user_id) || null,
      })));
    }
  };

  const fetchAngebotPositionen = async (projectId: string | null) => {
    if (!projectId) { setAngebotPositionen([]); return; }
    try {
      // Get ALL angebote for this project (not just the latest)
      const { data: angebote, error: angebotError } = await supabase.from("invoices")
        .select("id, nummer")
        .eq("project_id", projectId)
        .eq("typ", "angebot")
        .not("status", "eq", "storniert")
        .order("datum", { ascending: false });

      if (angebotError || !angebote?.length) {
        console.warn("Keine Angebote für Projekt:", projectId, angebotError);
        setAngebotPositionen([]);
        return;
      }

      // Load items from the latest Angebot
      const { data: items, error: itemsError } = await supabase.from("invoice_items")
        .select("position, beschreibung, kurztext, menge, einheit, einzelpreis")
        .eq("invoice_id", angebote[0].id)
        .order("position");

      if (itemsError) {
        console.warn("Fehler beim Laden der Angebotspositionen:", itemsError);
        setAngebotPositionen([]);
        return;
      }

      setAngebotPositionen((items || []).map(i => ({
        ...i,
        beschreibung: (i as any).kurztext || i.beschreibung,
        menge: Number(i.menge),
        einzelpreis: Number(i.einzelpreis) || 0,
      })));
    } catch (err) {
      console.error("fetchAngebotPositionen Fehler:", err);
      setAngebotPositionen([]);
    }
  };

  // Calculate summary
  const summary: MaterialSummary[] = (() => {
    const map = new Map<string, MaterialSummary>();
    entries.forEach(e => {
      const key = e.material.toLowerCase().trim();
      if (!map.has(key)) {
        map.set(key, { material: e.material, einheit: e.einheit || "Stk.", entnommen: 0, zurueck: 0, verbraucht: 0 });
      }
      const s = map.get(key)!;
      const menge = parseFloat(e.menge || "0") || 0;
      if (e.typ === "entnahme") s.entnommen += menge;
      else if (e.typ === "rueckgabe") s.zurueck += menge;
      s.verbraucht = s.entnommen - s.zurueck;
    });
    return Array.from(map.values()).sort((a, b) => a.material.localeCompare(b.material));
  })();

  const openForm = (typ: string) => {
    setFormTyp(typ);
    setFormMaterial("");
    setFormMenge("");
    setFormEinheit("Stk.");
    setFormNotizen("");
    setReturningEntry(null);
    setShowForm(true);
  };

  const openReturnForm = (entry: MaterialEntry) => {
    setFormTyp("rueckgabe");
    setFormMaterial(entry.material);
    setFormMenge(entry.menge || "");
    setFormEinheit(entry.einheit || "Stk.");
    setFormNotizen("");
    setReturningEntry(entry);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUserId || !formMaterial.trim() || !id) return;

    // Validate: can't return more than what was taken
    if (formTyp === "rueckgabe" && formMenge.trim()) {
      const returnAmount = parseFloat(formMenge) || 0;
      const materialKey = formMaterial.toLowerCase().trim();
      const s = summary.find(s => s.material.toLowerCase().trim() === materialKey);
      const maxReturn = s ? s.verbraucht : 0;
      if (returnAmount > maxReturn) {
        toast({ variant: "destructive", title: "Zu viel", description: `Maximal ${maxReturn} ${formEinheit} können zurückgegeben werden (${s?.entnommen || 0} entnommen, ${s?.zurueck || 0} bereits zurück)` });
        return;
      }
    }

    setSubmitting(true);

    const { error } = await supabase.from("material_entries").insert({
      lieferschein_id: id,
      project_id: null,
      user_id: currentUserId,
      material: formMaterial.trim(),
      menge: formMenge.trim() || null,
      einheit: formEinheit,
      einzelpreis: 0,
      typ: formTyp,
      notizen: formNotizen.trim() || null,
      datum: new Date().toISOString().split("T")[0],
    });

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Konnte nicht gespeichert werden" });
    } else {
      toast({ title: formTyp === "rueckgabe" ? "Material zurückgebucht" : "Material entnommen" });
      setShowForm(false);
      setReturningEntry(null);
      fetchData();
    }
    setSubmitting(false);
  };

  const handleQuickAdd = async () => {
    if (!quickMaterial.trim() || !currentUserId || !id) return;
    await supabase.from("material_entries").insert({
      lieferschein_id: id, project_id: null, user_id: currentUserId,
      material: quickMaterial.trim(), menge: quickMenge || "1", einheit: quickEinheit,
      einzelpreis: quickPreis, typ: "entnahme", notizen: null,
      datum: new Date().toISOString().split("T")[0],
    });
    toast({ title: `${quickMenge} ${quickEinheit} ${quickMaterial} entnommen` });
    setQuickMaterial(""); setQuickMenge("1"); setQuickEinheit("Stk."); setQuickPreis(0); setQuickAcOpen(false);
    fetchData();
  };

  const handleDelete = async (entryId: string) => {
    const { error } = await supabase.from("material_entries").delete().eq("id", entryId);
    if (!error) {
      toast({ title: "Gelöscht" });
      fetchData();
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><p>Lädt...</p></div>;
  }

  // Build unified material list: Angebotspositionen + extra entnommene Materialien
  const materialList = (() => {
    const list: { pos: number; material: string; soll: number; einheit: string; entnommen: number; zurueck: number; verbraucht: number; isAngebot: boolean }[] = [];

    // 1. Angebotspositionen with their entnahme status
    angebotPositionen.forEach(p => {
      const s = summary.find(s => s.material.toLowerCase().trim() === p.beschreibung.toLowerCase().trim());
      list.push({
        pos: p.position,
        material: p.beschreibung,
        soll: p.menge,
        einheit: p.einheit,
        entnommen: s?.entnommen || 0,
        zurueck: s?.zurueck || 0,
        verbraucht: s?.verbraucht || 0,
        isAngebot: true,
      });
    });

    // 2. Extra materials (entnommen but not in Angebot)
    summary.forEach(s => {
      const inAngebot = angebotPositionen.some(p => p.beschreibung.toLowerCase().trim() === s.material.toLowerCase().trim());
      if (!inAngebot) {
        list.push({
          pos: list.length + 1,
          material: s.material,
          soll: 0,
          einheit: s.einheit,
          entnommen: s.entnommen,
          zurueck: s.zurueck,
          verbraucht: s.verbraucht,
          isAngebot: false,
        });
      }
    });

    return list;
  })();

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title={lsName} backPath="/material" />

      <main className="container mx-auto px-4 py-4 max-w-lg space-y-3">
        {/* 1. Header: Projekt + Datum + Status */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Select
              value={lsProjectId || "none"}
              onValueChange={async (v) => {
                const newPid = v === "none" ? null : v;
                setLsProjectId(newPid);
                const proj = projects.find(p => p.id === newPid);
                setLsProject(proj?.name || null);
                await supabase.from("lieferscheine").update({ project_id: newPid }).eq("id", id);
                await fetchAngebotPositionen(newPid);
                toast({ title: newPid ? `Projekt: ${proj?.name}` : "Projekt entfernt" });
              }}
            >
              <SelectTrigger className="flex-1 h-9 text-sm">
                <SelectValue placeholder="Projekt wählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Kein Projekt</SelectItem>
                {projects.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {lsDatum && <span className="text-xs text-muted-foreground">{new Date(lsDatum).toLocaleDateString("de-AT")}</span>}
          </div>
          {isAbgeschlossen && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-gray-50 border rounded-md p-2">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              <span>Abgeschlossen — keine Buchungen mehr möglich</span>
              <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs gap-1 text-green-700" onClick={async () => {
                await supabase.from("lieferscheine").update({ status: "offen" } as any).eq("id", id);
                setLsStatus("offen");
                toast({ title: "Wieder geöffnet" });
              }}>
                <LockOpen className="h-3 w-3" /> Öffnen
              </Button>
            </div>
          )}
        </div>

        {/* 2. Sprach-Buttons — groß und klar */}
        {!isAbgeschlossen && !voiceTyp && !showForm && (
          <div className="space-y-2">
            <Button onClick={() => setVoiceTyp("entnahme")} className="w-full gap-3 bg-orange-600 hover:bg-orange-700 h-14 text-base">
              <Mic className="h-6 w-6" />
              Material per Sprache entnehmen
            </Button>
            <div className="grid grid-cols-3 gap-2">
              <Button onClick={() => setVoiceTyp("rueckgabe")} variant="outline" className="gap-2 h-10 text-sm">
                <Mic className="h-4 w-4" />
                Zurückgeben
              </Button>
              <Button onClick={() => setCatalogOpen(true)} variant="outline" className="gap-2 h-10 text-sm">
                <Search className="h-4 w-4" />
                Katalog
              </Button>
              <Button onClick={() => openForm("entnahme")} variant="outline" className="gap-2 h-10 text-sm">
                <Plus className="h-4 w-4" />
                Manuell
              </Button>
            </div>
          </div>
        )}

        {/* 3. Voice Recorder */}
        {voiceTyp && (
          <VoiceRecorder
            typ={voiceTyp}
            existingItems={
              voiceTyp === "rueckgabe"
                ? summary.filter(s => s.verbraucht > 0).map((s, idx) => ({
                    position: idx + 1,
                    material: s.material,
                    menge: String(s.verbraucht),
                    einheit: s.einheit,
                  }))
                : angebotPositionen.length > 0
                  ? angebotPositionen.map(p => ({
                      position: p.position,
                      material: p.beschreibung,
                      menge: String(p.menge),
                      einheit: p.einheit,
                    }))
                  : summary.map((s, idx) => ({
                      position: idx + 1,
                      material: s.material,
                      menge: String(s.verbraucht),
                      einheit: s.einheit,
                    }))
            }
            onAccept={async (voiceItems) => {
              if (!currentUserId || !id) return;
              for (const item of voiceItems) {
                if (voiceTyp === "rueckgabe") {
                  const s = summary.find(s => s.material.toLowerCase().trim() === item.material.toLowerCase().trim());
                  if (item.menge > (s?.verbraucht || 0)) continue;
                }
                // Look up price from Angebotspositionen or catalog
                const angPos = angebotPositionen.find(a => a.beschreibung.toLowerCase().trim() === item.material.toLowerCase().trim());
                const preis = angPos?.einzelpreis || 0;
                await supabase.from("material_entries").insert({
                  lieferschein_id: id, project_id: null, user_id: currentUserId,
                  material: item.material, menge: String(item.menge), einheit: item.einheit,
                  einzelpreis: preis, typ: voiceTyp, notizen: null,
                  datum: new Date().toISOString().split("T")[0],
                });
              }
              toast({ title: `${voiceItems.length} Positionen erfasst` });
              setVoiceTyp(null); setShowForm(false); await fetchData();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            onCancel={() => setVoiceTyp(null)}
          />
        )}

        {/* 4. ENTNOMMEN — Hauptansicht: Was wurde genommen? */}
        {summary.length > 0 && (
          <Card className="border-orange-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ArrowUp className="h-4 w-4 text-orange-600" />
                Entnommen ({summary.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 pt-0">
              {summary.map((s, idx) => (
                <div key={idx} className="border rounded-lg p-2.5 flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight">{s.material}</p>
                    <div className="flex gap-2 text-xs mt-0.5">
                      <span className="text-orange-600 font-medium">{s.entnommen} {s.einheit}</span>
                      {s.zurueck > 0 && <span className="text-green-600">↓ {s.zurueck} zurück</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-bold">{s.verbraucht} {s.einheit}</span>
                    {s.verbraucht > 0 && !isAbgeschlossen && (
                      <Button
                        variant="outline" size="sm"
                        className="gap-1 h-8 text-green-700 border-green-300 hover:bg-green-50 text-xs"
                        onClick={() => { setReturnDialog({ material: s.material, einheit: s.einheit, max: s.verbraucht }); setReturnMenge(""); }}
                      >
                        <RotateCcw className="h-3 w-3" /> Zurück
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Quick-Add: Material direkt eingeben mit Autocomplete */}
        {!isAbgeschlossen && (
          <Card className="border-orange-100">
            <CardContent className="p-3">
              <div className="space-y-2">
                <div className="relative">
                  <Input
                    value={quickMaterial}
                    onChange={(e) => { setQuickMaterial(e.target.value); setQuickAcOpen(true); }}
                    onFocus={() => setQuickAcOpen(true)}
                    onBlur={() => setTimeout(() => setQuickAcOpen(false), 200)}
                    placeholder="Material eingeben oder suchen..."
                    className="pr-10"
                  />
                  {/* Autocomplete dropdown */}
                  {quickAcOpen && quickMaterial.length >= 2 && (() => {
                    const q = quickMaterial.toLowerCase();
                    const results = templates.filter((t: any) => {
                      const kb = (t.kurzbezeichnung || t.name || "").toLowerCase();
                      const pn = (t.produktnummer || "").toLowerCase();
                      return kb.includes(q) || pn.includes(q);
                    }).slice(0, 15);
                    if (results.length === 0) return null;
                    return (
                      <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-popover border rounded-md shadow-lg max-h-56 overflow-y-auto">
                        {results.map((t: any) => (
                          <button
                            key={t.id}
                            type="button"
                            className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent flex justify-between gap-2"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setQuickMaterial(t.kurzbezeichnung || t.name);
                              setQuickEinheit(t.einheit || "Stk.");
                              setQuickPreis(Number(t.netto_preis || t.einzelpreis) || 0);
                              setQuickAcOpen(false);
                            }}
                          >
                            <span className="truncate">{t.kurzbezeichnung || t.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0">{t.einheit}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    value={quickMenge}
                    onChange={(e) => setQuickMenge(e.target.value)}
                    min={0.1}
                    step={0.1}
                    className="w-20 text-center"
                    placeholder="Menge"
                  />
                  <span className="text-sm text-muted-foreground w-12 shrink-0">{quickEinheit}</span>
                  <Button
                    className="flex-1 gap-2 bg-orange-600 hover:bg-orange-700"
                    disabled={!quickMaterial.trim()}
                    onClick={handleQuickAdd}
                  >
                    <Plus className="h-4 w-4" />
                    Entnehmen
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 5. ANGEBOTSPOSITIONEN — eingeklappt als Referenz (nicht bei Rückgabe-Sprache) */}
        {angebotPositionen.length > 0 && !isAbgeschlossen && voiceTyp !== "rueckgabe" && (
          <Card>
            <CardHeader className="pb-0 cursor-pointer" onClick={() => setPositionenOpen(!positionenOpen)}>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5" />
                  Angebotspositionen ({angebotPositionen.length})
                </CardTitle>
                {positionenOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
            </CardHeader>
            {positionenOpen && <CardContent className="space-y-1.5 pt-2">
              {angebotPositionen.map((p) => {
                const s = summary.find(s => s.material.toLowerCase().trim() === p.beschreibung.toLowerCase().trim());
                return (
                  <div key={p.position} className="border rounded-lg p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-xs text-muted-foreground font-mono shrink-0">{String(p.position).padStart(2, "0")}</span>
                        <p className="text-sm leading-tight truncate">{p.beschreibung}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs text-muted-foreground">{p.menge} {p.einheit}</span>
                        {s && <span className="text-xs text-orange-600">{s.verbraucht}/{p.menge}</span>}
                      </div>
                    </div>
                    {/* Quick Entnehmen — immer verfügbar */}
                    {(
                      <div className="flex gap-2 items-center mt-1.5">
                        <Input type="number" step="0.1" min="0" placeholder="Menge" className="h-7 text-xs flex-1" id={`ap-${p.position}`} />
                        <Button size="sm" className="gap-1 h-7 shrink-0 bg-orange-600 hover:bg-orange-700 text-xs px-2"
                          onClick={async () => {
                            const input = document.getElementById(`ap-${p.position}`) as HTMLInputElement;
                            const menge = input?.value?.trim();
                            if (!menge || !currentUserId || !id) { toast({ variant: "destructive", title: "Menge eingeben" }); return; }
                            const { error } = await supabase.from("material_entries").insert({
                              lieferschein_id: id, project_id: null, user_id: currentUserId,
                              material: p.beschreibung, menge, einheit: p.einheit || "Stk.",
                              einzelpreis: p.einzelpreis || 0, typ: "entnahme", notizen: null,
                              datum: new Date().toISOString().split("T")[0],
                            });
                            if (!error) { toast({ title: `${menge} ${p.einheit} entnommen` }); if (input) input.value = ""; fetchData(); }
                          }}
                        ><ArrowUp className="h-3 w-3" /> Entnehmen</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>}
          </Card>
        )}

        {/* Hinweis wenn Projekt aber keine Angebotspositionen */}
        {lsProjectId && angebotPositionen.length === 0 && summary.length === 0 && !isAbgeschlossen && (
          <div className="text-xs text-muted-foreground bg-yellow-50 border border-yellow-200 rounded-md p-2">
            Kein Angebot gefunden. Erstelle ein Angebot und weise es diesem Projekt zu.
          </div>
        )}

        {/* Manual Form — slides in when needed */}
        {showForm && !voiceTyp && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                {formTyp === "entnahme" ? <><ArrowUp className="h-4 w-4 text-orange-500" /> Material eingeben</> : <><ArrowDown className="h-4 w-4 text-green-500" /> Zurückgeben</>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-2">
                <Input value={formMaterial} onChange={(e) => setFormMaterial(e.target.value)} placeholder="Material *" required />
                <div className="flex gap-2">
                  <Input value={formMenge} onChange={(e) => setFormMenge(e.target.value)} placeholder="Menge" type="number" step="0.1" className="flex-1" />
                  <Select value={formEinheit} onValueChange={setFormEinheit}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {einheiten.map(e => (<SelectItem key={e} value={e}>{e}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={submitting || !formMaterial.trim()} className={`flex-1 ${formTyp === "entnahme" ? "bg-orange-600 hover:bg-orange-700" : "bg-green-600 hover:bg-green-700"}`}>
                    {submitting ? "..." : formTyp === "entnahme" ? "Entnehmen" : "Zurückbuchen"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => { setShowForm(false); setReturningEntry(null); }}>Abbrechen</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Abschließen-Button am Ende */}
        {!isAbgeschlossen && entries.length > 0 && (
          <Button variant="outline" className="w-full gap-2" onClick={async () => {
            await supabase.from("lieferscheine").update({ status: "abgeschlossen" } as any).eq("id", id);
            setLsStatus("abgeschlossen");
            toast({ title: "Lieferschein abgeschlossen" });
          }}>
            <Lock className="h-4 w-4" /> Lieferschein abschließen
          </Button>
        )}

        {/* Buchungen — eingeklappt */}
        {entries.length > 0 && (
          <Card>
            <CardHeader className="pb-0 cursor-pointer" onClick={() => setShowHelp(!showHelp)}>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-muted-foreground">Buchungen ({entries.length})</CardTitle>
                {showHelp ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
            </CardHeader>
            {showHelp && <CardContent className="pt-2">
              <div className="space-y-1.5">
                {entries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between gap-2 text-xs py-1.5 border-b last:border-0">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {entry.typ === "entnahme" ? <ArrowUp className="h-3 w-3 text-orange-500 shrink-0" /> : <ArrowDown className="h-3 w-3 text-green-500 shrink-0" />}
                      <span className="truncate">{entry.material}</span>
                      <span className="text-muted-foreground shrink-0">{entry.menge} {entry.einheit}</span>
                    </div>
                    {(isAdmin || entry.user_id === currentUserId) && (
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleDelete(entry.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>}
          </Card>
        )}
      </main>

      {/* Rückgabe-Dialog — öffnet sich oben, kein Scrollen */}
      <Dialog open={!!returnDialog} onOpenChange={(open) => { if (!open) setReturnDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <RotateCcw className="h-4 w-4 text-green-600" />
              Material zurückgeben
            </DialogTitle>
          </DialogHeader>
          {returnDialog && (
            <div className="space-y-3">
              <p className="text-sm font-medium">{returnDialog.material}</p>
              <p className="text-xs text-muted-foreground">Max. {returnDialog.max} {returnDialog.einheit} zurückgebbar</p>
              <div className="flex gap-2 items-center">
                <Input
                  type="number" step="0.1" min="0" max={returnDialog.max}
                  placeholder="Menge"
                  className="flex-1"
                  value={returnMenge}
                  onChange={(e) => setReturnMenge(e.target.value)}
                  autoFocus
                />
                <span className="text-sm text-muted-foreground shrink-0">{returnDialog.einheit}</span>
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700 gap-1"
                  disabled={!returnMenge.trim() || submitting}
                  onClick={async () => {
                    const menge = returnMenge.trim();
                    if (!menge || !currentUserId || !id || !returnDialog) return;
                    const amount = parseFloat(menge);
                    if (amount > returnDialog.max) {
                      toast({ variant: "destructive", title: "Zu viel", description: `Max. ${returnDialog.max} ${returnDialog.einheit}` });
                      return;
                    }
                    setSubmitting(true);
                    const { error } = await supabase.from("material_entries").insert({
                      lieferschein_id: id, project_id: null, user_id: currentUserId,
                      material: returnDialog.material, menge, einheit: returnDialog.einheit,
                      einzelpreis: 0, typ: "rueckgabe", notizen: null,
                      datum: new Date().toISOString().split("T")[0],
                    });
                    setSubmitting(false);
                    if (error) { toast({ variant: "destructive", title: "Fehler" }); }
                    else {
                      toast({ title: `${menge} ${returnDialog.einheit} zurückgegeben` });
                      setReturnDialog(null);
                      fetchData();
                    }
                  }}
                >
                  <RotateCcw className="h-4 w-4" /> Zurückgeben
                </Button>
                <Button variant="outline" onClick={() => setReturnDialog(null)}>Abbrechen</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Materialkatalog-Dialog */}
      <MaterialCatalogDialog
        open={catalogOpen}
        onClose={() => { setCatalogOpen(false); fetchData(); }}
        onSelect={async (item) => {
          if (!currentUserId || !id) return;
          await supabase.from("material_entries").insert({
            lieferschein_id: id, project_id: null, user_id: currentUserId,
            material: item.material, menge: String(item.menge), einheit: item.einheit,
            einzelpreis: item.einzelpreis, typ: "entnahme", notizen: null,
            datum: new Date().toISOString().split("T")[0],
          });
          toast({ title: `${item.menge} ${item.einheit} ${item.material} entnommen` });
        }}
      />
    </div>
  );
}
