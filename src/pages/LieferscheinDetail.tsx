import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Trash2, Package, ArrowDown, ArrowUp, RotateCcw, Plus, Mic } from "lucide-react";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
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
  const [lsName, setLsName] = useState("");
  const [lsProject, setLsProject] = useState<string | null>(null);
  const [lsDatum, setLsDatum] = useState("");
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

  useEffect(() => {
    init();
  }, [id]);

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUserId(user.id);
    const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).single();
    setIsAdmin(roleData?.role === "administrator");
    await fetchData();
    setLoading(false);
  };

  const fetchData = async () => {
    if (!id) return;

    // Fetch lieferschein
    const { data: ls } = await supabase.from("lieferscheine").select("*, projects(name)").eq("id", id).single();
    if (ls) {
      setLsName(ls.name || (ls.projects as any)?.name || "Lieferschein");
      setLsProject((ls.projects as any)?.name || null);
      setLsDatum(ls.datum || "");
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

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title={lsName} backPath="/material" />

      <main className="container mx-auto px-4 py-6 max-w-4xl space-y-4">
        {/* Info */}
        <div className="flex items-center gap-3 flex-wrap text-sm text-muted-foreground">
          {lsProject && <Badge variant="secondary">{lsProject}</Badge>}
          {lsDatum && <span>{new Date(lsDatum).toLocaleDateString("de-AT")}</span>}
        </div>

        {/* Buttons */}
        {!showForm && !voiceTyp && (
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => openForm("entnahme")} className="gap-2 bg-orange-600 hover:bg-orange-700">
              <ArrowUp className="h-4 w-4" />
              Material entnehmen
            </Button>
            <Button onClick={() => setVoiceTyp("entnahme")} variant="outline" className="gap-2 border-orange-300 text-orange-700 hover:bg-orange-50">
              <Mic className="h-4 w-4" />
              Per Sprache entnehmen
            </Button>
            <Button onClick={() => openForm("rueckgabe")} variant="outline" className="gap-2">
              <ArrowDown className="h-4 w-4" />
              Material zurückbringen
            </Button>
            <Button onClick={() => setVoiceTyp("rueckgabe")} variant="outline" className="gap-2 border-green-300 text-green-700 hover:bg-green-50">
              <Mic className="h-4 w-4" />
              Per Sprache zurückgeben
            </Button>
          </div>
        )}

        {/* Voice Recorder */}
        {voiceTyp && (
          <VoiceRecorder
            typ={voiceTyp}
            existingItems={entries
              .filter(e => e.typ === "entnahme")
              .map((e, idx) => ({
                position: idx + 1,
                material: e.material,
                menge: e.menge || "0",
                einheit: e.einheit || "Stk.",
              }))}
            onAccept={async (voiceItems) => {
              if (!currentUserId || !id) return;
              for (const item of voiceItems) {
                await supabase.from("material_entries").insert({
                  lieferschein_id: id,
                  project_id: null,
                  user_id: currentUserId,
                  material: item.material,
                  menge: String(item.menge),
                  einheit: item.einheit,
                  einzelpreis: 0,
                  typ: voiceTyp,
                  notizen: null,
                  datum: new Date().toISOString().split("T")[0],
                });
              }
              toast({
                title: voiceTyp === "entnahme" ? "Material entnommen" : "Material zurückgebucht",
                description: `${voiceItems.length} Positionen per Sprache erfasst`,
              });
              setVoiceTyp(null);
              fetchData();
            }}
            onCancel={() => setVoiceTyp(null)}
          />
        )}

        {/* Form */}
        {showForm && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                {formTyp === "entnahme" ? (
                  <><ArrowUp className="h-5 w-5 text-red-500" /> Material entnehmen</>
                ) : (
                  <><ArrowDown className="h-5 w-5 text-green-500" /> Material zurückbringen</>
                )}
              </CardTitle>
              {returningEntry && (
                <CardDescription>Vorausgefüllt — Menge anpassen falls nötig</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-sm font-medium">Material *</label>
                    <Input value={formMaterial} onChange={(e) => setFormMaterial(e.target.value)} placeholder="z.B. Fliese 30x60 anthrazit" required />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Menge</label>
                    <Input value={formMenge} onChange={(e) => setFormMenge(e.target.value)} placeholder="z.B. 25" type="number" step="0.1" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Einheit</label>
                    <Select value={formEinheit} onValueChange={setFormEinheit}>
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
                    <label className="text-sm font-medium">Notizen</label>
                    <Input value={formNotizen} onChange={(e) => setFormNotizen(e.target.value)} placeholder="Optionale Bemerkung" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={submitting || !formMaterial.trim()} className={formTyp === "entnahme" ? "bg-orange-600 hover:bg-orange-700" : "bg-green-600 hover:bg-green-700"}>
                    {submitting ? "Speichert..." : formTyp === "entnahme" ? "Entnehmen" : "Zurückbuchen"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => { setShowForm(false); setReturningEntry(null); }}>Abbrechen</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Verbrauchsübersicht */}
        {summary.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Materialverbrauch
              </CardTitle>
              <CardDescription>Zusammenfassung: Entnommen − Zurückgebracht = Verbraucht</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Entnommen</TableHead>
                    <TableHead className="text-right">Zurück</TableHead>
                    <TableHead className="text-right font-bold">Verbraucht</TableHead>
                    <TableHead className="text-right w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.map((s, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{s.material}</TableCell>
                      <TableCell className="text-right text-red-600">{s.entnommen} {s.einheit}</TableCell>
                      <TableCell className="text-right text-green-600">{s.zurueck} {s.einheit}</TableCell>
                      <TableCell className="text-right font-bold">{s.verbraucht} {s.einheit}</TableCell>
                      <TableCell className="text-right">
                        {s.verbraucht > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 text-green-700 border-green-300 hover:bg-green-50"
                            onClick={() => {
                              setFormTyp("rueckgabe");
                              setFormMaterial(s.material);
                              setFormMenge("");
                              setFormEinheit(s.einheit);
                              setFormNotizen("");
                              setReturningEntry(null);
                              setShowForm(true);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Zurück</span>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Einzelne Einträge */}
        <Card>
          <CardHeader>
            <CardTitle>Einträge</CardTitle>
            <CardDescription>{entries.length} Materialeinträge</CardDescription>
          </CardHeader>
          <CardContent>
            {entries.length === 0 ? (
              <div className="text-center py-8">
                <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="text-muted-foreground">Noch keine Einträge — entnimm Material oben</p>
              </div>
            ) : (
              <div className="space-y-2">
                {entries.map((entry) => (
                  <div key={entry.id} className="p-3 rounded-lg border bg-card flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {entry.typ === "entnahme" ? (
                        <ArrowUp className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm truncate">{entry.material}</p>
                          <Badge variant="secondary" className={`text-xs shrink-0 ${entry.typ === "entnahme" ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}>
                            {entry.typ === "entnahme" ? "Entnommen" : "Zurückgebracht"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {entry.menge && `${entry.menge} ${entry.einheit || ""}`}
                          {entry.profiles ? ` · ${entry.profiles.vorname} ${entry.profiles.nachname}` : ""}
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
                      {(isAdmin || entry.user_id === currentUserId) && (
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
