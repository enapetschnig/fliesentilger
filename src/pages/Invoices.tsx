import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { FileText, Receipt, AlertTriangle, Download, Archive, ArchiveRestore, Trash2, FileDown, Printer, Settings } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format, parseISO, isBefore } from "date-fns";
import { de } from "date-fns/locale";
import { PageHeader } from "@/components/PageHeader";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Invoice {
  id: string;
  typ: string;
  nummer: string;
  status: string;
  kunde_name: string;
  datum: string;
  brutto_summe: number;
  netto_summe: number;
  project_id: string | null;
  faellig_am: string | null;
  mahnstufe: number;
  gueltig_bis: string | null;
  bezahlt_betrag: number;
  archiviert: boolean;
}

const statusColors: Record<string, string> = {
  entwurf: "bg-muted text-muted-foreground",
  gesendet: "bg-blue-100 text-blue-800",
  bezahlt: "bg-green-100 text-green-800",
  teilbezahlt: "bg-yellow-100 text-yellow-800",
  storniert: "bg-red-100 text-red-800",
  abgelehnt: "bg-red-100 text-red-800",
  angenommen: "bg-green-100 text-green-800",
  verrechnet: "bg-purple-100 text-purple-800",
  offen: "bg-blue-100 text-blue-800",
};

const statusLabels: Record<string, string> = {
  entwurf: "Entwurf",
  gesendet: "Offen",
  bezahlt: "Bezahlt",
  teilbezahlt: "Teilbezahlt",
  storniert: "Storniert",
  abgelehnt: "Abgelehnt",
  angenommen: "Angenommen",
  verrechnet: "Verrechnet",
  offen: "Offen",
};

