import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Package } from "lucide-react";

interface MaterialSummary {
  material: string;
  einheit: string;
  verbraucht: number;
  selected: boolean;
  einzelpreis: number;
  lieferscheinName: string;
}

interface ImportedItem {
  beschreibung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
}

interface ImportLieferscheinDialogProps {
  open: boolean;
  onClose: () => void;
  projectId?: string | null;
  onImport: (items: ImportedItem[]) => void;
}

export function ImportLieferscheinDialog({ open, onClose, projectId, onImport }: ImportLieferscheinDialogProps) {
  const [materials, setMaterials] = useState<MaterialSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && projectId) fetchData();
    else if (open) setMaterials([]);
  }, [open, projectId]);

  const fetchData = async () => {
    if (!projectId) return;
    setLoading(true);

    // Get lieferscheine for this project
    const { data: lsData } = await supabase
      .from("lieferscheine")
      .select("id, name")
      .eq("project_id", projectId);

    if (!lsData || lsData.length === 0) {
      setMaterials([]);
      setLoading(false);
      return;
    }

    const lsIds = lsData.map(l => l.id);
    const lsNameMap = new Map(lsData.map(l => [l.id, l.name || "Lieferschein"]));

    // Get all material entries for these lieferscheine
    const { data: entries } = await supabase
      .from("material_entries")
      .select("material, menge, einheit, typ, lieferschein_id")
      .in("lieferschein_id", lsIds);

    if (!entries || entries.length === 0) {
      setMaterials([]);
      setLoading(false);
      return;
    }

    // Group by material+lieferschein, calc verbraucht
    const map = new Map<string, { material: string; einheit: string; entnommen: number; zurueck: number; lsName: string }>();
    entries.forEach(e => {
      const key = `${e.lieferschein_id}::${e.material.toLowerCase().trim()}`;
      if (!map.has(key)) {
        map.set(key, {
          material: e.material,
          einheit: e.einheit || "Stk.",
          entnommen: 0,
          zurueck: 0,
          lsName: lsNameMap.get(e.lieferschein_id!) || "Lieferschein",
        });
      }
      const s = map.get(key)!;
      const menge = parseFloat(e.menge || "0") || 0;
      if (e.typ === "entnahme") s.entnommen += menge;
      else if (e.typ === "rueckgabe") s.zurueck += menge;
    });

    const summaries: MaterialSummary[] = Array.from(map.values())
      .map(s => ({
        material: s.material,
        einheit: s.einheit,
        verbraucht: Math.round((s.entnommen - s.zurueck) * 100) / 100,
        selected: s.entnommen - s.zurueck > 0,
        einzelpreis: 0,
        lieferscheinName: s.lsName,
      }))
      .filter(s => s.verbraucht > 0)
      .sort((a, b) => a.material.localeCompare(b.material));

    setMaterials(summaries);
    setLoading(false);
  };

  const toggle = (idx: number) => {
    setMaterials(prev => prev.map((m, i) => i === idx ? { ...m, selected: !m.selected } : m));
  };

  const updatePrice = (idx: number, val: number) => {
    setMaterials(prev => prev.map((m, i) => i === idx ? { ...m, einzelpreis: val } : m));
  };

  const handleImport = () => {
    const items: ImportedItem[] = materials
      .filter(m => m.selected)
      .map(m => ({
        beschreibung: m.material,
        menge: m.verbraucht,
        einheit: m.einheit,
        einzelpreis: m.einzelpreis,
      }));
    onImport(items);
  };

  const selected = materials.filter(m => m.selected);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" />
            Material aus Lieferscheinen importieren
          </DialogTitle>
        </DialogHeader>

        {!projectId ? (
          <p className="text-center py-8 text-muted-foreground">
            Bitte zuerst ein Projekt auswählen, um Lieferscheine zu importieren.
          </p>
        ) : loading ? (
          <p className="text-center py-8 text-muted-foreground">Lädt Lieferscheine...</p>
        ) : materials.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">
            Keine Lieferscheine mit verbrauchtem Material für dieses Projekt gefunden.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              {materials.map((m, idx) => (
                <div key={idx} className={`p-3 rounded-lg border ${m.selected ? "bg-primary/5 border-primary/30" : "bg-muted/30"}`}>
                  <div className="flex items-center gap-3">
                    <Checkbox checked={m.selected} onCheckedChange={() => toggle(idx)} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{m.material}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.verbraucht} {m.einheit} verbraucht
                        <Badge variant="outline" className="ml-2 text-xs">{m.lieferscheinName}</Badge>
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        value={m.einzelpreis}
                        onChange={(e) => updatePrice(idx, Number(e.target.value))}
                        className="w-20 text-right"
                        min={0}
                        step={0.01}
                        placeholder="Preis"
                      />
                      <span className="text-xs text-muted-foreground">€</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t text-sm">
              <span className="text-muted-foreground">{selected.length} Materialien ausgewählt</span>
              <span className="font-bold">
                Gesamt: € {selected.reduce((s, m) => s + m.verbraucht * m.einzelpreis, 0).toFixed(2)}
              </span>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleImport} disabled={selected.length === 0} className="gap-2">
            <Package className="w-4 h-4" />
            {selected.length > 0 ? `${selected.length} Positionen importieren` : "Importieren"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
