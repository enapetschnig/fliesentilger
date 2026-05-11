import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { FileText, Receipt, AlertTriangle, Download, Archive, ArchiveRestore, Trash2, FileDown, Printer, Settings, CalendarRange, X, TrendingUp } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format, parseISO, isBefore } from "date-fns";
import { de } from "date-fns/locale";
import { PageHeader } from "@/components/PageHeader";
import { ExportInvoicesDialog } from "@/components/ExportInvoicesDialog";
import { CreateProjectDialog } from "@/components/CreateProjectDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Invoice {
  id: string;
  typ: string;
  nummer: string | null;
  laufnummer: number | null;
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
  zahlungsbedingungen?: string | null;
}

const statusColors: Record<string, string> = {
  entwurf: "bg-muted text-muted-foreground",
  offen: "bg-blue-100 text-blue-800",
  bezahlt: "bg-green-100 text-green-800",
  teilbezahlt: "bg-yellow-100 text-yellow-800",
  storniert: "bg-red-100 text-red-800",
  abgelehnt: "bg-red-100 text-red-800",
  angenommen: "bg-green-100 text-green-800",
  verrechnet: "bg-purple-100 text-purple-800",
};

const statusLabels: Record<string, string> = {
  entwurf: "Entwurf",
  offen: "Offen",
  bezahlt: "Bezahlt",
  teilbezahlt: "Teilbezahlt",
  storniert: "Storniert",
  abgelehnt: "Abgelehnt",
  angenommen: "Angenommen",
  verrechnet: "Verrechnet",
};

