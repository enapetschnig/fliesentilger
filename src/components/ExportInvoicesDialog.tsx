import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Download, Loader2, CalendarRange } from "lucide-react";
// JSZip loaded dynamically in handleExport

interface ExportInvoicesDialogProps {
  open: boolean;
  onClose: () => void;
  bankData: { kontoinhaber: string; iban: string; bic: string };
}

const MONTHS = [
  "Jänner", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

export function ExportInvoicesDialog({ open, onClose, bankData }: ExportInvoicesDialogProps) {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [year, setYear] = useState(currentYear.toString());
  const [selectedMonths, setSelectedMonths] = useState<Set<number>>(new Set([currentMonth]));
  const [includeStorno, setIncludeStorno] = useState(false);
  const [exportAll, setExportAll] = useState(false);

  const toggleMonth = (m: number) => {
    setSelectedMonths(prev => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m); else next.add(m);
      return next;
    });
  };
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState("");
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);

  // Build the same filter that handleExport uses
  const buildFilter = (countOnly: boolean) => {
    let q: any = supabase.from("invoices").select(countOnly ? "id" : "*", countOnly ? { count: "exact", head: true } : {})
      .eq("typ", "rechnung")
      .eq("jahr", parseInt(year))
      .neq("status", "entwurf")
      .gt("brutto_summe", 0);
    if (!exportAll && selectedMonths.size > 0) {
      // Multi-Month: OR über alle gewählten Monate
      const yr = parseInt(year);
      const ranges = Array.from(selectedMonths).map(m => {
        const startDate = `${year}-${String(m).padStart(2, "0")}-01`;
        const endMonth = m === 12 ? 1 : m + 1;
        const endYear = m === 12 ? yr + 1 : yr;
        const endDate = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
        return `and(datum.gte.${startDate},datum.lt.${endDate})`;
      });
      q = q.or(ranges.join(","));
    }
    if (!includeStorno) q = q.neq("status", "storniert");
    return q;
  };

  // Live-Count beim Öffnen / bei Filter-Änderung
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCountLoading(true);
    (async () => {
      const { count } = await buildFilter(true);
      if (!cancelled) {
        setPreviewCount(count ?? 0);
        setCountLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, year, selectedMonths, exportAll, includeStorno]);

  const handleExport = async () => {
    setExporting(true);
    setProgress("Lade Rechnungen...");

    try {
      const { data: invoices, error } = await buildFilter(false).order("laufnummer");
      if (error) throw error;

      if (!invoices || invoices.length === 0) {
        toast({ variant: "destructive", title: "Keine Rechnungen", description: "Keine Rechnungen für den gewählten Zeitraum gefunden." });
        setExporting(false);
        return;
      }

      // Load logo
      let logoUri: string | undefined;
      try {
        const resp = await fetch("/logo-tilger.png");
        const blob = await resp.blob();
        logoUri = await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.readAsDataURL(blob);
        });
      } catch {}

      // Load firmen UID
      let firmenUid = "";
      try {
        const { data: settings } = await supabase
          .from("app_settings")
          .select("key, value")
          .eq("key", "firmen_uid")
          .single();
        if (settings) firmenUid = settings.value;
      } catch {}

      const { generateInvoicePdf } = await import("@/lib/pdfGenerator");
      const { generateEpcQrCode } = await import("@/lib/invoiceHtml");

      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      let failed = 0;
      for (let i = 0; i < invoices.length; i++) {
        const inv = invoices[i];
        setProgress(`PDF ${i + 1} von ${invoices.length}: ${inv.nummer}...`);

        try {
          const { data: items } = await supabase
            .from("invoice_items")
            .select("*")
            .eq("invoice_id", inv.id)
            .order("position");

          let qrUri: string | undefined;
          if (Number(inv.brutto_summe) > 0) {
            try {
              qrUri = await generateEpcQrCode(Number(inv.brutto_summe), inv.nummer || "", bankData);
            } catch {}
          }

          let pdfBlob: Blob;
          let fileName: string;

          if (inv.status === "storniert" && inv.storno_nummer) {
            // Stornierte Rechnungen: Stornobeleg-PDF exportieren
            const { generateStornoPdf } = await import("@/lib/pdfGenerator");
            pdfBlob = generateStornoPdf(
              { nummer: inv.nummer, kunde_name: inv.kunde_name, brutto_summe: Number(inv.brutto_summe), datum: inv.datum },
              inv.storno_nummer, inv.storno_datum || inv.datum, inv.storno_grund || "",
              bankData, logoUri
            );
            fileName = `Storno_${inv.storno_nummer}.pdf`;
          } else {
            pdfBlob = await generateInvoicePdf(
              {
                typ: inv.typ, nummer: inv.nummer, status: inv.status,
                kunde_name: inv.kunde_name, kunde_adresse: inv.kunde_adresse,
                kunde_plz: inv.kunde_plz, kunde_ort: inv.kunde_ort,
                kunde_land: inv.kunde_land, kunde_email: inv.kunde_email,
                kunde_telefon: inv.kunde_telefon, kunde_uid: inv.kunde_uid,
                datum: inv.datum, faellig_am: inv.faellig_am,
                leistungsdatum: inv.leistungsdatum, leistungsdatum_bis: (inv as any).leistungsdatum_bis, gueltig_bis: inv.gueltig_bis,
                zahlungsbedingungen: inv.zahlungsbedingungen, notizen: inv.notizen,
                netto_summe: Number(inv.netto_summe), mwst_satz: Number(inv.mwst_satz),
                mwst_betrag: Number(inv.mwst_betrag), brutto_summe: Number(inv.brutto_summe),
                bezahlt_betrag: Number(inv.bezahlt_betrag), rabatt_prozent: Number(inv.rabatt_prozent),
                rabatt_betrag: Number(inv.rabatt_betrag), mahnstufe: Number(inv.mahnstufe),
                skonto_prozent: Number(inv.skonto_prozent || 0), skonto_tage: Number(inv.skonto_tage || 0),
                kunde_anrede: (inv as any).kunde_anrede || "", kunde_titel: (inv as any).kunde_titel || "",
                reverse_charge: (inv as any).reverse_charge || false,
              },
              (items || []).map((it: any) => ({
                position: it.position, beschreibung: it.beschreibung,
                kurztext: it.kurztext || it.beschreibung, langtext: it.langtext || "",
                menge: Number(it.menge), einheit: it.einheit || "Stk.",
                einzelpreis: Number(it.einzelpreis), gesamtpreis: Number(it.gesamtpreis),
              })),
              bankData, logoUri, qrUri, firmenUid
            );
            fileName = `${inv.nummer}.pdf`;
          }
          zip.file(fileName, pdfBlob);
        } catch (err) {
          console.error(`PDF generation failed for ${inv.nummer}:`, err);
          failed++;
        }
      }

      setProgress("ZIP wird erstellt...");
      const zipBlob = await zip.generateAsync({ type: "blob" });

      // Download
      const sortedMonths = Array.from(selectedMonths).sort((a, b) => a - b);
      const monthLabel = exportAll
        ? "Gesamt"
        : sortedMonths.length === 1
          ? MONTHS[sortedMonths[0] - 1]
          : sortedMonths.length === 12
            ? "Alle"
            : sortedMonths.map(m => MONTHS[m - 1].slice(0, 3)).join("-");
      const zipName = `Rechnungen_${year}_${monthLabel}${includeStorno ? "_inkl_Storno" : ""}.zip`;
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = zipName;
      a.click();
      URL.revokeObjectURL(url);

      const successCount = invoices.length - failed;
      toast({
        title: "Export abgeschlossen",
        description: failed > 0
          ? `${successCount} von ${invoices.length} Rechnungen exportiert (${failed} fehlgeschlagen)`
          : `${successCount} Rechnungen als ZIP heruntergeladen`,
      });
      onClose();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Export fehlgeschlagen", description: err.message });
    } finally {
      setExporting(false);
      setProgress("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && !exporting && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Rechnungen exportieren
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Jahr</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Monate</Label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" disabled={exportAll} className="w-full justify-start gap-2 font-normal">
                    <CalendarRange className="h-4 w-4" />
                    {exportAll
                      ? "—"
                      : selectedMonths.size === 0
                        ? "Keine"
                        : selectedMonths.size === 1
                          ? MONTHS[Array.from(selectedMonths)[0] - 1]
                          : selectedMonths.size === 12
                            ? "Alle Monate"
                            : `${selectedMonths.size} Monate`}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[200px] max-h-72 overflow-y-auto">
                  <DropdownMenuLabel>Monate auswählen</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {MONTHS.map((m, idx) => {
                    const monthNum = idx + 1;
                    return (
                      <DropdownMenuCheckboxItem
                        key={monthNum}
                        checked={selectedMonths.has(monthNum)}
                        onCheckedChange={() => toggleMonth(monthNum)}
                        onSelect={(e) => e.preventDefault()}
                      >
                        {m}
                      </DropdownMenuCheckboxItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                  <button
                    className="w-full text-left px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted rounded-sm"
                    onClick={() => setSelectedMonths(new Set([1,2,3,4,5,6,7,8,9,10,11,12]))}
                  >
                    Alle auswählen
                  </button>
                  <button
                    className="w-full text-left px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted rounded-sm"
                    onClick={() => setSelectedMonths(new Set())}
                  >
                    Auswahl löschen
                  </button>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="exportAll" checked={exportAll} onCheckedChange={(c) => setExportAll(!!c)} />
            <Label htmlFor="exportAll">Ganzes Jahr exportieren</Label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="includeStorno" checked={includeStorno} onCheckedChange={(c) => setIncludeStorno(!!c)} />
            <Label htmlFor="includeStorno">Stornierte Rechnungen einschließen</Label>
          </div>

          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            {countLoading ? (
              <span className="text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Lade Anzahl...
              </span>
            ) : previewCount === 0 ? (
              <span className="text-muted-foreground">Keine Rechnungen im gewählten Zeitraum.</span>
            ) : (
              <span><strong>{previewCount}</strong> {previewCount === 1 ? "Rechnung" : "Rechnungen"} werden exportiert</span>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">Nur erstellte Rechnungen (keine Entwürfe, keine 0-€-Rechnungen).</p>
          </div>

          {exporting && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              {progress}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={exporting}>Abbrechen</Button>
          <Button onClick={handleExport} disabled={exporting || previewCount === 0} className="gap-2">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {exporting ? "Exportiert..." : "Als ZIP herunterladen"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
