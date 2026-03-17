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
import { Plus, Trash2, Save, Package, Search, Filter } from "lucide-react";
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
}

export default function InvoiceTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterKategorie, setFilterKategorie] = useState<string>("alle");
  const [form, setForm] = useState({ name: "", beschreibung: "", einheit: "Stk.", einzelpreis: 0, kategorie: "Allgemein", artikelnummer: "" });
  const { toast } = useToast();

  useEffect(() => { fetchTemplates(); }, []);

  const fetchTemplates = async () => {
    const { data, error } = await supabase
      .from("invoice_templates")
      .select("*")
      .order("kategorie, name");
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Vorlagen konnten nicht geladen werden" });
    } else {
      setTemplates((data || []).map(t => ({ ...t, einzelpreis: Number(t.einzelpreis), artikelnummer: (t as any).artikelnummer || null })));
    }
    setLoading(false);
  };

  const kategorien = [...new Set(templates.map(t => t.kategorie))].sort();

  const filtered = templates.filter(t => {
    const matchesSearch = !search || 
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.beschreibung.toLowerCase().includes(search.toLowerCase()) ||
      (t.artikelnummer && t.artikelnummer.toLowerCase().includes(search.toLowerCase()));
    const matchesKategorie = filterKategorie === "alle" || t.kategorie === filterKategorie;
    return matchesSearch && matchesKategorie;
  });

  const grouped = filtered.reduce<Record<string, Template[]>>((acc, t) => {
    (acc[t.kategorie] = acc[t.kategorie] || []).push(t);
    return acc;
  }, {});

  const openNew = () => {
    setEditId(null);
    setForm({ name: "", beschreibung: "", einheit: "Stk.", einzelpreis: 0, kategorie: "Allgemein", artikelnummer: "" });
    setDialogOpen(true);
  };

  const openEdit = (t: Template) => {
    setEditId(t.id);
    setForm({ name: t.name, beschreibung: t.beschreibung, einheit: t.einheit, einzelpreis: t.einzelpreis, kategorie: t.kategorie, artikelnummer: t.artikelnummer || "" });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.beschreibung.trim()) {
      toast({ variant: "destructive", title: "Fehler", description: "Name und Beschreibung sind erforderlich" });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const payload = {
      name: form.name,
      beschreibung: form.beschreibung,
      einheit: form.einheit,
      einzelpreis: form.einzelpreis,
      kategorie: form.kategorie,
      artikelnummer: form.artikelnummer || null,
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
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <PageHeader title="Positionsvorlagen" backPath="/invoices" />

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
          <Button onClick={openNew} className="gap-2">
            <Plus className="w-4 h-4" />
            Neue Vorlage
          </Button>
        </div>

        {loading ? (
          <p className="text-center py-8 text-muted-foreground">Lädt...</p>
        ) : Object.keys(grouped).length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{search || filterKategorie !== "alle" ? "Keine Vorlagen gefunden" : "Noch keine Positionsvorlagen erstellt"}</p>
              {!search && filterKategorie === "alle" && (
                <Button className="mt-4" onClick={openNew}>Erste Vorlage erstellen</Button>
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
                      <TableHead>Art.-Nr.</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Beschreibung</TableHead>
                      <TableHead>Einheit</TableHead>
                      <TableHead className="text-right">Preis (€)</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map(t => (
                      <TableRow key={t.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openEdit(t)}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{t.artikelnummer || "–"}</TableCell>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell className="text-muted-foreground">{t.beschreibung}</TableCell>
                        <TableCell>{t.einheit}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            value={t.einzelpreis}
                            onChange={(e) => {
                              e.stopPropagation();
                              const val = Number(e.target.value);
                              setTemplates(prev => prev.map(x => x.id === t.id ? { ...x, einzelpreis: val } : x));
                            }}
                            onBlur={(e) => {
                              e.stopPropagation();
                              handleInlinePrice(t.id, t.einzelpreis);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-24 text-right ml-auto"
                            min={0}
                            step={0.01}
                          />
                        </TableCell>
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
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editId ? "Vorlage bearbeiten" : "Neue Vorlage"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Name *</Label>
                  <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <Label>Artikelnummer</Label>
                  <Input value={form.artikelnummer} onChange={(e) => setForm(f => ({ ...f, artikelnummer: e.target.value }))} placeholder="z.B. MAT-001" />
                </div>
              </div>
              <div>
                <Label>Beschreibung *</Label>
                <Input value={form.beschreibung} onChange={(e) => setForm(f => ({ ...f, beschreibung: e.target.value }))} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Einheit</Label>
                  <Input value={form.einheit} onChange={(e) => setForm(f => ({ ...f, einheit: e.target.value }))} />
                </div>
                <div>
                  <Label>Einzelpreis (€)</Label>
                  <Input type="number" value={form.einzelpreis} onChange={(e) => setForm(f => ({ ...f, einzelpreis: Number(e.target.value) }))} min={0} step={0.01} />
                </div>
                <div>
                  <Label>Kategorie</Label>
                  <Input value={form.kategorie} onChange={(e) => setForm(f => ({ ...f, kategorie: e.target.value }))} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
              <Button onClick={handleSave} className="gap-2">
                <Save className="w-4 h-4" />
                Speichern
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
