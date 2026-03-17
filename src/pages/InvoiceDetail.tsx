import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Plus, Trash2, Save, Download, Copy, ArrowRightLeft, AlertTriangle, Package, Ban, FileDown, Search, UserPlus, TrendingUp, Eye, Import, FileText } from "lucide-react";
import { InvoicePdfPreview } from "@/components/InvoicePdfPreview";
import { ImportMaterialsDialog } from "@/components/ImportMaterialsDialog";
import { ImportDisturbanceDialog } from "@/components/ImportDisturbanceDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { format } from "date-fns";
import { PageHeader } from "@/components/PageHeader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface InvoiceItem {
  id?: string;
  position: number;
  beschreibung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  gesamtpreis: number;
}

interface InvoiceData {
  typ: string;
  nummer: string;
  laufnummer: number;
  jahr: number;
  status: string;
  kunde_name: string;
  kunde_adresse: string;
  kunde_plz: string;
  kunde_ort: string;
  kunde_land: string;
  kunde_email: string;
  kunde_telefon: string;
  kunde_uid: string;
  datum: string;
  faellig_am: string;
  leistungsdatum: string;
  zahlungsbedingungen: string;
  notizen: string;
  mwst_satz: number;
  project_id: string | null;
  bezahlt_betrag: number;
  customer_id: string | null;
  gueltig_bis: string;
  rabatt_prozent: number;
  rabatt_betrag: number;
  mahnstufe: number;
}

interface CustomerOption {
  id: string;
  name: string;
  ansprechpartner: string | null;
  uid_nummer: string | null;
  adresse: string | null;
  plz: string | null;
  ort: string | null;
  land: string | null;
  email: string | null;
  telefon: string | null;
}

interface TemplateItem {
  id: string;
  name: string;
  beschreibung: string;
  einheit: string;
  einzelpreis: number;
  kategorie: string;
}

interface StoredPdf {
  name: string;
  created_at: string;
}

const statusColors: Record<string, string> = {
  entwurf: "bg-muted text-muted-foreground",
  gesendet: "bg-blue-100 text-blue-800",
  bezahlt: "bg-green-100 text-green-800",
  teilbezahlt: "bg-yellow-100 text-yellow-800",
  storniert: "bg-red-100 text-red-800",
  abgelehnt: "bg-red-100 text-red-800",
  angenommen: "bg-green-100 text-green-800",
};

const statusLabels: Record<string, string> = {
  entwurf: "Entwurf",
  gesendet: "Gesendet",
  bezahlt: "Bezahlt",
  teilbezahlt: "Teilbezahlt",
  storniert: "Storniert",
  abgelehnt: "Abgelehnt",
  angenommen: "Angenommen",
};