const rechnungStatuses = ["entwurf", "gesendet", "teilbezahlt", "bezahlt", "storniert"];
const angebotStatuses = ["entwurf", "gesendet", "angenommen", "abgelehnt"];

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTyp, setFilterTyp] = useState<string>("alle");
  const [filterStatus, setFilterStatus] = useState<string>("alle");
  const [showArchive, setShowArchive] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportMonth, setExportMonth] = useState<string>(format(new Date(), "yyyy-MM"));
  const [exportMode, setExportMode] = useState<"month" | "year">("month");
  const [exporting, setExporting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rechnungStartNr, setRechnungStartNr] = useState("1");
  const [angebotStartNr, setAngebotStartNr] = useState("1");
  const [savingSettings, setSavingSettings] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchInvoices();
    fetchNumberSettings();
  }, []);

  const fetchNumberSettings = async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("key, value")
      .in("key", ["rechnung_start_nummer", "angebot_start_nummer"]);
    if (data) {
      data.forEach(s => {
        if (s.key === "rechnung_start_nummer") setRechnungStartNr(s.value);
        if (s.key === "angebot_start_nummer") setAngebotStartNr(s.value);
      });
    }
  };

  const saveNumberSettings = async () => {
    setSavingSettings(true);
    await supabase.from("app_settings").upsert({ key: "rechnung_start_nummer", value: rechnungStartNr });
    await supabase.from("app_settings").upsert({ key: "angebot_start_nummer", value: angebotStartNr });
    toast({ title: "Einstellungen gespeichert" });
    setSavingSettings(false);
    setSettingsOpen(false);
  };

  // Reset status filter when typ changes
  useEffect(() => {
    setFilterStatus("alle");
  }, [filterTyp]);

  const fetchInvoices = async () => {
    const { data, error } = await supabase
      .from("invoices")
      .select("id, typ, nummer, status, kunde_name, datum, brutto_summe, netto_summe, project_id, faellig_am, mahnstufe, gueltig_bis, bezahlt_betrag, archiviert")
      .order("datum", { ascending: false });

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Rechnungen konnten nicht geladen werden" });
    } else {
      setInvoices((data || []).map(d => ({ ...d, mahnstufe: (d as any).mahnstufe || 0, gueltig_bis: (d as any).gueltig_bis || null, bezahlt_betrag: Number((d as any).bezahlt_betrag) || 0, archiviert: !!(d as any).archiviert })));
    }
    setLoading(false);
  };

  const handleStatusChange = async (invoiceId: string, newStatus: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const { error } = await supabase.from("invoices").update({ status: newStatus }).eq("id", invoiceId);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Status konnte nicht geändert werden" });
      return;
    }

    setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, status: newStatus } : inv));
    toast({ title: "Status geändert", description: `Status auf "${statusLabels[newStatus]}" gesetzt` });

    // When offer is accepted → create project automatically
    if (newStatus === "angenommen") {
      const inv = invoices.find(i => i.id === invoiceId);
      if (inv && !inv.project_id) {
        // Load full invoice for customer data
        const { data: fullInv } = await supabase
          .from("invoices")
          .select("kunde_name, kunde_adresse, kunde_plz, kunde_ort, customer_id")
          .eq("id", invoiceId)
          .single();

        if (fullInv) {
          const { data: project, error: projErr } = await supabase
            .from("projects")
            .insert({
              name: `${inv.nummer} – ${fullInv.kunde_name}`,
              adresse: fullInv.kunde_adresse || "",
              plz: fullInv.kunde_plz || "0000",
              customer_id: fullInv.customer_id || null,
            })
            .select("id")
            .single();

          if (!projErr && project) {
            // Link invoice to new project
            await supabase.from("invoices").update({ project_id: project.id }).eq("id", invoiceId);
            setInvoices(prev => prev.map(i => i.id === invoiceId ? { ...i, project_id: project.id } : i));
            toast({ title: "Projekt erstellt", description: `Projekt "${inv.nummer} – ${fullInv.kunde_name}" wurde automatisch angelegt` });
          }
        }
      }
    }
  };

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownloadPdf = async (invoiceId: string, nummer: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloadingId(invoiceId);
    try {
      const { data, error } = await supabase.functions.invoke("generate-invoice-pdf", {
        body: { invoiceId },
      });
      if (error) throw error;
      const html = decodeURIComponent(escape(atob(data.pdf)));

      // Strip footer (added via jsPDF on every page)
      const cleanHtml = html.replace(/<div class="footer">[\s\S]*?<\/div>/, "");

      const html2pdf = (await import("html2pdf.js")).default;
      const jsPDF = (await import("jspdf")).default;
      const container = document.createElement("div");
      const bodyMatch = cleanHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      container.innerHTML = bodyMatch ? bodyMatch[1] : cleanHtml;
      const styleMatch = cleanHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
      if (styleMatch) {
        const style = document.createElement("style");
        style.textContent = styleMatch[1] + `
          .totals-section { page-break-inside: avoid !important; break-inside: avoid !important; }
          .bank-info { page-break-inside: avoid !important; break-inside: avoid !important; }
          .closing-text { page-break-inside: avoid !important; break-inside: avoid !important; }
          table.items tbody tr { page-break-inside: avoid !important; }
        `;
        container.prepend(style);
      }
      container.style.width = "180mm";
      container.style.position = "fixed";
      container.style.top = "0";
      container.style.left = "0";
      container.style.zIndex = "-1";
      container.style.background = "white";
      document.body.appendChild(container);

      // Wait for images
      const images = container.querySelectorAll("img");
      await Promise.all(Array.from(images).map(img =>
        img.complete ? Promise.resolve() : new Promise(resolve => { img.onload = resolve; img.onerror = resolve; })
      ));
      await new Promise(r => setTimeout(r, 300));

      const pdfDoc = await html2pdf().set({
        margin: [12, 15, 20, 15],
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, allowTaint: true, letterRendering: true, scrollY: 0 },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["avoid-all", "css"], avoid: [".totals-section", ".bank-info", ".closing-text", "tr"] },
      }).from(container).toPdf().get("pdf");

      document.body.removeChild(container);

      // Add footer on every page
      const totalPages = pdfDoc.internal.getNumberOfPages();
      const pageWidth = pdfDoc.internal.pageSize.getWidth();
      const pageHeight = pdfDoc.internal.pageSize.getHeight();
      for (let i = 1; i <= totalPages; i++) {
        pdfDoc.setPage(i);
        const footerLineY = pageHeight - 15;
        pdfDoc.setDrawColor(204, 0, 0);
        pdfDoc.setLineWidth(0.3);
        pdfDoc.line(15, footerLineY, pageWidth - 15, footerLineY);
        pdfDoc.setFont("helvetica", "normal");
        pdfDoc.setFontSize(6);
        pdfDoc.setTextColor(136, 136, 136);
        pdfDoc.text("Gottfried Tilger \u00B7 Fliesentechnik & Natursteinteppich \u00B7 Bahnhofstr. 174 \u00B7 8831 Niederwölz \u00B7 Tel: +43 664 44 35 346 \u00B7 info@ft-tilger.at", pageWidth / 2, footerLineY + 4, { align: "center" });
        pdfDoc.text("IBAN: AT61 2081 5000 0423 1474 \u00B7 BIC: STSPAT2GXXX", pageWidth / 2, footerLineY + 7.5, { align: "center" });
        pdfDoc.text(`Seite ${i} von ${totalPages}`, pageWidth - 15, footerLineY + 7.5, { align: "right" });
      }

      // Save PDF
      pdfDoc.save(`${nummer}.pdf`);
    } catch (err: any) {
      console.error("PDF download error:", err);
      toast({ variant: "destructive", title: "Fehler", description: "PDF konnte nicht erstellt werden" });
    } finally {
      setDownloadingId(null);
    }
  };

  const handlePrintPdf = async (invoiceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { data, error } = await supabase.functions.invoke("generate-invoice-pdf", {
        body: { invoiceId },
      });
      if (error) throw error;
      const html = decodeURIComponent(escape(atob(data.pdf)));
      const win = window.open("", "_blank");
      if (win) {
        win.document.write(html);
        win.document.close();
        setTimeout(() => win.print(), 500);
      }
    } catch {
      toast({ variant: "destructive", title: "Fehler", description: "Drucken fehlgeschlagen" });
    }
  };

  const handleArchive = async (invoiceId: string, archive: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    const { error } = await supabase.from("invoices").update({ archiviert: archive }).eq("id", invoiceId);
    if (error) {
      toast({ variant: "destructive", title: "Fehler" });
    } else {
      setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, archiviert: archive } : inv));
      toast({ title: archive ? "Archiviert" : "Wiederhergestellt" });
    }
  };

  const handleDelete = async (invoiceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Wirklich endgültig löschen?")) return;
    const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
    if (error) {
      toast({ variant: "destructive", title: "Fehler" });
    } else {
      setInvoices(prev => prev.filter(inv => inv.id !== invoiceId));
      toast({ title: "Gelöscht" });
    }
  };

  const handleExport = async () => {
    setExporting(true);
    const year = exportMonth.substring(0, 4);
    const month = exportMonth.substring(5, 7);

    let startDate: string, endDate: string, label: string;
    if (exportMode === "month") {
      startDate = `${year}-${month}-01`;
      const nextMonth = Number(month) === 12 ? `${Number(year) + 1}-01-01` : `${year}-${String(Number(month) + 1).padStart(2, "0")}-01`;
      endDate = nextMonth;
      label = format(parseISO(startDate), "MMMM yyyy", { locale: de });
    } else {
      startDate = `${year}-01-01`;
      endDate = `${Number(year) + 1}-01-01`;
      label = `Jahr ${year}`;
    }

    // Get matching invoices
    const toExport = invoices.filter(i => {
      const d = i.datum;
      return d >= startDate && d < endDate && i.status !== "entwurf";
    });

    if (toExport.length === 0) {
      toast({ title: "Keine Dokumente", description: `Keine Rechnungen/Angebote für ${label} gefunden` });
      setExporting(false);
      return;
    }

    // Open each PDF in sequence
    let success = 0;
    for (const inv of toExport) {
      try {
        const { data, error } = await supabase.functions.invoke("generate-invoice-pdf", {
          body: { invoiceId: inv.id },
        });
        if (error) continue;
        const html = decodeURIComponent(escape(atob(data.pdf)));
        const win = window.open("", "_blank");
        if (win) {
          win.document.write(html);
          win.document.close();
          win.document.title = `${inv.nummer} - ${inv.kunde_name}`;
        }
        success++;
      } catch {
        // skip
      }
    }
    toast({ title: `${success} PDFs geöffnet`, description: `Export für ${label}` });
    setExporting(false);
    setExportDialogOpen(false);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isOverdue = (inv: Invoice) =>
    inv.typ === "rechnung" &&
    inv.faellig_am &&
    (inv.status === "gesendet" || inv.status === "teilbezahlt") &&
    isBefore(parseISO(inv.faellig_am), today);

  const isExpiredOffer = (inv: Invoice) =>
    inv.typ === "angebot" &&
    inv.gueltig_bis &&
    inv.status === "gesendet" &&
    isBefore(parseISO(inv.gueltig_bis), today);

  const filtered = invoices.filter(i => {
    const matchTyp = filterTyp === "alle" || i.typ === filterTyp;
    const matchStatus = filterStatus === "alle" || i.status === filterStatus;
    return matchTyp && matchStatus;
  });

  const totalRechnungen = invoices.filter(i => i.typ === "rechnung").length;
  const totalAngebote = invoices.filter(i => i.typ === "angebot").length;
  const offeneSumme = invoices
    .filter(i => i.typ === "rechnung" && (i.status === "gesendet" || i.status === "teilbezahlt"))
    .reduce((sum, i) => sum + Number(i.brutto_summe) - i.bezahlt_betrag, 0);
  const bezahlteSumme = invoices
    .filter(i => i.typ === "rechnung" && (i.status === "bezahlt" || i.status === "teilbezahlt"))
    .reduce((sum, i) => sum + i.bezahlt_betrag, 0);

  // Status options for the filter depend on selected typ
  const statusFilterOptions = filterTyp === "rechnung"
    ? rechnungStatuses
    : filterTyp === "angebot"
      ? angebotStatuses
      : [...new Set([...rechnungStatuses, ...angebotStatuses])];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-[1600px]">
        <PageHeader title="Rechnungen & Angebote" backPath="/" />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Rechnungen</CardDescription>
              <CardTitle className="text-2xl">{totalRechnungen}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Angebote</CardDescription>
              <CardTitle className="text-2xl">{totalAngebote}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Offene Rechnungen</CardDescription>
              <CardTitle className="text-2xl">€ {offeneSumme.toFixed(2)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Bezahlt</CardDescription>
              <CardTitle className="text-2xl text-green-600">€ {bezahlteSumme.toFixed(2)}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-center flex-wrap gap-4">
              <div className="flex items-center gap-3 flex-wrap">
                {/* Typ-Buttons */}
                <div className="flex rounded-lg border overflow-hidden">
                  <button
                    onClick={() => setFilterTyp("alle")}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors ${filterTyp === "alle" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                  >
                    Alle
                  </button>
                  <button
                    onClick={() => setFilterTyp("rechnung")}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors border-l ${filterTyp === "rechnung" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                  >
                    Rechnungen
                  </button>
                  <button
                    onClick={() => setFilterTyp("angebot")}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors border-l ${filterTyp === "angebot" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                  >
                    Angebote
                  </button>
                </div>

                {/* Status-Filter — passt sich dem Typ an */}
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle Status</SelectItem>
                    {statusFilterOptions.map(s => (
                      <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button onClick={() => setSettingsOpen(true)} variant="outline" size="sm" className="gap-1">
                  <Settings className="w-4 h-4" />
                </Button>
                <Button onClick={() => setExportDialogOpen(true)} variant="outline" size="sm" className="gap-1">
                  <FileDown className="w-4 h-4" />
                  Export
                </Button>
                <Button onClick={() => navigate("/invoices/new?typ=angebot")} variant="outline" className="gap-2">
                  <FileText className="w-4 h-4" />
                  Neues Angebot
                </Button>
                <Button onClick={() => navigate("/invoices/new?typ=rechnung")} variant="default" className="gap-2">
                  <Receipt className="w-4 h-4" />
                  Neue Rechnung
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-8 text-muted-foreground">Lädt...</p>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Receipt className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Noch keine Rechnungen oder Angebote erstellt</p>
                <Button className="mt-4" onClick={() => navigate("/invoices/new?typ=rechnung")}>
                  Erste Rechnung erstellen
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nummer</TableHead>
                      <TableHead>Typ</TableHead>
                      <TableHead>Kunde</TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead className="text-right">Brutto</TableHead>
                      {filterTyp !== "angebot" && <TableHead className="text-right">Bezahlt</TableHead>}
                      <TableHead>Status</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((inv) => {
                      const overdue = isOverdue(inv);
                      const expired = isExpiredOffer(inv);
                      const brutto = Number(inv.brutto_summe);
                      const bezahlt = inv.bezahlt_betrag;
                      const offen = brutto - bezahlt;
                      const availableStatuses = inv.typ === "rechnung" ? rechnungStatuses : angebotStatuses;
                      return (
                        <TableRow
                          key={inv.id}
                          className={`cursor-pointer hover:bg-muted/50 ${overdue ? "bg-red-50" : ""}`}
                          onClick={() => navigate(`/invoices/${inv.id}`)}
                        >
                          <TableCell className="font-mono font-medium">{inv.nummer}</TableCell>
                          <TableCell>
                            <Badge variant={inv.typ === "rechnung" ? "default" : "secondary"}>
                              {inv.typ === "rechnung" ? "Rechnung" : "Angebot"}
                            </Badge>
                          </TableCell>
                          <TableCell>{inv.kunde_name}</TableCell>
                          <TableCell>{format(parseISO(inv.datum), "dd.MM.yyyy", { locale: de })}</TableCell>
                          <TableCell className="text-right font-medium">€ {brutto.toFixed(2)}</TableCell>
                          {filterTyp !== "angebot" && (
                            <TableCell className="text-right">
                              {inv.typ === "rechnung" ? (
                                <div>
                                  {inv.status === "bezahlt" ? (
                                    <span className="text-green-600 font-medium">€ {brutto.toFixed(2)}</span>
                                  ) : bezahlt > 0 ? (
                                    <div>
                                      <span className="text-yellow-600 font-medium">€ {bezahlt.toFixed(2)}</span>
                                      <div className="text-xs text-muted-foreground">offen: € {offen.toFixed(2)}</div>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          )}
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Select
                                value={inv.status}
                                onValueChange={(val) => {
                                  const fakeEvent = { stopPropagation: () => {} } as React.MouseEvent;
                                  handleStatusChange(inv.id, val, fakeEvent);
                                }}
                              >
                                <SelectTrigger className={`h-7 text-xs font-medium border-0 w-auto min-w-[100px] ${statusColors[inv.status] || ""}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableStatuses.map(s => (
                                    <SelectItem key={s} value={s}>
                                      {statusLabels[s]}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {overdue && (
                                <Badge variant="destructive" className="gap-1 text-xs">
                                  <AlertTriangle className="w-3 h-3" />
                                  Überfällig
                                </Badge>
                              )}
                              {expired && (
                                <Badge variant="outline" className="text-xs text-muted-foreground">
                                  Abgelaufen
                                </Badge>
                              )}
                              {inv.mahnstufe > 0 && (
                                <Badge variant="outline" className="text-xs">
                                  Mahnung {inv.mahnstufe}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-0.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => handleDownloadPdf(inv.id, inv.nummer, e)}
                                disabled={downloadingId === inv.id}
                                title="PDF herunterladen"
                              >
                                <Download className={`h-4 w-4 ${downloadingId === inv.id ? "animate-spin" : ""}`} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => handlePrintPdf(inv.id, e)}
                                title="Drucken"
                              >
                                <Printer className="h-4 w-4" />
                              </Button>
                            </div>
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

        {/* Settings Dialog */}
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Nummernkreise
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Rechnungsnummer beginnt bei</Label>
                <Input
                  type="number"
                  value={rechnungStartNr}
                  onChange={(e) => setRechnungStartNr(e.target.value)}
                  min={1}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Nächste Rechnung: RE-{new Date().getFullYear()}-{String(Number(rechnungStartNr) || 1).padStart(4, "0")}
                </p>
              </div>
              <div>
                <Label>Angebotsnummer beginnt bei</Label>
                <Input
                  type="number"
                  value={angebotStartNr}
                  onChange={(e) => setAngebotStartNr(e.target.value)}
                  min={1}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Nächstes Angebot: AN-{new Date().getFullYear()}-{String(Number(angebotStartNr) || 1).padStart(4, "0")}
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setSettingsOpen(false)}>Abbrechen</Button>
                <Button onClick={saveNumberSettings} disabled={savingSettings}>
                  {savingSettings ? "Speichert..." : "Speichern"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Export Dialog */}
        <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileDown className="w-5 h-5" />
                Rechnungen & Angebote exportieren
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex rounded-lg border overflow-hidden">
                <button
                  onClick={() => setExportMode("month")}
                  className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${exportMode === "month" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                >
                  Monat
                </button>
                <button
                  onClick={() => setExportMode("year")}
                  className={`flex-1 px-3 py-2 text-sm font-medium transition-colors border-l ${exportMode === "year" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                >
                  Ganzes Jahr
                </button>
              </div>

              {exportMode === "month" ? (
                <div>
                  <label className="text-sm font-medium">Monat auswählen</label>
                  <input
                    type="month"
                    value={exportMonth}
                    onChange={(e) => setExportMonth(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1"
                  />
                </div>
              ) : (
                <div>
                  <label className="text-sm font-medium">Jahr auswählen</label>
                  <Select value={exportMonth.substring(0, 4)} onValueChange={(v) => setExportMonth(`${v}-01`)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 5 }, (_, i) => {
                        const y = new Date().getFullYear() - i;
                        return <SelectItem key={y} value={String(y)}>{y}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Alle Rechnungen und Angebote (außer Entwürfe) werden als einzelne PDFs in neuen Tabs geöffnet. Von dort können sie gedruckt oder gespeichert werden.
              </p>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setExportDialogOpen(false)}>Abbrechen</Button>
                <Button onClick={handleExport} disabled={exporting} className="gap-2">
                  <FileDown className="w-4 h-4" />
                  {exporting ? "Exportiert..." : "PDFs exportieren"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