// Rechnung: Kein Entwurf zurück, kein Storniert von außen (nur in Detail-Ansicht)
const rechnungStatuses = ["offen", "teilbezahlt", "bezahlt"];
const angebotStatuses = ["offen", "angenommen", "abgelehnt", "verrechnet"];

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTyp, setFilterTyp] = useState<string>("rechnung");
  const [filterStatus, setFilterStatus] = useState<string>("alle");
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());
  const [showArchive, setShowArchive] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportMonth, setExportMonth] = useState<string>(format(new Date(), "yyyy-MM"));
  const [exportMode, setExportMode] = useState<"month" | "year">("month");
  const [exporting, setExporting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rechnungStartNr, setRechnungStartNr] = useState("1");
  const [angebotStartNr, setAngebotStartNr] = useState("1");
  const [savingSettings, setSavingSettings] = useState(false);
  const [bankKontoinhaber, setBankKontoinhaber] = useState("Gottfried Tilger");
  const [bankIban, setBankIban] = useState("AT61 2081 5000 0423 1474");
  const [bankBic, setBankBic] = useState("STSPAT2GXXX");
  const [createProjectDialogOpen, setCreateProjectDialogOpen] = useState(false);
  const [createProjectForInvoiceId, setCreateProjectForInvoiceId] = useState<string | null>(null);
  const [createProjectDefaults, setCreateProjectDefaults] = useState({ name: "", customerName: "", customerId: null as string | null, adresse: "", plz: "", ort: "", email: "", telefon: "", uidNummer: "", anrede: "", titel: "" });

  // Payment dialog for status change to teilbezahlt/bezahlt
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string>("bezahlt");
  const [paymentBetrag, setPaymentBetrag] = useState("");
  const [paymentDatum, setPaymentDatum] = useState(format(new Date(), "yyyy-MM-dd"));
  const [paymentNotiz, setPaymentNotiz] = useState("");
  const [existingPayments, setExistingPayments] = useState<{ betrag: number; datum: string; notiz: string | null; created_at: string }[]>([]);
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
      .in("key", ["rechnung_start_nummer", "angebot_start_nummer", "bank_kontoinhaber", "bank_iban", "bank_bic"]);
    if (data) {
      data.forEach(s => {
        if (s.key === "rechnung_start_nummer") setRechnungStartNr(s.value);
        if (s.key === "angebot_start_nummer") setAngebotStartNr(s.value);
        if (s.key === "bank_kontoinhaber") setBankKontoinhaber(s.value);
        if (s.key === "bank_iban") setBankIban(s.value);
        if (s.key === "bank_bic") setBankBic(s.value);
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
      .select("id, typ, nummer, laufnummer, status, kunde_name, datum, brutto_summe, netto_summe, project_id, faellig_am, mahnstufe, gueltig_bis, bezahlt_betrag, archiviert, storno_nummer, storno_datum, kundennummer, zahlungsbedingungen")
      .order("laufnummer", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Rechnungen konnten nicht geladen werden" });
    } else {
      setInvoices((data || []).map(d => ({ ...d, mahnstufe: (d as any).mahnstufe || 0, gueltig_bis: (d as any).gueltig_bis || null, bezahlt_betrag: Number((d as any).bezahlt_betrag) || 0, archiviert: !!(d as any).archiviert })));
    }
    setLoading(false);
  };

  const handleStatusChange = async (invoiceId: string, newStatus: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const inv = invoices.find(i => i.id === invoiceId);
    if (!inv) return;

    // Prevent invalid backward status transitions
    const invalidTransitions: Record<string, string[]> = {
      "bezahlt": [], // bezahlt is final — no changes allowed
      "storniert": [], // storniert is final
      "verrechnet": [], // verrechnet is final
      "teilbezahlt": ["offen", "entwurf"], // can't go back to offen
    };
    if (invalidTransitions[inv.status]?.length === 0 && newStatus !== inv.status) {
      toast({ variant: "destructive", title: "Nicht möglich", description: `Status "${statusLabels[inv.status]}" kann nicht geändert werden` });
      return;
    }
    if (invalidTransitions[inv.status]?.includes(newStatus)) {
      toast({ variant: "destructive", title: "Nicht möglich", description: `Status kann nicht von "${statusLabels[inv.status]}" auf "${statusLabels[newStatus]}" zurückgesetzt werden` });
      return;
    }

    // For teilbezahlt/bezahlt: open payment dialog first
    if (newStatus === "teilbezahlt" || newStatus === "bezahlt") {
      setPaymentInvoiceId(invoiceId);
      setPaymentStatus(newStatus);
      setPaymentBetrag(newStatus === "bezahlt" && inv ? String((inv.brutto_summe - (inv.bezahlt_betrag || 0)).toFixed(2)) : "");
      setPaymentDatum(format(new Date(), "yyyy-MM-dd"));
      setPaymentNotiz("");
      // Load existing payments
      const { data: payments } = await supabase
        .from("invoice_payments")
        .select("betrag, datum, notiz, created_at")
        .eq("invoice_id", invoiceId)
        .order("datum", { ascending: true });
      setExistingPayments(payments || []);
      setPaymentDialogOpen(true);
      return;
    }

    // Wenn Entwurf → anderer Status: Nummer vergeben + Datum/Fälligkeit aktualisieren
    const update: any = { status: newStatus };
    let assignedNummer: string | null = null;
    let assignedLaufnummer: number | null = null;
    if (inv.status === "entwurf" && newStatus !== "entwurf" && !inv.nummer) {
      const { data: numData, error: numError } = await supabase.rpc("next_invoice_number", {
        p_typ: inv.typ,
        p_jahr: new Date().getFullYear(),
      });
      if (numError) {
        toast({ variant: "destructive", title: "Fehler", description: "Nummer konnte nicht vergeben werden" });
        return;
      }
      assignedNummer = numData as string;
      assignedLaufnummer = parseInt(assignedNummer.replace(/\D/g, "").slice(-3)) || 1;
      update.nummer = assignedNummer;
      update.laufnummer = assignedLaufnummer;
      // Datum auf heute, Fälligkeit gemäß zahlungsbedingungen
      const today = format(new Date(), "yyyy-MM-dd");
      update.datum = today;
      const isSofort = ((inv as any).zahlungsbedingungen || "").toLowerCase().includes("sofort");
      const tage = isSofort ? 0 : parseInt(((inv as any).zahlungsbedingungen || "").match(/(\d+)/)?.[1] || "14");
      const due = new Date();
      due.setDate(due.getDate() + tage);
      update.faellig_am = format(due, "yyyy-MM-dd");
    }

    const { error } = await supabase.from("invoices").update(update).eq("id", invoiceId);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Status konnte nicht geändert werden" });
      return;
    }

    setInvoices(prev => prev.map(i => i.id === invoiceId ? {
      ...i,
      status: newStatus,
      ...(assignedNummer ? { nummer: assignedNummer, laufnummer: assignedLaufnummer!, datum: update.datum, faellig_am: update.faellig_am } : {}),
    } : i));
    toast({ title: "Status geändert", description: `Status auf "${statusLabels[newStatus]}" gesetzt` });

    // When offer is accepted → open CreateProjectDialog
    if (newStatus === "angenommen") {
      const inv = invoices.find(i => i.id === invoiceId);
      if (inv && !inv.project_id) {
        const { data: fullInv } = await supabase
          .from("invoices")
          .select("kunde_name, kunde_adresse, kunde_plz, kunde_ort, customer_id, kunde_email, kunde_telefon, kunde_uid, kunde_anrede, kunde_titel")
          .eq("id", invoiceId)
          .single();

        if (fullInv) {
          setCreateProjectForInvoiceId(invoiceId);
          setCreateProjectDefaults({
            name: `${fullInv.kunde_name} - ${inv.nummer}`,
            customerName: fullInv.kunde_name || "",
            customerId: fullInv.customer_id || null,
            adresse: fullInv.kunde_adresse || "",
            plz: fullInv.kunde_plz || "",
            ort: fullInv.kunde_ort || "",
            email: (fullInv as any).kunde_email || "",
            telefon: (fullInv as any).kunde_telefon || "",
            uidNummer: (fullInv as any).kunde_uid || "",
            anrede: (fullInv as any).kunde_anrede || "",
            titel: (fullInv as any).kunde_titel || "",
          });
          setCreateProjectDialogOpen(true);
        }
      }
    }
  };

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownloadPdf = async (invoiceId: string, nummer: string | null, e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloadingId(invoiceId);
    try {
      // Load invoice + items + bank data
      const [{ data: inv }, { data: invItems }, { data: bankSettings }] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", invoiceId).single(),
        supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId).order("position"),
        supabase.from("app_settings").select("key, value").in("key", ["bank_kontoinhaber", "bank_iban", "bank_bic", "firmen_uid"]),
      ]);
      if (!inv) throw new Error("Rechnung nicht gefunden");

      const bank = { kontoinhaber: "Gottfried Tilger", iban: bankIban, bic: bankBic };
      let firmenUid = "";
      if (bankSettings) {
        bankSettings.forEach((s: any) => {
          if (s.key === "bank_kontoinhaber") bank.kontoinhaber = s.value;
          if (s.key === "bank_iban") bank.iban = s.value;
          if (s.key === "bank_bic") bank.bic = s.value;
          if (s.key === "firmen_uid") firmenUid = s.value;
        });
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

      // QR code for invoices
      let qrUri: string | undefined;
      const { generateEpcQrCode } = await import("@/lib/invoiceHtml");
      if (inv.typ === "rechnung" && Number(inv.brutto_summe) > 0) {
        try { qrUri = await generateEpcQrCode(Number(inv.brutto_summe), inv.nummer || "", bank); } catch {}
      }

      const { generateInvoicePdf } = await import("@/lib/pdfGenerator");
      const pdfBlob = await generateInvoicePdf(
        {
          typ: inv.typ, nummer: inv.nummer, status: inv.status,
          kunde_name: inv.kunde_name, kunde_adresse: inv.kunde_adresse,
          kunde_plz: inv.kunde_plz, kunde_ort: inv.kunde_ort,
          kunde_land: inv.kunde_land, kunde_email: inv.kunde_email,
          kunde_telefon: inv.kunde_telefon, kunde_uid: inv.kunde_uid, kunde_anrede: inv.kunde_anrede || "", kunde_titel: inv.kunde_titel || "", reverse_charge: inv.reverse_charge || false,
          datum: inv.datum, faellig_am: inv.faellig_am,
          leistungsdatum: inv.leistungsdatum, leistungsdatum_bis: (inv as any).leistungsdatum_bis, gueltig_bis: inv.gueltig_bis,
          zahlungsbedingungen: inv.zahlungsbedingungen, notizen: inv.notizen,
          netto_summe: Number(inv.netto_summe), mwst_satz: Number(inv.mwst_satz),
          mwst_betrag: Number(inv.mwst_betrag), brutto_summe: Number(inv.brutto_summe),
          bezahlt_betrag: Number(inv.bezahlt_betrag), rabatt_prozent: Number(inv.rabatt_prozent),
          rabatt_betrag: Number(inv.rabatt_betrag), mahnstufe: Number(inv.mahnstufe),
          skonto_prozent: Number(inv.skonto_prozent || 0), skonto_tage: Number(inv.skonto_tage || 0),
        },
        (invItems || []).map((it: any) => ({
          position: it.position, beschreibung: it.beschreibung,
          kurztext: it.kurztext || it.beschreibung, langtext: it.langtext || "",
          menge: Number(it.menge), einheit: it.einheit || "Stk.",
          einzelpreis: Number(it.einzelpreis), gesamtpreis: Number(it.gesamtpreis),
        })),
        bank, logoUri, qrUri, firmenUid
      );

      // Direct download
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${nummer || "Entwurf"}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
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
      // Generate real PDF using jsPDF (same as download)
      const [{ data: inv }, { data: invItems }, { data: settings }] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", invoiceId).single(),
        supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId).order("position"),
        supabase.from("app_settings").select("key, value").in("key", ["bank_kontoinhaber", "bank_iban", "bank_bic", "firmen_uid"]),
      ]);
      if (!inv) throw new Error("Nicht gefunden");

      const bank = { kontoinhaber: bankKontoinhaber, iban: bankIban, bic: bankBic };
      let firmenUid = "";
      settings?.forEach((s: any) => {
        if (s.key === "bank_kontoinhaber") bank.kontoinhaber = s.value;
        if (s.key === "bank_iban") bank.iban = s.value;
        if (s.key === "bank_bic") bank.bic = s.value;
        if (s.key === "firmen_uid") firmenUid = s.value;
      });

      let logoUri: string | undefined;
      try {
        const resp = await fetch("/logo-tilger.png");
        const blob = await resp.blob();
        logoUri = await new Promise<string>((resolve) => {
          const r = new FileReader(); r.onload = () => resolve(r.result as string); r.readAsDataURL(blob);
        });
      } catch {}

      let qrUri: string | undefined;
      if (inv.typ === "rechnung" && Number(inv.brutto_summe) > 0) {
        try {
          const { generateEpcQrCode } = await import("@/lib/invoiceHtml");
          qrUri = await generateEpcQrCode(Number(inv.brutto_summe), inv.nummer || "", bank);
        } catch {}
      }

      const { generateInvoicePdf } = await import("@/lib/pdfGenerator");
      const pdfBlob = await generateInvoicePdf(
        {
          typ: inv.typ, nummer: inv.nummer, status: inv.status,
          kunde_name: inv.kunde_name, kunde_adresse: inv.kunde_adresse,
          kunde_plz: inv.kunde_plz, kunde_ort: inv.kunde_ort,
          kunde_land: inv.kunde_land, kunde_email: inv.kunde_email,
          kunde_telefon: inv.kunde_telefon, kunde_uid: inv.kunde_uid, kunde_anrede: inv.kunde_anrede || "", kunde_titel: inv.kunde_titel || "", reverse_charge: inv.reverse_charge || false,
          datum: inv.datum, faellig_am: inv.faellig_am,
          leistungsdatum: inv.leistungsdatum, leistungsdatum_bis: (inv as any).leistungsdatum_bis, gueltig_bis: inv.gueltig_bis,
          zahlungsbedingungen: inv.zahlungsbedingungen, notizen: inv.notizen,
          netto_summe: Number(inv.netto_summe), mwst_satz: Number(inv.mwst_satz),
          mwst_betrag: Number(inv.mwst_betrag), brutto_summe: Number(inv.brutto_summe),
          bezahlt_betrag: Number(inv.bezahlt_betrag), rabatt_prozent: Number(inv.rabatt_prozent),
          rabatt_betrag: Number(inv.rabatt_betrag), mahnstufe: Number(inv.mahnstufe),
          skonto_prozent: Number(inv.skonto_prozent || 0), skonto_tage: Number(inv.skonto_tage || 0),
        },
        (invItems || []).map((it: any) => ({
          position: it.position, beschreibung: it.beschreibung,
          kurztext: it.kurztext || it.beschreibung, langtext: it.langtext || "",
          menge: Number(it.menge), einheit: it.einheit || "Stk.",
          einzelpreis: Number(it.einzelpreis), gesamtpreis: Number(it.gesamtpreis),
        })),
        bank, logoUri, qrUri, firmenUid
      );

      // Open PDF in new tab for printing
      const url = URL.createObjectURL(pdfBlob);
      const win = window.open(url, "_blank");
      if (win) {
        win.addEventListener("load", () => {
          setTimeout(() => win.print(), 500);
        });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message || "Drucken fehlgeschlagen" });
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
    (inv.status === "offen" || inv.status === "teilbezahlt") &&
    isBefore(parseISO(inv.faellig_am), today);

  const isExpiredOffer = (inv: Invoice) =>
    inv.typ === "angebot" &&
    inv.gueltig_bis &&
    inv.status === "offen" &&
    isBefore(parseISO(inv.gueltig_bis), today);

  const filtered = invoices.filter(i => {
    const matchTyp = filterTyp === "alle" || i.typ === filterTyp;
    const matchMonth = selectedMonths.size === 0 || (i.datum && selectedMonths.has(i.datum.slice(0, 7)));
    if (filterStatus === "storniert") {
      return matchTyp && i.status === "storniert" && matchMonth;
    }
    // Normal filters exclude storniert
    const matchStatus = filterStatus === "alle" ? i.status !== "storniert" : i.status === filterStatus;
    return matchTyp && matchStatus && matchMonth;
  });

  // Verfügbare Monate aus allen Rechnungen (für Dropdown)
  const availableMonths = Array.from(new Set(
    invoices.filter(i => i.typ === filterTyp || filterTyp === "alle").map(i => i.datum?.slice(0, 7)).filter(Boolean) as string[]
  )).sort().reverse();

  const formatMonth = (ym: string) => format(parseISO(ym + "-01"), "MMMM yyyy", { locale: de });
  const formatMonthShort = (ym: string) => format(parseISO(ym + "-01"), "MMM yyyy", { locale: de });

  const toggleMonth = (ym: string) => {
    setSelectedMonths(prev => {
      const next = new Set(prev);
      if (next.has(ym)) next.delete(ym); else next.add(ym);
      return next;
    });
  };

  // Umsatz pro Monat (nur Rechnungen, nicht storniert/entwurf)
  const monthlyRevenue: { month: string; total: number }[] = (() => {
    const map = new Map<string, number>();
    invoices
      .filter(i => i.typ === "rechnung" && i.status !== "storniert" && i.status !== "entwurf" && i.datum)
      .forEach(i => {
        const m = i.datum.slice(0, 7);
        map.set(m, (map.get(m) || 0) + Number(i.brutto_summe));
      });
    const arr = Array.from(map.entries()).map(([month, total]) => ({ month, total }));
    arr.sort((a, b) => b.month.localeCompare(a.month));
    return arr;
  })();

  const visibleMonthlyRevenue = selectedMonths.size === 0
    ? monthlyRevenue
    : monthlyRevenue.filter(r => selectedMonths.has(r.month));
  const monthlyMax = Math.max(1, ...visibleMonthlyRevenue.map(r => r.total));
  const monthlyTotal = visibleMonthlyRevenue.reduce((s, r) => s + r.total, 0);

  // Offene Forderungen (immer "jetzt", nicht vom Monatsfilter beeinflusst)
  const offeneRechnungen = invoices.filter(i => i.typ === "rechnung" && (i.status === "offen" || i.status === "teilbezahlt"));
  const offeneGesamt = offeneRechnungen.reduce((s, i) => s + (Number(i.brutto_summe) - Number(i.bezahlt_betrag)), 0);
  const ueberfaelligListe = offeneRechnungen.filter(isOverdue);
  const ueberfaelligGesamt = ueberfaelligListe.reduce((s, i) => s + (Number(i.brutto_summe) - Number(i.bezahlt_betrag)), 0);

  const storniertCount = invoices.filter(i => i.status === "storniert").length;

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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Offene Forderungen */}
          <Card className={ueberfaelligGesamt > 0 ? "border-red-200" : ""}>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Offene Forderungen
              </CardDescription>
              <CardTitle className="text-3xl">€ {offeneGesamt.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-sm text-muted-foreground">
                {offeneRechnungen.length} {offeneRechnungen.length === 1 ? "Rechnung" : "Rechnungen"} offen
              </div>
              {ueberfaelligGesamt > 0 && (
                <div className="text-sm text-red-600 font-medium mt-1 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  € {ueberfaelligGesamt.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} überfällig ({ueberfaelligListe.length})
                </div>
              )}
            </CardContent>
          </Card>

          {/* Umsatz pro Monat */}
          <Card>
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Umsatz pro Monat {selectedMonths.size > 0 && <Badge variant="secondary" className="ml-1 text-xs">gefiltert</Badge>}
              </CardDescription>
              <CardTitle className="text-2xl">€ {monthlyTotal.toLocaleString("de-AT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {visibleMonthlyRevenue.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine Daten</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {visibleMonthlyRevenue.map(r => {
                    const isActive = selectedMonths.has(r.month);
                    return (
                      <button
                        key={r.month}
                        onClick={() => toggleMonth(r.month)}
                        className={`w-full text-left grid grid-cols-[6rem_1fr_auto] items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 transition-colors ${isActive ? "bg-primary/10" : ""}`}
                        title="Klicken um zu filtern"
                      >
                        <span className="text-xs text-muted-foreground capitalize">{formatMonthShort(r.month)}</span>
                        <div className="h-2 rounded-sm bg-muted overflow-hidden">
                          <div className="h-full bg-primary rounded-sm" style={{ width: `${(r.total / monthlyMax) * 100}%` }} />
                        </div>
                        <span className="text-xs font-mono tabular-nums">€ {r.total.toLocaleString("de-AT", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-center flex-wrap gap-4">
              <div className="flex items-center gap-3 flex-wrap">
                {/* Typ-Buttons */}
                <div className="flex rounded-lg border overflow-hidden">
                  <button
                    onClick={() => setFilterTyp("rechnung")}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors ${filterTyp === "rechnung" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
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

                {/* Monats-Multiselect */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2 h-9">
                      <CalendarRange className="h-4 w-4" />
                      {selectedMonths.size === 0
                        ? "Monat"
                        : selectedMonths.size === 1
                          ? formatMonth(Array.from(selectedMonths)[0])
                          : `${selectedMonths.size} Monate`}
                      {selectedMonths.size > 0 && (
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label="Zurücksetzen"
                          className="ml-1 inline-flex"
                          onClick={(e) => { e.stopPropagation(); setSelectedMonths(new Set()); }}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setSelectedMonths(new Set()); } }}
                        >
                          <X className="h-3.5 w-3.5 opacity-60 hover:opacity-100" />
                        </span>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                    <DropdownMenuLabel>Monate filtern</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {availableMonths.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">Keine Daten</div>
                    ) : (
                      availableMonths.map(ym => (
                        <DropdownMenuCheckboxItem
                          key={ym}
                          checked={selectedMonths.has(ym)}
                          onCheckedChange={() => toggleMonth(ym)}
                          className="capitalize"
                          onSelect={(e) => e.preventDefault()}
                        >
                          {formatMonth(ym)}
                        </DropdownMenuCheckboxItem>
                      ))
                    )}
                    {selectedMonths.size > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <button
                          className="w-full text-left px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted rounded-sm"
                          onClick={() => setSelectedMonths(new Set())}
                        >
                          Auswahl zurücksetzen
                        </button>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

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
                    {storniertCount > 0 && (
                      <SelectItem value="storniert">Storniert ({storniertCount})</SelectItem>
                    )}
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
                          <TableCell className="font-mono font-medium">{inv.nummer || <span className="text-muted-foreground italic">Entwurf</span>}</TableCell>
                          <TableCell>
                            <Badge variant={inv.typ === "rechnung" ? "default" : "secondary"}>
                              {inv.typ === "rechnung" ? (inv.status === "entwurf" ? "Rechnung (Entwurf)" : "Rechnung") : "Angebot"}
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
                              {inv.status === "storniert" ? (
                                <Badge className="bg-red-100 text-red-800 text-xs">
                                  Storniert{(inv as any).storno_nummer ? ` (${(inv as any).storno_nummer})` : ""}
                                </Badge>
                              ) : inv.typ === "rechnung" && inv.status === "entwurf" ? (
                                <Badge variant="outline" className="text-xs text-muted-foreground">
                                  Entwurf
                                </Badge>
                              ) : (
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
                              )}
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
                              {inv.typ === "rechnung" && isOverdue(inv) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    try {
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
                                      const bank = { kontoinhaber: bankKontoinhaber, iban: bankIban, bic: bankBic };
                                      const stufe = Number(inv.mahnstufe || 0) + 1;
                                      if (stufe > 3) { toast({ variant: "destructive", title: "Maximum erreicht", description: "Mahnstufe 3 ist das Maximum" }); return; }
                                      const { generateMahnungPdf } = await import("@/lib/pdfGenerator");
                                      const pdfBlob = generateMahnungPdf(
                                        {
                                          nummer: inv.nummer, datum: inv.datum, faellig_am: inv.faellig_am || "",
                                          kunde_name: inv.kunde_name, kunde_adresse: inv.kunde_adresse,
                                          kunde_plz: inv.kunde_plz, kunde_ort: inv.kunde_ort,
                                          brutto_summe: Number(inv.brutto_summe), bezahlt_betrag: Number(inv.bezahlt_betrag || 0),
                                        },
                                        stufe, 0, bank, logoUri
                                      );
                                      // Update mahnstufe
                                      await supabase.from("invoices").update({ mahnstufe: stufe }).eq("id", inv.id);
                                      // Download
                                      const url = URL.createObjectURL(pdfBlob);
                                      const a = document.createElement("a"); a.href = url;
                                      a.download = `Mahnung_${stufe}_${inv.nummer}.pdf`; a.click();
                                      URL.revokeObjectURL(url);
                                      toast({ title: `Mahnung ${stufe} erstellt` });
                                      fetchInvoices();
                                    } catch (err: any) {
                                      toast({ variant: "destructive", title: "Fehler", description: err.message });
                                    }
                                  }}
                                  title={`Mahnung erstellen (Stufe ${Number(inv.mahnstufe || 0) + 1})`}
                                  className="text-red-600 hover:text-red-800"
                                >
                                  <AlertTriangle className="h-4 w-4" />
                                </Button>
                              )}
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
                <Label>Rechnungsnummer beginnt bei (001–999)</Label>
                <Input
                  type="number"
                  value={rechnungStartNr}
                  onChange={(e) => { const v = Math.min(999, Math.max(0, Number(e.target.value))); setRechnungStartNr(String(v || "")); }}
                  min={1}
                  max={999}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Nächste Rechnung: {String(new Date().getFullYear() % 100).padStart(2, "0")}{String(Number(rechnungStartNr) || 1).padStart(3, "0")}
                </p>
              </div>
              <div>
                <Label>Angebotsnummer beginnt bei (001–999)</Label>
                <Input
                  type="number"
                  value={angebotStartNr}
                  onChange={(e) => { const v = Math.min(999, Math.max(0, Number(e.target.value))); setAngebotStartNr(String(v || "")); }}
                  min={1}
                  max={999}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Nächstes Angebot: AN{String(new Date().getFullYear() % 100).padStart(2, "0")}{String(Number(angebotStartNr) || 1).padStart(3, "0")}
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
        <ExportInvoicesDialog
          open={exportDialogOpen}
          onClose={() => setExportDialogOpen(false)}
          bankData={{ kontoinhaber: bankKontoinhaber, iban: bankIban, bic: bankBic }}
        />
        {/* Create Project Dialog (when offer accepted) */}
        <CreateProjectDialog
          open={createProjectDialogOpen}
          onClose={() => setCreateProjectDialogOpen(false)}
          onCreated={async (newProject) => {
            if (createProjectForInvoiceId) {
              await supabase.from("invoices").update({ project_id: newProject.id }).eq("id", createProjectForInvoiceId);
              setInvoices(prev => prev.map(i => i.id === createProjectForInvoiceId ? { ...i, project_id: newProject.id } : i));
            }
            setCreateProjectDialogOpen(false);
            setCreateProjectForInvoiceId(null);
          }}
          defaultName={createProjectDefaults.name}
          defaultCustomerId={createProjectDefaults.customerId}
          defaultCustomerName={createProjectDefaults.customerName}
          defaultAdresse={createProjectDefaults.adresse}
          defaultPlz={createProjectDefaults.plz}
          defaultOrt={createProjectDefaults.ort}
          defaultEmail={createProjectDefaults.email}
          defaultTelefon={createProjectDefaults.telefon}
          defaultUidNummer={createProjectDefaults.uidNummer}
          defaultAnrede={createProjectDefaults.anrede}
          defaultTitel={createProjectDefaults.titel}
        />

        {/* Payment Dialog for Teilbezahlt/Bezahlt */}
        <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {paymentStatus === "bezahlt" ? "Zahlung erfassen" : "Teilzahlung erfassen"}
              </DialogTitle>
            </DialogHeader>

            {/* Invoice summary — always visible */}
            {(() => {
              const inv = invoices.find(i => i.id === paymentInvoiceId);
              const brutto = inv?.brutto_summe || 0;
              const bereitsGezahlt = existingPayments.reduce((s, p) => s + Number(p.betrag), 0);
              const offen = brutto - bereitsGezahlt;
              return (
                <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Rechnungsbetrag (brutto):</span>
                    <span className="font-bold">€ {brutto.toFixed(2)}</span>
                  </div>
                  {bereitsGezahlt > 0 && (
                    <div className="flex justify-between text-sm text-green-700">
                      <span>Bereits bezahlt:</span>
                      <span className="font-medium">€ {bereitsGezahlt.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold text-orange-600 border-t pt-1">
                    <span>Noch offen:</span>
                    <span>€ {offen.toFixed(2)}</span>
                  </div>

                  {/* Existing payment history */}
                  {existingPayments.length > 0 && (
                    <div className="border-t pt-2 mt-1 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Zahlungshistorie:</p>
                      {existingPayments.map((p, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs">
                          <div>
                            <span className="font-medium text-green-700">€ {Number(p.betrag).toFixed(2)}</span>
                            <span className="text-muted-foreground ml-2">{new Date(p.datum).toLocaleDateString("de-AT")}</span>
                          </div>
                          {p.notiz && <span className="text-muted-foreground italic">{p.notiz}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* New payment */}
            {(() => {
              const inv = invoices.find(i => i.id === paymentInvoiceId);
              const maxBetrag = (inv?.brutto_summe || 0) - existingPayments.reduce((s, p) => s + Number(p.betrag), 0);
              return (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Betrag (€) <span className="text-muted-foreground font-normal">max. € {maxBetrag.toFixed(2)}</span></Label>
                  <Input
                    type="number"
                    value={paymentBetrag}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      if (val > maxBetrag) setPaymentBetrag(maxBetrag.toFixed(2));
                      else setPaymentBetrag(e.target.value);
                    }}
                    placeholder="0,00"
                    step="0.01"
                    min="0"
                    max={maxBetrag}
                  />
                </div>
                <div>
                  <Label>Zahlungsdatum</Label>
                  <Input
                    type="date"
                    value={paymentDatum}
                    onChange={(e) => setPaymentDatum(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>Notiz (optional)</Label>
                <Input
                  value={paymentNotiz}
                  onChange={(e) => setPaymentNotiz(e.target.value)}
                  placeholder="z.B. Überweisung, Bar, Teilzahlung Anzahlung..."
                />
              </div>
            </div>
              );
            })()}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>Abbrechen</Button>
              <Button onClick={async () => {
                if (!paymentInvoiceId || !paymentBetrag) return;
                const betrag = parseFloat(paymentBetrag);
                if (isNaN(betrag) || betrag <= 0) {
                  toast({ variant: "destructive", title: "Ungültiger Betrag" });
                  return;
                }

                await supabase.from("invoice_payments").insert({
                  invoice_id: paymentInvoiceId,
                  betrag,
                  datum: paymentDatum,
                  notiz: paymentNotiz.trim() || null,
                });

                const inv = invoices.find(i => i.id === paymentInvoiceId);
                const newBezahlt = (inv?.bezahlt_betrag || 0) + betrag;
                const newStatus = newBezahlt >= (inv?.brutto_summe || 0) ? "bezahlt" : "teilbezahlt";

                await supabase.from("invoices").update({
                  status: newStatus,
                  bezahlt_betrag: newBezahlt,
                }).eq("id", paymentInvoiceId);

                setInvoices(prev => prev.map(i =>
                  i.id === paymentInvoiceId ? { ...i, status: newStatus, bezahlt_betrag: newBezahlt } : i
                ));

                toast({
                  title: newStatus === "bezahlt" ? "Vollständig bezahlt" : "Teilzahlung erfasst",
                  description: `€ ${betrag.toFixed(2)} am ${new Date(paymentDatum).toLocaleDateString("de-AT")}`,
                });
                setPaymentDialogOpen(false);
              }}>
                Zahlung speichern
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