export default function InvoiceDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isNew = id === "new" || !id;
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [invoiceId, setInvoiceId] = useState<string | null>(isNew ? null : id || null);
  const [items, setItems] = useState<InvoiceItem[]>([
    { position: 1, beschreibung: "", menge: 1, einheit: "Stk.", einzelpreis: 0, gesamtpreis: 0 },
  ]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [storedPdfs, setStoredPdfs] = useState<StoredPdf[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [importMaterialsOpen, setImportMaterialsOpen] = useState(false);
  const [importDisturbanceOpen, setImportDisturbanceOpen] = useState(false);
  const [createProjectDialogOpen, setCreateProjectDialogOpen] = useState(false);
  const defaultTyp = searchParams.get("typ") || "rechnung";

  const [form, setForm] = useState<InvoiceData>({
    typ: defaultTyp,
    nummer: "",
    laufnummer: 0,
    jahr: new Date().getFullYear(),
    status: "entwurf",
    kunde_name: "",
    kunde_adresse: "",
    kunde_plz: "",
    kunde_ort: "",
    kunde_land: "Österreich",
    kunde_email: "",
    kunde_telefon: "",
    kunde_uid: "",
    datum: format(new Date(), "yyyy-MM-dd"),
    faellig_am: "",
    leistungsdatum: "",
    zahlungsbedingungen: "14 Tage netto",
    notizen: "",
    mwst_satz: 20,
    project_id: null,
    bezahlt_betrag: 0,
    customer_id: null,
    gueltig_bis: "",
    rabatt_prozent: 0,
    rabatt_betrag: 0,
    mahnstufe: 0,
  });

  useEffect(() => {
    fetchProjects();
    fetchTemplates();
    fetchCustomers();
    if (!isNew && id) {
      loadInvoice(id);
      loadStoredPdfs(id);
    }
  }, [id]);

  const fetchCustomers = async () => {
    const { data } = await supabase.from("customers").select("id, name, ansprechpartner, uid_nummer, adresse, plz, ort, land, email, telefon").order("name");
    if (data) setCustomers(data);
  };

  const fetchProjects = async () => {
    const { data } = await supabase.from("projects").select("id, name").order("name");
    if (data) setProjects(data);
  };

  const fetchTemplates = async () => {
    const { data } = await supabase.from("invoice_templates").select("*").order("kategorie, name");
    if (data) setTemplates(data.map(t => ({ ...t, einzelpreis: Number(t.einzelpreis) })));
  };

  const loadStoredPdfs = async (invId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.storage.from("invoice-pdfs").list(`${user.id}/${invId}`);
    if (data) setStoredPdfs(data.map(f => ({ name: f.name, created_at: f.created_at || "" })));
  };

  const loadInvoice = async (invoiceId: string) => {
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();

    if (error || !data) {
      toast({ variant: "destructive", title: "Fehler", description: "Rechnung nicht gefunden" });
      navigate("/invoices");
      return;
    }

    setForm({
      typ: data.typ,
      nummer: data.nummer,
      laufnummer: data.laufnummer,
      jahr: data.jahr,
      status: data.status,
      kunde_name: data.kunde_name,
      kunde_adresse: data.kunde_adresse || "",
      kunde_plz: data.kunde_plz || "",
      kunde_ort: data.kunde_ort || "",
      kunde_land: data.kunde_land || "Österreich",
      kunde_email: data.kunde_email || "",
      kunde_telefon: data.kunde_telefon || "",
      kunde_uid: data.kunde_uid || "",
      datum: data.datum,
      faellig_am: data.faellig_am || "",
      leistungsdatum: data.leistungsdatum || "",
      zahlungsbedingungen: data.zahlungsbedingungen || "",
      notizen: data.notizen || "",
      mwst_satz: Number(data.mwst_satz),
      project_id: data.project_id,
      bezahlt_betrag: Number(data.bezahlt_betrag) || 0,
      customer_id: (data as any).customer_id || null,
      gueltig_bis: (data as any).gueltig_bis || "",
      rabatt_prozent: Number((data as any).rabatt_prozent) || 0,
      rabatt_betrag: Number((data as any).rabatt_betrag) || 0,
      mahnstufe: Number((data as any).mahnstufe) || 0,
    });

    const { data: itemsData } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("position");

    if (itemsData && itemsData.length > 0) {
      setItems(itemsData.map(it => ({
        id: it.id,
        position: it.position,
        beschreibung: it.beschreibung,
        menge: Number(it.menge),
        einheit: it.einheit || "Stk.",
        einzelpreis: Number(it.einzelpreis),
        gesamtpreis: Number(it.gesamtpreis),
      })));
    }

    setLoading(false);
  };

  const updateField = (field: keyof InvoiceData, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const addItem = () => {
    setItems(prev => [...prev, {
      position: prev.length + 1,
      beschreibung: "",
      menge: 1,
      einheit: "Stk.",
      einzelpreis: 0,
      gesamtpreis: 0,
    }]);
  };

  const addFromTemplate = (t: TemplateItem) => {
    setItems(prev => [...prev, {
      position: prev.length + 1,
      beschreibung: t.beschreibung,
      menge: 1,
      einheit: t.einheit,
      einzelpreis: t.einzelpreis,
      gesamtpreis: t.einzelpreis,
    }]);
    setTemplateDialogOpen(false);
    toast({ title: "Position hinzugefügt", description: t.name });
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index).map((item, i) => ({ ...item, position: i + 1 })));
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      (updated[index] as any)[field] = value;
      if (field === "menge" || field === "einzelpreis") {
        updated[index].gesamtpreis = Number(updated[index].menge) * Number(updated[index].einzelpreis);
      }
      return updated;
    });
  };

  // Calculations with discount
  const positionenNetto = items.reduce((sum, item) => sum + item.gesamtpreis, 0);
  const rabattWert = form.rabatt_prozent > 0
    ? positionenNetto * (form.rabatt_prozent / 100)
    : form.rabatt_betrag;
  const nettoSumme = positionenNetto - rabattWert;
  const mwstBetrag = nettoSumme * (form.mwst_satz / 100);
  const bruttoSumme = nettoSumme + mwstBetrag;
  const restBetrag = bruttoSumme - form.bezahlt_betrag;

  const canDelete = form.typ === "angebot" || form.status === "entwurf";
  const canCancel = form.typ === "rechnung" && form.status !== "entwurf" && form.status !== "storniert";

  const handleSave = async () => {
    if (!form.kunde_name.trim()) {
      toast({ variant: "destructive", title: "Fehler", description: "Kundenname ist erforderlich" });
      return;
    }
    if (items.length === 0 || !items[0].beschreibung.trim()) {
      toast({ variant: "destructive", title: "Fehler", description: "Mindestens eine Position ist erforderlich" });
      return;
    }

    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ variant: "destructive", title: "Fehler", description: "Nicht angemeldet" });
      setSaving(false);
      return;
    }

    try {
      let savedId = invoiceId;
      let customerId = form.customer_id;

      // Auto-create or update customer
      if (form.kunde_name.trim()) {
        if (customerId) {
          await supabase.from("customers").update({
            name: form.kunde_name,
            adresse: form.kunde_adresse || null,
            plz: form.kunde_plz || null,
            ort: form.kunde_ort || null,
            land: form.kunde_land || null,
            email: form.kunde_email || null,
            telefon: form.kunde_telefon || null,
            uid_nummer: form.kunde_uid || null,
          }).eq("id", customerId);
        } else {
          const { data: newCust } = await supabase.from("customers").insert({
            user_id: user.id,
            name: form.kunde_name,
            adresse: form.kunde_adresse || null,
            plz: form.kunde_plz || null,
            ort: form.kunde_ort || null,
            land: form.kunde_land || null,
            email: form.kunde_email || null,
            telefon: form.kunde_telefon || null,
            uid_nummer: form.kunde_uid || null,
          }).select("id").single();
          if (newCust) {
            customerId = newCust.id;
            updateField("customer_id", customerId);
          }
        }
        fetchCustomers();
      }

      const invoicePayload = {
        status: form.status,
        kunde_name: form.kunde_name,
        kunde_adresse: form.kunde_adresse || null,
        kunde_plz: form.kunde_plz || null,
        kunde_ort: form.kunde_ort || null,
        kunde_land: form.kunde_land || null,
        kunde_email: form.kunde_email || null,
        kunde_telefon: form.kunde_telefon || null,
        kunde_uid: form.kunde_uid || null,
        datum: form.datum,
        faellig_am: form.faellig_am || null,
        leistungsdatum: form.leistungsdatum || null,
        zahlungsbedingungen: form.zahlungsbedingungen || null,
        notizen: form.notizen || null,
        netto_summe: nettoSumme,
        mwst_satz: form.mwst_satz,
        mwst_betrag: mwstBetrag,
        brutto_summe: bruttoSumme,
        project_id: form.project_id || null,
        bezahlt_betrag: form.bezahlt_betrag,
        customer_id: customerId || null,
        gueltig_bis: form.gueltig_bis || null,
        rabatt_prozent: form.rabatt_prozent,
        rabatt_betrag: form.rabatt_betrag,
        mahnstufe: form.mahnstufe,
      };

      if (isNew || !savedId) {
        const { data: numData, error: numError } = await supabase.rpc("next_invoice_number", {
          p_typ: form.typ,
          p_jahr: form.jahr,
        });

        if (numError) throw numError;
        const nummer = numData as string;
        const laufnummer = parseInt(nummer.split("-")[2]);

        const { data: insertData, error: insertError } = await supabase
          .from("invoices")
          .insert({
            user_id: user.id,
            typ: form.typ,
            nummer,
            laufnummer,
            jahr: form.jahr,
            ...invoicePayload,
          })
          .select("id, nummer")
          .single();

        if (insertError) throw insertError;
        savedId = insertData.id;
        setInvoiceId(savedId);
        updateField("nummer", insertData.nummer);
      } else {
        const { error: updateError } = await supabase
          .from("invoices")
          .update(invoicePayload)
          .eq("id", savedId);

        if (updateError) throw updateError;
      }

      await supabase.from("invoice_items").delete().eq("invoice_id", savedId!);

      const itemsToInsert = items.map((item, idx) => ({
        invoice_id: savedId!,
        position: idx + 1,
        beschreibung: item.beschreibung,
        menge: item.menge,
        einheit: item.einheit,
        einzelpreis: item.einzelpreis,
        gesamtpreis: item.gesamtpreis,
      }));

      const { error: itemsError } = await supabase.from("invoice_items").insert(itemsToInsert);
      if (itemsError) throw itemsError;

      toast({ title: "Gespeichert", description: `${form.typ === "rechnung" ? "Rechnung" : "Angebot"} wurde gespeichert` });

      if (isNew) {
        navigate(`/invoices/${savedId}`, { replace: true });
      }
    } catch (err: any) {
      console.error("Fehler beim Speichern:", err);
      toast({ variant: "destructive", title: "Fehler", description: err.message || "Speichern fehlgeschlagen" });
    }

    setSaving(false);
  };

  const handleDownloadPdf = async () => {
    if (!invoiceId) {
      toast({ variant: "destructive", title: "Fehler", description: "Bitte zuerst speichern" });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("generate-invoice-pdf", {
        body: { invoiceId },
      });

      if (error) throw error;

      const html = decodeURIComponent(escape(atob(data.pdf)));

      // Archive the HTML
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const fileName = `${form.nummer}_${format(new Date(), "yyyy-MM-dd_HH-mm")}.html`;
        const blob = new Blob([html], { type: "text/html" });
        await supabase.storage
          .from("invoice-pdfs")
          .upload(`${user.id}/${invoiceId}/${fileName}`, blob, { upsert: false });
        loadStoredPdfs(invoiceId);
      }

      // Open in new tab for PDF download via print dialog
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
      }

      toast({ title: "PDF geöffnet", description: "Nutze 'Als PDF speichern' im Druckdialog" });
    } catch (err: any) {
      console.error("PDF-Fehler:", err);
      toast({ variant: "destructive", title: "PDF-Fehler", description: err.message || "PDF konnte nicht erstellt werden" });
    }
  };

  const handleDownloadStoredPdf = async (fileName: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !invoiceId) return;

    const { data } = await supabase.storage
      .from("invoice-pdfs")
      .download(`${user.id}/${invoiceId}/${fileName}`);

    if (data) {
      const text = await data.text();
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(text);
        printWindow.document.close();
      }
    }
  };

  const handleDuplicate = async () => {
    if (!invoiceId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const { data: numData, error: numError } = await supabase.rpc("next_invoice_number", {
        p_typ: form.typ,
        p_jahr: new Date().getFullYear(),
      });
      if (numError) throw numError;

      const nummer = numData as string;
      const laufnummer = parseInt(nummer.split("-")[2]);

      const { data: newInvoice, error: insertError } = await supabase
        .from("invoices")
        .insert({
          user_id: user.id,
          typ: form.typ,
          nummer,
          laufnummer,
          jahr: new Date().getFullYear(),
          status: "entwurf",
          kunde_name: form.kunde_name,
          kunde_adresse: form.kunde_adresse || null,
          kunde_plz: form.kunde_plz || null,
          kunde_ort: form.kunde_ort || null,
          kunde_land: form.kunde_land || null,
          kunde_email: form.kunde_email || null,
          kunde_telefon: form.kunde_telefon || null,
          kunde_uid: form.kunde_uid || null,
          datum: format(new Date(), "yyyy-MM-dd"),
          faellig_am: null,
          leistungsdatum: form.leistungsdatum || null,
          zahlungsbedingungen: form.zahlungsbedingungen || null,
          notizen: form.notizen || null,
          netto_summe: nettoSumme,
          mwst_satz: form.mwst_satz,
          mwst_betrag: mwstBetrag,
          brutto_summe: bruttoSumme,
          project_id: form.project_id || null,
          rabatt_prozent: form.rabatt_prozent,
          rabatt_betrag: form.rabatt_betrag,
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      const itemsToInsert = items.map((item, idx) => ({
        invoice_id: newInvoice.id,
        position: idx + 1,
        beschreibung: item.beschreibung,
        menge: item.menge,
        einheit: item.einheit,
        einzelpreis: item.einzelpreis,
        gesamtpreis: item.gesamtpreis,
      }));

      await supabase.from("invoice_items").insert(itemsToInsert);

      toast({ title: "Dupliziert", description: `${form.typ === "rechnung" ? "Rechnung" : "Angebot"} wurde dupliziert` });
      navigate(`/invoices/${newInvoice.id}`);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message || "Duplizieren fehlgeschlagen" });
    }
  };

  const handleConvertToInvoice = async () => {
    if (!invoiceId || form.typ !== "angebot") return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const { data: numData, error: numError } = await supabase.rpc("next_invoice_number", {
        p_typ: "rechnung",
        p_jahr: new Date().getFullYear(),
      });
      if (numError) throw numError;

      const nummer = numData as string;
      const laufnummer = parseInt(nummer.split("-")[2]);

      const { data: newInvoice, error: insertError } = await supabase
        .from("invoices")
        .insert({
          user_id: user.id,
          typ: "rechnung",
          nummer,
          laufnummer,
          jahr: new Date().getFullYear(),
          status: "entwurf",
          kunde_name: form.kunde_name,
          kunde_adresse: form.kunde_adresse || null,
          kunde_plz: form.kunde_plz || null,
          kunde_ort: form.kunde_ort || null,
          kunde_land: form.kunde_land || null,
          kunde_email: form.kunde_email || null,
          kunde_telefon: form.kunde_telefon || null,
          kunde_uid: form.kunde_uid || null,
          datum: format(new Date(), "yyyy-MM-dd"),
          faellig_am: null,
          leistungsdatum: form.leistungsdatum || null,
          zahlungsbedingungen: form.zahlungsbedingungen || null,
          notizen: form.notizen || null,
          netto_summe: nettoSumme,
          mwst_satz: form.mwst_satz,
          mwst_betrag: mwstBetrag,
          brutto_summe: bruttoSumme,
          project_id: form.project_id || null,
          rabatt_prozent: form.rabatt_prozent,
          rabatt_betrag: form.rabatt_betrag,
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      const itemsToInsert = items.map((item, idx) => ({
        invoice_id: newInvoice.id,
        position: idx + 1,
        beschreibung: item.beschreibung,
        menge: item.menge,
        einheit: item.einheit,
        einzelpreis: item.einzelpreis,
        gesamtpreis: item.gesamtpreis,
      }));

      await supabase.from("invoice_items").insert(itemsToInsert);
      await supabase.from("invoices").update({ status: "angenommen" }).eq("id", invoiceId);

      toast({ title: "Rechnung erstellt", description: "Angebot wurde in eine Rechnung umgewandelt" });
      navigate(`/invoices/${newInvoice.id}`);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message || "Umwandlung fehlgeschlagen" });
    }
  };

  const handleDelete = async () => {
    if (!invoiceId) return;
    try {
      await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
      const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
      if (error) throw error;
      toast({ title: "Gelöscht", description: `${form.typ === "rechnung" ? "Rechnung" : "Angebot"} wurde gelöscht` });
      navigate("/invoices");
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message || "Löschen fehlgeschlagen" });
    }
  };

  const handleCancel = async () => {
    if (!invoiceId) return;
    try {
      const { error } = await supabase.from("invoices").update({ status: "storniert" }).eq("id", invoiceId);
      if (error) throw error;
      updateField("status", "storniert");
      toast({ title: "Storniert", description: "Rechnung wurde storniert" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message || "Stornierung fehlgeschlagen" });
    }
  };

  const handleMahnstufeUp = async () => {
    if (!invoiceId) return;
    const newStufe = form.mahnstufe + 1;
    try {
      const { error } = await supabase.from("invoices").update({ mahnstufe: newStufe }).eq("id", invoiceId);
      if (error) throw error;
      updateField("mahnstufe", newStufe);
      toast({ title: "Mahnstufe erhöht", description: `Mahnstufe ist jetzt ${newStufe}` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message });
    }
  };

  if (loading) return <div className="text-center py-8">Lädt...</div>;

  const typLabel = form.typ === "rechnung" ? "Rechnung" : "Angebot";

  const groupedTemplates = templates.reduce<Record<string, TemplateItem[]>>((acc, t) => {
    (acc[t.kategorie] = acc[t.kategorie] || []).push(t);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <PageHeader
          title={isNew ? `Neue ${typLabel} erstellen` : `${typLabel} ${form.nummer}`}
          backPath="/invoices"
        />

        <div className="space-y-6">
          {/* Status & Actions */}
          {!isNew && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge variant="outline" className="text-lg px-4 py-1 font-mono">{form.nummer}</Badge>
                    <Badge className={statusColors[form.status] || ""}>
                      {statusLabels[form.status] || form.status}
                    </Badge>
                    {form.mahnstufe > 0 && (
                      <Badge variant="destructive">Mahnung {form.mahnstufe}</Badge>
                    )}
                    <Select value={form.status} onValueChange={(v) => {
                      updateField("status", v);
                      // When offer is accepted, prompt to create project
                      if (v === "angenommen" && form.typ === "angebot" && !form.project_id) {
                        setCreateProjectDialogOpen(true);
                      }
                    }}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="entwurf">Entwurf</SelectItem>
                        <SelectItem value="gesendet">{form.typ === "angebot" ? "Offen" : "Gesendet"}</SelectItem>
                        {form.typ === "rechnung" ? (
                          <>
                            <SelectItem value="bezahlt">Bezahlt</SelectItem>
                            <SelectItem value="teilbezahlt">Teilbezahlt</SelectItem>
                            <SelectItem value="storniert">Storniert</SelectItem>
                          </>
                        ) : (
                          <>
                            <SelectItem value="angenommen">Angenommen</SelectItem>
                            <SelectItem value="abgelehnt">Abgelehnt</SelectItem>
                            <SelectItem value="verrechnet">Verrechnet</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {form.typ === "rechnung" && (form.status === "gesendet" || form.status === "teilbezahlt") && (
                      <Button onClick={handleMahnstufeUp} variant="outline" size="sm" className="gap-1.5">
                        <TrendingUp className="w-4 h-4" />
                        Mahnstufe erhöhen
                      </Button>
                    )}
                    {form.typ === "angebot" && (
                      <Button onClick={handleConvertToInvoice} variant="default" size="sm" className="gap-1.5">
                        <ArrowRightLeft className="w-4 h-4" />
                        In Rechnung umwandeln
                      </Button>
                    )}
                    <Button onClick={handleDuplicate} variant="outline" size="sm" className="gap-1.5">
                      <Copy className="w-4 h-4" />
                      Duplizieren
                    </Button>
                    <Button onClick={() => setPreviewOpen(true)} variant="outline" size="sm" className="gap-1.5">
                      <Eye className="w-4 h-4" />
                      Vorschau
                    </Button>
                    <Button onClick={handleDownloadPdf} variant="outline" size="sm" className="gap-1.5">
                      <Download className="w-4 h-4" />
                      PDF
                    </Button>
                    <Button onClick={() => setImportMaterialsOpen(true)} variant="outline" size="sm" className="gap-1.5">
                      <Import className="w-4 h-4" />
                      Material
                    </Button>
                    <Button onClick={() => setImportDisturbanceOpen(true)} variant="outline" size="sm" className="gap-1.5">
                      <FileText className="w-4 h-4" />
                      Regie
                    </Button>
                    {canCancel && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm" className="gap-1.5">
                            <Ban className="w-4 h-4" />
                            Stornieren
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2">
                              <AlertTriangle className="w-5 h-5 text-destructive" />
                              Rechnung stornieren?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Die Rechnung {form.nummer} wird als storniert markiert.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                            <AlertDialogAction onClick={handleCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Stornieren
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    {canDelete && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm" className="gap-1.5">
                            <Trash2 className="w-4 h-4" />
                            Löschen
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2">
                              <AlertTriangle className="w-5 h-5 text-destructive" />
                              {typLabel} löschen?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {typLabel} {form.nummer} und alle Positionen werden dauerhaft gelöscht.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Endgültig löschen
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Teilzahlung */}
          {!isNew && form.typ === "rechnung" && (form.status === "bezahlt" || form.status === "teilbezahlt") && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Zahlungsstatus</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                  <div>
                    <Label>Bezahlter Betrag (€)</Label>
                    <Input
                      type="number"
                      value={form.bezahlt_betrag}
                      onChange={(e) => updateField("bezahlt_betrag", Number(e.target.value))}
                      min={0}
                      step={0.01}
                    />
                  </div>
                  <div>
                    <Label>Brutto gesamt</Label>
                    <p className="text-lg font-medium mt-1">€ {bruttoSumme.toFixed(2)}</p>
                  </div>
                  <div>
                    <Label>Restbetrag</Label>
                    <p className={`text-lg font-bold mt-1 ${restBetrag > 0 ? "text-orange-600" : "text-green-600"}`}>
                      € {restBetrag.toFixed(2)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Kundendaten */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Kundendaten</CardTitle>
                <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Search className="w-4 h-4" />
                      Kunde auswählen
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0" align="end">
                    <Command>
                      <CommandInput placeholder="Kunde suchen..." />
                      <CommandList>
                        <CommandEmpty>Kein Kunde gefunden</CommandEmpty>
                        <CommandGroup>
                          {customers.map((c) => (
                            <CommandItem
                              key={c.id}
                              value={c.name}
                              onSelect={() => {
                                setForm(prev => ({
                                  ...prev,
                                  customer_id: c.id,
                                  kunde_name: c.name,
                                  kunde_adresse: c.adresse || "",
                                  kunde_plz: c.plz || "",
                                  kunde_ort: c.ort || "",
                                  kunde_land: c.land || "Österreich",
                                  kunde_email: c.email || "",
                                  kunde_telefon: c.telefon || "",
                                  kunde_uid: c.uid_nummer || "",
                                }));
                                setCustomerPopoverOpen(false);
                              }}
                            >
                              <div>
                                <p className="font-medium">{c.name}</p>
                                {c.ort && <p className="text-xs text-muted-foreground">{c.plz} {c.ort}</p>}
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              {form.customer_id && (
                <p className="text-xs text-muted-foreground mt-1">
                  Verknüpft mit bestehendem Kunden • <button className="underline" onClick={() => updateField("customer_id", null)}>Verknüpfung lösen</button>
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Kundenname *</Label>
                  <Input value={form.kunde_name} onChange={(e) => updateField("kunde_name", e.target.value)} placeholder="Firmenname / Name" />
                </div>
                <div>
                  <Label>UID-Nummer</Label>
                  <Input value={form.kunde_uid} onChange={(e) => updateField("kunde_uid", e.target.value)} placeholder="ATU12345678" />
                </div>
              </div>
              <div>
                <Label>Adresse</Label>
                <Input value={form.kunde_adresse} onChange={(e) => updateField("kunde_adresse", e.target.value)} placeholder="Straße und Hausnummer" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <Label>PLZ</Label>
                  <Input value={form.kunde_plz} onChange={(e) => updateField("kunde_plz", e.target.value)} />
                </div>
                <div>
                  <Label>Ort</Label>
                  <Input value={form.kunde_ort} onChange={(e) => updateField("kunde_ort", e.target.value)} />
                </div>
                <div>
                  <Label>Land</Label>
                  <Input value={form.kunde_land} onChange={(e) => updateField("kunde_land", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>E-Mail</Label>
                  <Input type="email" value={form.kunde_email} onChange={(e) => updateField("kunde_email", e.target.value)} />
                </div>
                <div>
                  <Label>Telefon</Label>
                  <Input value={form.kunde_telefon} onChange={(e) => updateField("kunde_telefon", e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Rechnungsdetails */}
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Datum</Label>
                  <Input type="date" value={form.datum} onChange={(e) => updateField("datum", e.target.value)} />
                </div>
                <div>
                  <Label>Leistungsdatum</Label>
                  <Input type="date" value={form.leistungsdatum} onChange={(e) => updateField("leistungsdatum", e.target.value)} />
                </div>
                {form.typ === "rechnung" && (
                  <div>
                    <Label>Fällig am</Label>
                    <Input type="date" value={form.faellig_am} onChange={(e) => updateField("faellig_am", e.target.value)} />
                  </div>
                )}
                {form.typ === "angebot" && (
                  <div>
                    <Label>Gültig bis</Label>
                    <Input type="date" value={form.gueltig_bis} onChange={(e) => updateField("gueltig_bis", e.target.value)} />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Zahlungsbedingungen</Label>
                  <Input value={form.zahlungsbedingungen} onChange={(e) => updateField("zahlungsbedingungen", e.target.value)} />
                </div>
                <div>
                  <Label>Projekt (optional)</Label>
                  <Select value={form.project_id || "none"} onValueChange={(v) => updateField("project_id", v === "none" ? null : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Kein Projekt" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Kein Projekt</SelectItem>
                      {projects.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>MwSt-Satz (%)</Label>
                  <Input type="number" value={form.mwst_satz} onChange={(e) => updateField("mwst_satz", Number(e.target.value))} className="w-32" />
                </div>
                <div>
                  <Label>Rabatt (%)</Label>
                  <Input
                    type="number"
                    value={form.rabatt_prozent}
                    onChange={(e) => {
                      updateField("rabatt_prozent", Number(e.target.value));
                      if (Number(e.target.value) > 0) updateField("rabatt_betrag", 0);
                    }}
                    min={0}
                    max={100}
                    step={0.5}
                    className="w-32"
                  />
                </div>
                <div>
                  <Label>Rabatt (€)</Label>
                  <Input
                    type="number"
                    value={form.rabatt_betrag}
                    onChange={(e) => {
                      updateField("rabatt_betrag", Number(e.target.value));
                      if (Number(e.target.value) > 0) updateField("rabatt_prozent", 0);
                    }}
                    min={0}
                    step={0.01}
                    className="w-32"
                    disabled={form.rabatt_prozent > 0}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Positionen */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Positionen</CardTitle>
                <div className="flex gap-2">
                  <Button onClick={() => setTemplateDialogOpen(true)} variant="outline" size="sm" className="gap-1">
                    <Package className="w-4 h-4" />
                    Vorlage
                  </Button>
                  <Button onClick={addItem} variant="outline" size="sm" className="gap-1">
                    <Plus className="w-4 h-4" />
                    Position
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Pos.</TableHead>
                      <TableHead>Beschreibung</TableHead>
                      <TableHead className="w-20">Menge</TableHead>
                      <TableHead className="w-20">Einheit</TableHead>
                      <TableHead className="w-28">Einzelpreis</TableHead>
                      <TableHead className="w-28 text-right">Gesamt</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell>
                          <Input
                            value={item.beschreibung}
                            onChange={(e) => updateItem(idx, "beschreibung", e.target.value)}
                            placeholder="Beschreibung der Leistung"
                          />
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={item.menge} onChange={(e) => updateItem(idx, "menge", Number(e.target.value))} min={0} step={0.01} />
                        </TableCell>
                        <TableCell>
                          <Input value={item.einheit} onChange={(e) => updateItem(idx, "einheit", e.target.value)} />
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={item.einzelpreis} onChange={(e) => updateItem(idx, "einzelpreis", Number(e.target.value))} min={0} step={0.01} />
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          € {item.gesamtpreis.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          {items.length > 1 && (
                            <Button variant="ghost" size="icon" onClick={() => removeItem(idx)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={5} className="text-right">Positionen Netto</TableCell>
                      <TableCell className="text-right font-medium">€ {positionenNetto.toFixed(2)}</TableCell>
                      <TableCell />
                    </TableRow>
                    {rabattWert > 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-right text-orange-600">
                          Rabatt {form.rabatt_prozent > 0 ? `(${form.rabatt_prozent}%)` : ""}
                        </TableCell>
                        <TableCell className="text-right text-orange-600">- € {rabattWert.toFixed(2)}</TableCell>
                        <TableCell />
                      </TableRow>
                    )}
                    <TableRow>
                      <TableCell colSpan={5} className="text-right">Netto</TableCell>
                      <TableCell className="text-right font-medium">€ {nettoSumme.toFixed(2)}</TableCell>
                      <TableCell />
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={5} className="text-right">MwSt ({form.mwst_satz}%)</TableCell>
                      <TableCell className="text-right">€ {mwstBetrag.toFixed(2)}</TableCell>
                      <TableCell />
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={5} className="text-right font-bold text-lg">Brutto</TableCell>
                      <TableCell className="text-right font-bold text-lg">€ {bruttoSumme.toFixed(2)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Notizen */}
          <Card>
            <CardHeader>
              <CardTitle>Notizen</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={form.notizen}
                onChange={(e) => updateField("notizen", e.target.value)}
                placeholder="Zusätzliche Anmerkungen..."
                rows={3}
              />
            </CardContent>
          </Card>

          {/* Archivierte PDFs */}
          {!isNew && storedPdfs.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Archivierte PDFs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {storedPdfs.map((pdf) => (
                    <div key={pdf.name} className="flex items-center justify-between p-2 rounded-md border">
                      <span className="text-sm font-mono">{pdf.name}</span>
                      <Button variant="ghost" size="sm" onClick={() => handleDownloadStoredPdf(pdf.name)} className="gap-1">
                        <FileDown className="w-4 h-4" />
                        Öffnen
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => navigate("/invoices")}>Abbrechen</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              <Save className="w-4 h-4" />
              {saving ? "Speichert..." : "Speichern"}
            </Button>
          </div>
        </div>

        {/* Template Picker Dialog */}
        <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Position aus Vorlage einfügen</DialogTitle>
            </DialogHeader>
            {Object.keys(groupedTemplates).length === 0 ? (
              <p className="text-muted-foreground text-center py-4">Keine Vorlagen vorhanden</p>
            ) : (
              Object.entries(groupedTemplates).sort(([a], [b]) => a.localeCompare(b)).map(([kategorie, tpls]) => (
                <div key={kategorie} className="mb-4">
                  <h4 className="text-sm font-semibold text-muted-foreground mb-2">{kategorie}</h4>
                  <div className="space-y-1">
                    {tpls.map(t => (
                      <Button
                        key={t.id}
                        variant="ghost"
                        className="w-full justify-between text-left h-auto py-2"
                        onClick={() => addFromTemplate(t)}
                      >
                        <div>
                          <div className="font-medium">{t.name}</div>
                          <div className="text-xs text-muted-foreground">{t.beschreibung}</div>
                        </div>
                        <span className="text-sm font-mono ml-4 shrink-0">€ {t.einzelpreis.toFixed(2)} / {t.einheit}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </DialogContent>
        </Dialog>
        {/* PDF Preview Dialog */}
        {invoiceId && (
          <InvoicePdfPreview
            open={previewOpen}
            onClose={() => setPreviewOpen(false)}
            invoiceId={invoiceId}
          />
        )}

        {/* Import Materials Dialog */}
        <ImportMaterialsDialog
          open={importMaterialsOpen}
          onClose={() => setImportMaterialsOpen(false)}
          projectId={form.project_id}
          onImport={(importedItems) => {
            const newItems = importedItems.map((item, idx) => ({
              position: items.length + idx + 1,
              beschreibung: item.beschreibung,
              menge: item.menge,
              einheit: item.einheit,
              einzelpreis: item.einzelpreis,
              gesamtpreis: item.menge * item.einzelpreis,
            }));
            setItems(prev => [...prev, ...newItems]);
            setImportMaterialsOpen(false);
            toast({ title: "Materialien importiert", description: `${newItems.length} Positionen hinzugefügt` });
          }}
        />

        {/* Import Disturbance Dialog */}
        <ImportDisturbanceDialog
          open={importDisturbanceOpen}
          onClose={() => setImportDisturbanceOpen(false)}
          onImport={(importedItems, kundeData) => {
            const newItems = importedItems.map((item, idx) => ({
              position: items.length + idx + 1,
              beschreibung: item.beschreibung,
              menge: item.menge,
              einheit: item.einheit,
              einzelpreis: item.einzelpreis,
              gesamtpreis: item.menge * item.einzelpreis,
            }));
            setItems(prev => [...prev, ...newItems]);
            // Fill customer data if empty
            if (kundeData && !form.kunde_name) {
              setForm(prev => ({
                ...prev,
                kunde_name: kundeData.kunde_name || prev.kunde_name,
                kunde_adresse: kundeData.kunde_adresse || prev.kunde_adresse,
                kunde_telefon: kundeData.kunde_telefon || prev.kunde_telefon,
                kunde_email: kundeData.kunde_email || prev.kunde_email,
              }));
            }
            setImportDisturbanceOpen(false);
            toast({ title: "Regiebericht importiert", description: `${newItems.length} Positionen hinzugefügt` });
          }}
        />

        {/* Create Project Dialog (when offer accepted) */}
        <AlertDialog open={createProjectDialogOpen} onOpenChange={setCreateProjectDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Projekt automatisch erstellen?</AlertDialogTitle>
              <AlertDialogDescription>
                Das Angebot wurde angenommen. Soll automatisch ein Projekt mit den Kundendaten erstellt werden?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Nein, danke</AlertDialogCancel>
              <AlertDialogAction onClick={async () => {
                try {
                  const projektName = `${form.kunde_name} - ${form.nummer}`;
                  const { data: newProject, error } = await supabase
                    .from("projects")
                    .insert({
                      name: projektName,
                      adresse: [form.kunde_adresse, form.kunde_plz, form.kunde_ort].filter(Boolean).join(", "),
                      plz: form.kunde_plz || null,
                      status: "aktiv",
                    })
                    .select("id")
                    .single();
                  if (error) throw error;
                  updateField("project_id", newProject.id);
                  // Refresh projects list
                  const { data: projectsData } = await supabase
                    .from("projects")
                    .select("id, name")
                    .eq("status", "aktiv")
                    .order("name");
                  if (projectsData) setProjects(projectsData);
                  toast({ title: "Projekt erstellt", description: `"${projektName}" wurde angelegt und verknüpft.` });
                } catch (err: any) {
                  toast({ variant: "destructive", title: "Fehler", description: err.message });
                }
              }}>
                Ja, Projekt erstellen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
