import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/PageHeader";
import { Plus, Trash2, Save, Package, Search, Filter, Upload, Star, TrendingUp, Percent, Euro } from "lucide-react";
import { MaterialFileImport } from "@/components/MaterialFileImport";
import { Textarea } from "@/components/ui/textarea";
import { useEinheiten } from "@/hooks/useEinheiten";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Template {
  id: string;
  name: string;
  beschreibung: string;
  einheit: string;
  einzelpreis: number;
  kategorie: string;
  artikelnummer: string | null;
  produktnummer: string | null;
  produktgruppe: string | null;
  kurzbezeichnung: string | null;
  langbezeichnung: string | null;
  netto_preis: number;
  brutto_preis: number;
  ust_satz: number;
  ist_aktiv: boolean;
  ist_lagerartikel: boolean;
  lieferant: string | null;
  ist_favorit: boolean;
}

export default function InvoiceTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterKategorie, setFilterKategorie] = useState<string>("alle");
  const [form, setForm] = useState({
    name: "", beschreibung: "", einheit: "Stk.", einzelpreis: 0, kategorie: "Allgemein", artikelnummer: "",
    produktnummer: "", kurzbezeichnung: "", langbezeichnung: "", netto_preis: 0, brutto_preis: 0, ust_satz: 20,
    ist_lagerartikel: false, lieferant: "", produktgruppe: "",
  });
  const [importOpen, setImportOpen] = useState(false);
  const [priceAdjustMode, setPriceAdjustMode] = useState<"prozent" | "euro">("prozent");
  const [priceAdjustValue, setPriceAdjustValue] = useState("");
  const { toast } = useToast();
  const einheiten = useEinheiten();

  useEffect(() => { fetchTemplates(); }, []);

  const fetchTemplates = async () => {
    const { data, error } = await supabase
      .from("invoice_templates")
      .select("*")
      .order("kategorie, name")
      .limit(5000);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Materialien konnten nicht geladen werden" });
    } else {
      setTemplates((data || []).map(t => ({
        ...t,
        einzelpreis: Number(t.einzelpreis),
        netto_preis: Number((t as any).netto_preis) || Number(t.einzelpreis),
        brutto_preis: Number((t as any).brutto_preis) || 0,
        ust_satz: Number((t as any).ust_satz) || 20,
        ist_aktiv: (t as any).ist_aktiv !== false,
        ist_lagerartikel: (t as any).ist_lagerartikel || false,
        artikelnummer: (t as any).artikelnummer || null,
        produktnummer: (t as any).produktnummer || null,
        produktgruppe: (t as any).produktgruppe || null,
        kurzbezeichnung: (t as any).kurzbezeichnung || null,
        langbezeichnung: (t as any).langbezeichnung || null,
        lieferant: (t as any).lieferant || null,
        ist_favorit: (t as any).ist_favorit || false,
      })));
    }
    setLoading(false);
  };

  const kategorien = [...new Set(templates.map(t => t.kategorie))].sort();
  const produktgruppen = [...new Set(templates.map(t => t.produktgruppe).filter(Boolean))].sort() as string[];
  const lieferanten = [...new Set(templates.map(t => t.lieferant).filter(Boolean))].sort() as string[];

  const filtered = templates.filter(t => {
    const s = search.toLowerCase();
    const matchesSearch = !search ||
      t.name.toLowerCase().includes(s) ||
      t.beschreibung.toLowerCase().includes(s) ||
      (t.artikelnummer && t.artikelnummer.toLowerCase().includes(s)) ||
      (t.produktnummer && t.produktnummer.toLowerCase().includes(s)) ||
      (t.kurzbezeichnung && t.kurzbezeichnung.toLowerCase().includes(s)) ||
      (t.langbezeichnung && t.langbezeichnung.toLowerCase().includes(s)) ||
      (t.lieferant && t.lieferant.toLowerCase().includes(s));
    const matchesKategorie = filterKategorie === "alle" || t.kategorie === filterKategorie;
    return matchesSearch && matchesKategorie;
  });

  const grouped = filtered.reduce<Record<string, Template[]>>((acc, t) => {
    (acc[t.kategorie] = acc[t.kategorie] || []).push(t);
    return acc;
  }, {});

  const openNew = () => {
    setEditId(null);
    setForm({
      name: "", beschreibung: "", einheit: "Stk.", einzelpreis: 0, kategorie: "Allgemein", artikelnummer: "",
      produktnummer: "", kurzbezeichnung: "", langbezeichnung: "", netto_preis: 0, brutto_preis: 0, ust_satz: 20,
      ist_lagerartikel: false, lieferant: "", produktgruppe: "",
    });
    setDialogOpen(true);
  };

  const openEdit = (t: Template) => {
    setEditId(t.id);
    setForm({
      name: t.name, beschreibung: t.beschreibung, einheit: t.einheit, einzelpreis: t.einzelpreis,
      kategorie: t.kategorie, artikelnummer: t.artikelnummer || "",
      produktnummer: t.produktnummer || "", kurzbezeichnung: t.kurzbezeichnung || t.name,
      langbezeichnung: t.langbezeichnung || t.beschreibung, netto_preis: t.netto_preis,
      brutto_preis: t.brutto_preis, ust_satz: t.ust_satz, ist_lagerartikel: t.ist_lagerartikel,
      lieferant: t.lieferant || "", produktgruppe: t.produktgruppe || t.kategorie,
    });
    setPriceAdjustValue("");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!(form.kurzbezeichnung || form.name).trim()) {
      toast({ variant: "destructive", title: "Fehler", description: "Kurzbezeichnung ist erforderlich" });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const payload = {
      name: form.kurzbezeichnung || form.name,
      beschreibung: form.langbezeichnung || form.beschreibung || form.kurzbezeichnung || form.name,
      einheit: form.einheit,
      einzelpreis: form.netto_preis,
      kategorie: form.produktgruppe || form.kategorie,
      artikelnummer: form.produktnummer || form.artikelnummer || null,
      produktnummer: form.produktnummer || null,
      produktgruppe: form.produktgruppe || null,
      kurzbezeichnung: form.kurzbezeichnung || form.name,
      langbezeichnung: form.langbezeichnung || null,
      netto_preis: form.netto_preis,
      brutto_preis: form.brutto_preis,
      ust_satz: form.ust_satz,
      ist_lagerartikel: form.ist_lagerartikel,
      lieferant: form.lieferant || null,
    };

    if (editId) {
      const { error } = await supabase.from("invoice_templates").update(payload).eq("id", editId);
      if (error) { toast({ variant: "destructive", title: "Fehler", description: error.message }); return; }
      toast({ title: "Gespeichert" });
    } else {
      const { error } = await supabase.from("invoice_templates").insert({ ...payload, user_id: user.id });
      if (error) { toast({ variant: "destructive", title: "Fehler", description: error.message }); return; }
      toast({ title: "Erstellt" });
    }
    setDialogOpen(false);
    fetchTemplates();
  };

  const handleInlinePrice = async (id: string, newPrice: number) => {
    const { error } = await supabase.from("invoice_templates").update({ einzelpreis: newPrice }).eq("id", id);
    if (!error) {
      setTemplates(prev => prev.map(t => t.id === id ? { ...t, einzelpreis: newPrice } : t));
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("invoice_templates").delete().eq("id", id);
    if (error) { toast({ variant: "destructive", title: "Fehler", description: error.message }); return; }
    toast({ title: "Gelöscht" });
    fetchTemplates();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-[1400px]">
        <PageHeader title="Materialien" backPath="/" />

        {/* Search & Filter Bar */}
        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Suche nach Name, Beschreibung, Artikelnummer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Select value={filterKategorie} onValueChange={setFilterKategorie}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle Kategorien</SelectItem>
                {kategorien.map(k => (
                  <SelectItem key={k} value={k}>{k}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2">
              <Upload className="w-4 h-4" />
              Importieren
            </Button>
            <Button onClick={openNew} className="gap-2">
              <Plus className="w-4 h-4" />
              Neues Material
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="text-center py-8 text-muted-foreground">Lädt...</p>
        ) : Object.keys(grouped).length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{search || filterKategorie !== "alle" ? "Keine Materialien gefunden" : "Noch keine Materialien angelegt"}</p>
              {!search && filterKategorie === "alle" && (
                <Button className="mt-4" onClick={openNew}>Erstes Material anlegen</Button>
              )}
            </CardContent>
          </Card>
        ) : (
          Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([kategorie, items]) => (
            <Card key={kategorie} className="mb-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Badge variant="secondary">{kategorie}</Badge>
                  <span className="text-muted-foreground text-sm">({items.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Prod.-Nr.</TableHead>
                      <TableHead>Kurzbezeichnung</TableHead>
                      <TableHead>Langbezeichnung</TableHead>
                      <TableHead>Einheit</TableHead>
                      <TableHead>USt</TableHead>
                      <TableHead className="text-right">Netto (€)</TableHead>
                      <TableHead className="text-right">Brutto (€)</TableHead>
                      <TableHead>Lager</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map(t => (
                      <TableRow key={t.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openEdit(t)}>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={async (e) => {
                            e.stopPropagation();
                            const newVal = !t.ist_favorit;
                            await supabase.from("invoice_templates").update({ ist_favorit: newVal } as any).eq("id", t.id);
                            setTemplates(prev => prev.map(item => item.id === t.id ? { ...item, ist_favorit: newVal } : item));
                          }}>
                            <Star className={`w-4 h-4 ${t.ist_favorit ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
                          </Button>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{t.produktnummer || t.artikelnummer || "–"}</TableCell>
                        <TableCell className="font-medium max-w-[200px] truncate">{t.kurzbezeichnung || t.name}</TableCell>
                        <TableCell className="text-muted-foreground max-w-[250px] truncate text-xs">{t.langbezeichnung || t.beschreibung}</TableCell>
                        <TableCell className="text-xs">{t.einheit}</TableCell>
                        <TableCell className="text-xs">{t.ust_satz}%</TableCell>
                        <TableCell className="text-right font-mono text-sm">{t.netto_preis > 0 ? `€ ${t.netto_preis.toFixed(2)}` : "–"}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">{t.brutto_preis > 0 ? `€ ${t.brutto_preis.toFixed(2)}` : "–"}</TableCell>
                        <TableCell>{t.ist_lagerartikel ? <Badge variant="outline" className="text-xs">Lager</Badge> : ""}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? "Material bearbeiten" : "Neues Material"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Produktnummer</Label>
                  <Input value={form.produktnummer} onChange={(e) => setForm(f => ({ ...f, produktnummer: e.target.value }))} placeholder="z.B. 0050-PCI" />
                </div>
                <div>
                  <Label>Produktgruppe</Label>
                  <Select value={form.produktgruppe || "none"} onValueChange={(v) => {
                    if (v === "_new") {
                      const newGrp = prompt("Neue Produktgruppe:");
                      if (newGrp?.trim()) setForm(f => ({ ...f, produktgruppe: newGrp.trim() }));
                    } else {
                      setForm(f => ({ ...f, produktgruppe: v === "none" ? "" : v }));
                    }
                  }}>
                    <SelectTrigger><SelectValue placeholder="Wählen..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {produktgruppen.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                      <SelectItem value="_new" className="text-primary font-medium">+ Neue Gruppe...</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Lieferant</Label>
                  <Select value={form.lieferant || "none"} onValueChange={(v) => {
                    if (v === "_new") {
                      const newLief = prompt("Neuer Lieferant:");
                      if (newLief?.trim()) setForm(f => ({ ...f, lieferant: newLief.trim() }));
                    } else {
                      setForm(f => ({ ...f, lieferant: v === "none" ? "" : v }));
                    }
                  }}>
                    <SelectTrigger><SelectValue placeholder="Wählen..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {lieferanten.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                      <SelectItem value="_new" className="text-primary font-medium">+ Neuer Lieferant...</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Kurzbezeichnung *</Label>
                <Input value={form.kurzbezeichnung} onChange={(e) => setForm(f => ({ ...f, kurzbezeichnung: e.target.value }))} placeholder="Kurzname des Materials" />
              </div>
              <div>
                <Label>Langbezeichnung</Label>
                <Textarea value={form.langbezeichnung} onChange={(e) => setForm(f => ({ ...f, langbezeichnung: e.target.value }))} placeholder="Ausführliche Beschreibung (wird auf PDF angezeigt)" rows={2} />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label>Einheit</Label>
                  <Select value={form.einheit} onValueChange={(v) => setForm(f => ({ ...f, einheit: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {einheiten.map(e => (
                        <SelectItem key={e} value={e}>{e}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Netto-Preis (€)</Label>
                  <Input type="number" value={form.netto_preis || ""} onChange={(e) => {
                    const netto = Number(e.target.value);
                    setForm(f => ({ ...f, netto_preis: netto, brutto_preis: Math.round(netto * (1 + f.ust_satz / 100) * 100) / 100 }));
                  }} min={0} step={0.01} />
                </div>
                <div>
                  <Label>USt-Satz (%)</Label>
                  <Select value={String(form.ust_satz)} onValueChange={(v) => {
                    const ust = Number(v);
                    setForm(f => ({ ...f, ust_satz: ust, brutto_preis: Math.round(f.netto_preis * (1 + ust / 100) * 100) / 100 }));
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0%</SelectItem>
                      <SelectItem value="10">10%</SelectItem>
                      <SelectItem value="13">13%</SelectItem>
                      <SelectItem value="20">20%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Brutto-Preis (€)</Label>
                  <Input type="number" value={form.brutto_preis || ""} onChange={(e) => {
                    const brutto = Number(e.target.value);
                    setForm(f => ({ ...f, brutto_preis: brutto, netto_preis: f.ust_satz > 0 ? Math.round(brutto / (1 + f.ust_satz / 100) * 100) / 100 : brutto }));
                  }} min={0} step={0.01} />
                </div>
              </div>
              {/* Preisanpassung — nur bei bestehendem Material */}
              {editId && (
                <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4" />
                    Preisanpassung
                  </p>
                  <div className="flex gap-2 items-end">
                    <div className="flex border rounded-md overflow-hidden h-9">
                      <button
                        type="button"
                        className={`px-3 text-sm flex items-center gap-1 transition-colors ${priceAdjustMode === "prozent" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                        onClick={() => setPriceAdjustMode("prozent")}
                      >
                        <Percent className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className={`px-3 text-sm flex items-center gap-1 transition-colors ${priceAdjustMode === "euro" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                        onClick={() => setPriceAdjustMode("euro")}
                      >
                        <Euro className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex-1">
                      <Input
                        type="number"
                        step={priceAdjustMode === "prozent" ? "0.1" : "0.01"}
                        placeholder={priceAdjustMode === "prozent" ? "z.B. 5 für +5%" : "z.B. 2.50 für +€2,50"}
                        value={priceAdjustValue}
                        onChange={(e) => setPriceAdjustValue(e.target.value)}
                        className="h-9"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 shrink-0"
                      disabled={!priceAdjustValue || Number(priceAdjustValue) === 0}
                      onClick={() => {
                        const val = Number(priceAdjustValue);
                        if (!val) return;
                        setForm(f => {
                          let newNetto: number;
                          if (priceAdjustMode === "prozent") {
                            newNetto = Math.round(f.netto_preis * (1 + val / 100) * 100) / 100;
                          } else {
                            newNetto = Math.round((f.netto_preis + val) * 100) / 100;
                          }
                          if (newNetto < 0) newNetto = 0;
                          return {
                            ...f,
                            netto_preis: newNetto,
                            brutto_preis: Math.round(newNetto * (1 + f.ust_satz / 100) * 100) / 100,
                          };
                        });
                        const val2 = Number(priceAdjustValue);
                        const label = priceAdjustMode === "prozent" ? `${val2 > 0 ? "+" : ""}${val2}%` : `${val2 > 0 ? "+" : ""}€${Math.abs(val2).toFixed(2)}`;
                        toast({ title: `Preis angepasst: ${label}` });
                        setPriceAdjustValue("");
                      }}
                    >
                      Anwenden
                    </Button>
                  </div>
                  {priceAdjustValue && Number(priceAdjustValue) !== 0 && (
                    <p className="text-xs text-muted-foreground">
                      {(() => {
                        const val = Number(priceAdjustValue);
                        let newNetto: number;
                        if (priceAdjustMode === "prozent") {
                          newNetto = Math.round(form.netto_preis * (1 + val / 100) * 100) / 100;
                        } else {
                          newNetto = Math.round((form.netto_preis + val) * 100) / 100;
                        }
                        if (newNetto < 0) newNetto = 0;
                        const diff = newNetto - form.netto_preis;
                        return `€ ${form.netto_preis.toFixed(2)} → € ${newNetto.toFixed(2)} (${diff >= 0 ? "+" : ""}${diff.toFixed(2)})`;
                      })()}
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Checkbox id="lagerartikel" checked={form.ist_lagerartikel} onCheckedChange={(c) => setForm(f => ({ ...f, ist_lagerartikel: !!c }))} />
                  <Label htmlFor="lagerartikel" className="cursor-pointer">Lagerartikel</Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
              <Button onClick={handleSave} disabled={!form.kurzbezeichnung?.trim()} className="gap-2">
                <Save className="w-4 h-4" />
                Speichern
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <MaterialFileImport
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onImported={() => { setImportOpen(false); fetchTemplates(); }}
        />
      </div>
    </div>
  );
}
