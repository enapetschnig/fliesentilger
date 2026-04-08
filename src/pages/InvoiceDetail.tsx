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
import { Plus, Trash2, Save, Download, Copy, ArrowRightLeft, AlertTriangle, Package, Ban, FileDown, Search, UserPlus, TrendingUp, Eye, Import, FileText, Printer, Star, ChevronUp, ChevronDown } from "lucide-react";
import { InvoicePdfPreview } from "@/components/InvoicePdfPreview";
import { ImportMaterialsDialog } from "@/components/ImportMaterialsDialog";
import { ImportDisturbanceDialog } from "@/components/ImportDisturbanceDialog";
import { ImportFromOfferDialog } from "@/components/ImportFromOfferDialog";
import { ImportTimeDialog } from "@/components/ImportTimeDialog";
import { useEinheiten } from "@/hooks/useEinheiten";
import { ImportLieferscheinDialog } from "@/components/ImportLieferscheinDialog";
import { ImportDisturbanceToInvoiceDialog } from "@/components/ImportDisturbanceToInvoiceDialog";
import { CreateProjectDialog } from "@/components/CreateProjectDialog";
import { ImportFromProjectDialog } from "@/components/ImportFromProjectDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { format, addMonths, parseISO } from "date-fns";
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
  kurztext?: string;
  langtext?: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  rabatt_prozent?: number;
  produktnummer?: string;
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
  betreff: string;
  mwst_satz: number;
  project_id: string | null;
  bezahlt_betrag: number;
  customer_id: string | null;
  gueltig_bis: string;
  rabatt_prozent: number;
  rabatt_betrag: number;
  mahnstufe: number;
  skonto_prozent: number;
  skonto_tage: number;
  storno_nummer: string;
  storno_datum: string;
  storno_grund: string;
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
  ist_favorit?: boolean;
}

interface StoredPdf {
  name: string;
  created_at: string;
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

export default function InvoiceDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isNew = id === "new" || !id;
  const navigate = useNavigate();
  const { toast } = useToast();
  const einheiten = useEinheiten();

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [invoiceId, setInvoiceId] = useState<string | null>(isNew ? null : id || null);
  const [items, setItems] = useState<InvoiceItem[]>([
    { position: 1, beschreibung: "", menge: 1, einheit: "Stk.", einzelpreis: 0, gesamtpreis: 0 },
  ]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateFilter, setTemplateFilter] = useState("alle");
  const [autocompleteIdx, setAutocompleteIdx] = useState<number | null>(null);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [templateMengen, setTemplateMengen] = useState<Record<string, number>>({});
  const [addedFromDialog, setAddedFromDialog] = useState<{ name: string; menge: number; einheit: string }[]>([]);
  const [storedPdfs, setStoredPdfs] = useState<StoredPdf[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSaved, setPreviewSaved] = useState(false);
  const [importMaterialsOpen, setImportMaterialsOpen] = useState(false);
  const [importLieferscheinOpen, setImportLieferscheinOpen] = useState(false);
  const [importProjectOpen, setImportProjectOpen] = useState(false);
  const [importDisturbanceOpen, setImportDisturbanceOpen] = useState(false);
  const [importRegieOpen, setImportRegieOpen] = useState(false);
  const [fromAngebotId, setFromAngebotId] = useState<string | null>(null);
  const [importOfferOpen, setImportOfferOpen] = useState(false);
  const [importTimeOpen, setImportTimeOpen] = useState(false);
  const [createProjectDialogOpen, setCreateProjectDialogOpen] = useState(false);
  const [stornoDialogOpen, setStornoDialogOpen] = useState(false);
  const [stornoGrund, setStornoGrund] = useState("");
  const [newProjectName, setNewProjectName] = useState("");

  // Payment tracking
  interface Payment { id: string; betrag: number; datum: string; notizen: string | null; }
  const [payments, setPayments] = useState<Payment[]>([]);
  const [mahnungen, setMahnungen] = useState<{ mahnstufe: number; created_at: string }[]>([]);
  const [newPaymentAmount, setNewPaymentAmount] = useState("");
  const [newPaymentDate, setNewPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [newPaymentNote, setNewPaymentNote] = useState("");
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
    faellig_am: format(new Date(Date.now() + 14 * 86400000), "yyyy-MM-dd"),
    leistungsdatum: format(new Date(), "yyyy-MM-dd"),
    zahlungsbedingungen: "14 Tage",
    notizen: "",
    betreff: "",
    mwst_satz: 20,
    project_id: null,
    bezahlt_betrag: 0,
    customer_id: null,
    gueltig_bis: defaultTyp === "angebot" ? format(addMonths(new Date(), 1), "yyyy-MM-dd") : "",
    rabatt_prozent: 0,
    rabatt_betrag: 0,
    mahnstufe: 0,
    skonto_prozent: 0,
    skonto_tage: 0,
    storno_nummer: "",
    storno_datum: "",
    storno_grund: "",
  });

  // Locked = already saved (not draft) — can only view, download, storno/delete
  // Rechnungen: komplett locked nach Speichern. Angebote: Positionen + Kundendaten editierbar
  const isLocked = !isNew && id !== "new" && !!invoiceId && form.typ === "rechnung" && form.status !== "entwurf";
  const isKundeLocked = !isNew && id !== "new" && !!invoiceId && form.typ === "rechnung" && form.status !== "entwurf";

  // Angebot→Rechnung Vergleichs-Dialog
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [convertItems, setConvertItems] = useState<{ beschreibung: string; kurztext: string; langtext: string; einheit: string; einzelpreis: number; angebotMenge: number; verbrauchtMenge: number; rechnungMenge: number; selected: boolean; isExtra: boolean }[]>([]);

  useEffect(() => {
    fetchProjects();
    fetchTemplates();
    fetchCustomers();
    if (!isNew && id) {
      loadInvoice(id);
      loadStoredPdfs(id);
      loadPayments(id);
      loadMahnungen();
    }
    // Auto-open regiebericht import if disturbance_id is in URL
    const distId = searchParams.get("disturbance_id");
    if (distId && isNew) {
      setImportRegieOpen(true);
    }

    // Load data from Angebot conversion
    if (isNew && searchParams.get("from_angebot") === "true") {
      try {
        const stored = sessionStorage.getItem("convertToInvoice");
        if (stored) {
          const data = JSON.parse(stored);
          setForm(prev => ({
            ...prev,
            kunde_name: data.kunde_name || "",
            kunde_adresse: data.kunde_adresse || "",
            kunde_plz: data.kunde_plz || "",
            kunde_ort: data.kunde_ort || "",
            kunde_land: data.kunde_land || "Österreich",
            kunde_email: data.kunde_email || "",
            kunde_telefon: data.kunde_telefon || "",
            kunde_uid: data.kunde_uid || "",
            customer_id: data.customer_id || null,
            project_id: data.project_id || null,
            leistungsdatum: data.leistungsdatum || "",
            zahlungsbedingungen: data.zahlungsbedingungen || "",
            notizen: data.notizen || "",
            betreff: data.betreff || "",
            mwst_satz: data.mwst_satz || 20,
            rabatt_prozent: data.rabatt_prozent || 0,
            rabatt_betrag: data.rabatt_betrag || 0,
            skonto_prozent: data.skonto_prozent || 0,
            skonto_tage: data.skonto_tage || 0,
            kunde_anrede: data.kunde_anrede || "",
            kunde_titel: data.kunde_titel || "",
            reverse_charge: data.reverse_charge || false,
            kundennummer: data.kundennummer || "",
          }));
          if (data.items?.length > 0) {
            setItems(data.items.map((it: any, idx: number) => ({
              position: idx + 1,
              beschreibung: it.beschreibung || "",
              kurztext: it.kurztext || it.beschreibung || "",
              langtext: it.langtext || "",
              menge: it.menge || 1,
              einheit: it.einheit || "Stk.",
              einzelpreis: it.einzelpreis || 0,
              rabatt_prozent: it.rabatt_prozent || 0,
              gesamtpreis: it.gesamtpreis || 0,
            })));
          }
          if (data.fromAngebotId) setFromAngebotId(data.fromAngebotId);
          sessionStorage.removeItem("convertToInvoice");
        }
      } catch {}
    }
  }, [id]);

  const fetchCustomers = async () => {
    const { data } = await supabase.from("customers").select("id, name, ansprechpartner, uid_nummer, adresse, plz, ort, land, email, telefon, skonto_prozent, skonto_tage, nettofrist, zahlungsbedingungen, anrede, titel, kundennummer").order("name");
    if (data) setCustomers(data);
  };

  const fetchProjects = async () => {
    const { data } = await supabase.from("projects").select("id, name, customer_id").eq("status", "aktiv").order("name");
    if (data) setProjects(data);
  };

  const fetchTemplates = async () => {
    const { data } = await supabase.from("invoice_templates").select("*").order("kategorie, name").limit(5000);
    if (data) setTemplates(data.map(t => ({ ...t, einzelpreis: Number(t.einzelpreis), ist_favorit: (t as any).ist_favorit || false })));
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
      betreff: (data as any).betreff || "",
      mwst_satz: Number(data.mwst_satz),
      project_id: data.project_id,
      bezahlt_betrag: Number(data.bezahlt_betrag) || 0,
      customer_id: (data as any).customer_id || null,
      gueltig_bis: (data as any).gueltig_bis || "",
      rabatt_prozent: Number((data as any).rabatt_prozent) || 0,
      rabatt_betrag: Number((data as any).rabatt_betrag) || 0,
      mahnstufe: Number((data as any).mahnstufe) || 0,
      skonto_prozent: Number((data as any).skonto_prozent) || 0,
      skonto_tage: Number((data as any).skonto_tage) || 0,
      storno_nummer: (data as any).storno_nummer || "",
      storno_datum: (data as any).storno_datum || "",
      storno_grund: (data as any).storno_grund || "",
      kunde_anrede: (data as any).kunde_anrede || "",
      kunde_titel: (data as any).kunde_titel || "",
      reverse_charge: (data as any).reverse_charge || false,
      kundennummer: (data as any).kundennummer || "",
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
        kurztext: (it as any).kurztext || it.beschreibung,
        langtext: (it as any).langtext || "",
        menge: Number(it.menge),
        einheit: it.einheit || "Stk.",
        einzelpreis: Number(it.einzelpreis),
        rabatt_prozent: Number((it as any).rabatt_prozent) || 0,
        produktnummer: (it as any).produktnummer || "",
        gesamtpreis: Number(it.gesamtpreis),
      })));
    }

    setLoading(false);
  };

  const updateField = (field: keyof InvoiceData, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  // Helper: merge imported items into existing list, replacing empty first row
  const mergeItems = (prev: InvoiceItem[], newItems: InvoiceItem[]): InvoiceItem[] => {
    // Check if first row is empty (default state)
    const firstEmpty = prev.length === 1 && !prev[0].beschreibung.trim() && prev[0].einzelpreis === 0;
    const base = firstEmpty ? [] : prev;
    return [...base, ...newItems].map((item, idx) => ({ ...item, position: idx + 1 }));
  };

  const addItem = () => {
    setItems(prev => [...prev, {
      position: prev.length + 1,
      beschreibung: "",
      kurztext: "",
      langtext: "",
      menge: 1,
      einheit: "Stk.",
      einzelpreis: 0,
      rabatt_prozent: 0,
      gesamtpreis: 0,
    }]);
  };

  const addFromTemplate = (t: TemplateItem) => {
    const netto = Number((t as any).netto_preis) || t.einzelpreis;
    const newItem: InvoiceItem = {
      position: 1,
      beschreibung: (t as any).kurzbezeichnung || t.name || t.beschreibung,
      kurztext: (t as any).kurzbezeichnung || t.name,
      langtext: ((t as any).langbezeichnung && (t as any).langbezeichnung !== ((t as any).kurzbezeichnung || t.name)) ? (t as any).langbezeichnung : "",
      menge: 1,
      einheit: t.einheit,
      einzelpreis: netto,
      rabatt_prozent: 0,
      produktnummer: (t as any).produktnummer || "",
      gesamtpreis: netto,
    };
    setItems(prev => mergeItems(prev, [newItem]));
    // Dialog bleibt offen
    toast({ title: "Position hinzugefügt", description: t.name });
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index).map((item, i) => ({ ...item, position: i + 1 })));
  };

  const moveItem = (index: number, direction: "up" | "down") => {
    setItems(prev => {
      const arr = [...prev];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= arr.length) return prev;
      [arr[index], arr[targetIndex]] = [arr[targetIndex], arr[index]];
      return arr.map((item, i) => ({ ...item, position: i + 1 }));
    });
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      // Prevent negative menge/einzelpreis
      if ((field === "menge" || field === "einzelpreis") && Number(value) < 0) value = 0;
      if (field === "rabatt_prozent") value = Math.max(0, Math.min(100, Number(value) || 0));
      (updated[index] as any)[field] = value;
      if (field === "menge" || field === "einzelpreis" || field === "rabatt_prozent") {
        const m = Number(updated[index].menge);
        const p = Number(updated[index].einzelpreis);
        const r = Number(updated[index].rabatt_prozent) || 0;
        updated[index].gesamtpreis = Math.round(m * p * (1 - r / 100) * 100) / 100;
      }
      return updated;
    });
  };

  // Calculations with discount — round to 2 decimal places to avoid floating-point issues
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const positionenNetto = r2(items.reduce((sum, item) => sum + item.gesamtpreis, 0));
  const rabattWert = r2(form.rabatt_prozent > 0
    ? positionenNetto * (form.rabatt_prozent / 100)
    : form.rabatt_betrag);
  const nettoSumme = r2(positionenNetto - rabattWert);
  const mwstBetrag = r2(nettoSumme * (form.mwst_satz / 100));
  const bruttoSumme = r2(nettoSumme + mwstBetrag);
  const restBetrag = r2(bruttoSumme - form.bezahlt_betrag);

  const canDelete = form.typ === "angebot";
  const canCancel = !isNew && !!invoiceId && id !== "new" && form.typ === "rechnung" && form.status !== "storniert";

  const handleSave = async (asDraft?: boolean): Promise<boolean> => {
    // Double-click protection
    if (saving) return false;

    if (!form.kunde_name.trim()) {
      toast({ variant: "destructive", title: "Fehler", description: "Kundenname ist erforderlich" });
      return false;
    }
    // Validate ALL items, not just the first
    const validItems = items.filter(item => item.beschreibung.trim());
    if (validItems.length === 0) {
      toast({ variant: "destructive", title: "Fehler", description: "Mindestens eine Position mit Beschreibung ist erforderlich" });
      return false;
    }

    // Reverse Charge: UID-Nummer des Kunden ist Pflicht (§ 19 UStG)
    if ((form as any).reverse_charge && !form.kunde_uid?.trim()) {
      toast({ variant: "destructive", title: "Fehler", description: "Bei Reverse Charge ist die UID-Nummer des Kunden Pflicht" });
      return false;
    }

    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ variant: "destructive", title: "Fehler", description: "Nicht angemeldet" });
      setSaving(false);
      return false;
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
          // Check for existing customer with same name + PLZ (duplicate protection)
          let custQuery = supabase.from("customers").select("id").ilike("name", form.kunde_name.trim());
          if (form.kunde_plz?.trim()) custQuery = custQuery.eq("plz", form.kunde_plz.trim());
          const { data: existingCust } = await custQuery.limit(1).maybeSingle();

          if (existingCust) {
            customerId = existingCust.id;
            // Update existing customer data
            await supabase.from("customers").update({
              adresse: form.kunde_adresse || null,
              plz: form.kunde_plz || null,
              ort: form.kunde_ort || null,
              land: form.kunde_land || null,
              email: form.kunde_email || null,
              telefon: form.kunde_telefon || null,
              uid_nummer: form.kunde_uid || null,
            }).eq("id", existingCust.id);
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
            if (newCust) customerId = newCust.id;
          }
          updateField("customer_id", customerId);
        }
        fetchCustomers();
      }

      // asDraft=true → Entwurf, asDraft=false/undefined → final (offen für Rechnungen)
      let saveStatus: string;
      if (asDraft) {
        saveStatus = "entwurf";
      } else if (form.typ === "rechnung") {
        saveStatus = "offen";
      } else {
        saveStatus = form.status || "offen";
      }

      const invoicePayload = {
        status: saveStatus,
        kunde_name: form.kunde_name,
        kunde_adresse: form.kunde_adresse || null,
        kunde_plz: form.kunde_plz || null,
        kunde_ort: form.kunde_ort || null,
        kunde_land: form.kunde_land || null,
        kunde_email: form.kunde_email || null,
        kunde_telefon: form.kunde_telefon || null,
        kunde_uid: form.kunde_uid || null,
        kunde_anrede: (form as any).kunde_anrede || null,
        kunde_titel: (form as any).kunde_titel || null,
        reverse_charge: (form as any).reverse_charge || false,
        datum: form.datum,
        faellig_am: form.faellig_am || null,
        leistungsdatum: form.leistungsdatum || null,
        zahlungsbedingungen: form.zahlungsbedingungen || null,
        notizen: form.notizen || null,
        betreff: form.betreff || null,
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
        skonto_prozent: form.skonto_prozent || 0,
        skonto_tage: form.skonto_tage || 0,
        kundennummer: (form as any).kundennummer || null,
      };

      if (isNew || !savedId) {
        const { data: numData, error: numError } = await supabase.rpc("next_invoice_number", {
          p_typ: form.typ,
          p_jahr: form.jahr,
        });

        if (numError) throw numError;
        const nummer = numData as string;
        const laufnummer = parseInt(nummer.replace(/\D/g, "").slice(-3)) || 1;

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

      // Filter empty items before saving
      const validItems = items.filter(item => item.beschreibung.trim());
      const itemsToInsert = validItems.map((item, idx) => ({
        invoice_id: savedId!,
        position: idx + 1,
        beschreibung: item.beschreibung,
        kurztext: item.kurztext || item.beschreibung,
        langtext: item.langtext || null,
        menge: item.menge,
        einheit: item.einheit,
        einzelpreis: item.einzelpreis,
        gesamtpreis: item.gesamtpreis,
        produktnummer: item.produktnummer || null,
      }));

      const { error: itemsError } = await supabase.from("invoice_items").insert(itemsToInsert);
      if (itemsError) throw itemsError;

      // Update form status to reflect saved state
      if (form.status === "entwurf") {
        updateField("status", saveStatus);
      }

      // Mark original Angebot as "verrechnet" when saving the converted Rechnung
      if (fromAngebotId && form.typ === "rechnung") {
        await supabase.from("invoices").update({ status: "verrechnet" }).eq("id", fromAngebotId);
        setFromAngebotId(null);
      }

      toast({ title: "Gespeichert", description: `${form.typ === "rechnung" ? "Rechnung" : "Angebot"} wurde gespeichert` });

      if (isNew && !previewOpen) {
        navigate(`/invoices/${savedId}`, { replace: true });
      } else if (isNew) {
        // Preview is open — don't navigate (would lose state), just update URL silently
        window.history.replaceState(null, "", `/invoices/${savedId}`);
      }

      setSaving(false);
      return true;
    } catch (err: any) {
      console.error("Fehler beim Speichern:", err);
      toast({ variant: "destructive", title: "Fehler", description: err.message || "Speichern fehlgeschlagen" });
      setSaving(false);
      return false;
    }
  };

  const handlePreview = () => {
    // Open preview directly — don't save automatically
    setPreviewSaved(!isNew && !!invoiceId && form.typ === "rechnung" && form.status !== "entwurf");
    setPreviewOpen(true);
  };

  const handleSaveFromPreview = async () => {
    const success = await handleSave(false);
    if (success) {
      setPreviewSaved(true);
      toast({ title: form.typ === "rechnung" ? "Rechnung erstellt" : "Gespeichert" });
    }
  };

  const handleSaveDraftFromPreview = async () => {
    const success = await handleSave(true);
    if (success) {
      toast({ title: "Entwurf gespeichert" });
    }
  };

  // Payment functions
  const loadPayments = async (invId: string) => {
    const { data } = await supabase
      .from("invoice_payments")
      .select("*")
      .eq("invoice_id", invId)
      .order("datum");
    if (data) setPayments(data);
  };

  const loadMahnungen = async () => {
    if (!invoiceId) return;
    const { data } = await supabase
      .from("mahnung_history")
      .select("mahnstufe, created_at")
      .eq("invoice_id", invoiceId)
      .order("created_at");
    if (data) setMahnungen(data);
  };

  const addPayment = async () => {
    if (!invoiceId) return;
    let betrag = Math.round((Number(newPaymentAmount) || restBetrag) * 100) / 100;
    if (betrag <= 0) return;

    // Prevent overpayment
    const maxBetrag = Math.round((bruttoSumme - form.bezahlt_betrag) * 100) / 100;
    if (betrag > maxBetrag) {
      toast({ variant: "destructive", title: "Betrag zu hoch", description: `Maximal € ${maxBetrag.toFixed(2)} offen` });
      return;
    }

    const { error } = await supabase.from("invoice_payments").insert({
      invoice_id: invoiceId,
      betrag,
      datum: newPaymentDate,
      notizen: newPaymentNote.trim() || null,
    });

    if (error) {
      toast({ variant: "destructive", title: "Fehler" });
      return;
    }

    // Update bezahlt_betrag on invoice
    const newTotal = Math.round((form.bezahlt_betrag + betrag) * 100) / 100;
    // Preserve storno status — don't override with payment status
    const newStatus = form.status === "storniert" ? "storniert" : (newTotal >= Math.round(bruttoSumme * 100) / 100 ? "bezahlt" : "teilbezahlt");
    await supabase.from("invoices").update({ bezahlt_betrag: newTotal, status: newStatus }).eq("id", invoiceId);
    updateField("bezahlt_betrag", newTotal);
    updateField("status", newStatus);

    setNewPaymentAmount("");
    setNewPaymentNote("");
    setNewPaymentDate(format(new Date(), "yyyy-MM-dd"));
    loadPayments(invoiceId);
    toast({ title: "Zahlung erfasst", description: `€ ${betrag.toFixed(2)} am ${newPaymentDate}` });
  };

  const deletePayment = async (paymentId: string) => {
    if (!invoiceId) return;
    const payment = payments.find(p => p.id === paymentId);
    if (!payment) return;

    await supabase.from("invoice_payments").delete().eq("id", paymentId);
    const newTotal = Math.round(Math.max(0, form.bezahlt_betrag - Number(payment.betrag)) * 100) / 100;
    // Don't overwrite storniert status
    const newStatus = form.status === "storniert" ? "storniert" : newTotal <= 0 ? "offen" : newTotal >= Math.round(bruttoSumme * 100) / 100 ? "bezahlt" : "teilbezahlt";
    await supabase.from("invoices").update({ bezahlt_betrag: newTotal, status: newStatus }).eq("id", invoiceId);
    updateField("bezahlt_betrag", newTotal);
    updateField("status", newStatus);
    loadPayments(invoiceId);
    toast({ title: "Zahlung gelöscht" });
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

  const handlePrintPdf = async () => {
    if (!invoiceId) return;
    try {
      const { data, error } = await supabase.functions.invoke("generate-invoice-pdf", {
        body: { invoiceId },
      });
      if (error) throw error;
      const html = decodeURIComponent(escape(atob(data.pdf)));
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 500);
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Drucken fehlgeschlagen", description: err.message });
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
      const laufnummer = parseInt(nummer.replace(/\D/g, "").slice(-3)) || 1;

      const { data: newInvoice, error: insertError } = await supabase
        .from("invoices")
        .insert({
          user_id: user.id,
          typ: form.typ,
          nummer,
          laufnummer,
          jahr: new Date().getFullYear(),
          status: form.typ === "rechnung" ? "offen" : "entwurf",
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
          kunde_anrede: (form as any).kunde_anrede || null,
          kunde_titel: (form as any).kunde_titel || null,
          reverse_charge: (form as any).reverse_charge || false,
          skonto_prozent: form.skonto_prozent || 0,
          skonto_tage: form.skonto_tage || 0,
          gueltig_bis: form.gueltig_bis || null,
          customer_id: form.customer_id || null,
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      const itemsToInsert = items.map((item, idx) => ({
        invoice_id: newInvoice.id,
        position: idx + 1,
        beschreibung: item.beschreibung,
        kurztext: (item as any).kurztext || item.beschreibung,
        langtext: (item as any).langtext || null,
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
    doConvert(items.map(it => ({ ...it })));
  };

  const doConvert = (finalItems: typeof items) => {
    const convertData = {
      fromAngebotId: invoiceId,
      kunde_name: form.kunde_name, kunde_adresse: form.kunde_adresse,
      kunde_plz: form.kunde_plz, kunde_ort: form.kunde_ort,
      kunde_land: form.kunde_land, kunde_email: form.kunde_email,
      kunde_telefon: form.kunde_telefon, kunde_uid: form.kunde_uid,
      customer_id: form.customer_id, project_id: form.project_id,
      leistungsdatum: form.leistungsdatum, zahlungsbedingungen: form.zahlungsbedingungen,
      notizen: form.notizen, mwst_satz: form.mwst_satz,
      rabatt_prozent: form.rabatt_prozent, rabatt_betrag: form.rabatt_betrag,
      skonto_prozent: form.skonto_prozent, skonto_tage: form.skonto_tage,
      kunde_anrede: (form as any).kunde_anrede || "",
      kunde_titel: (form as any).kunde_titel || "",
      reverse_charge: (form as any).reverse_charge || false,
      kundennummer: (form as any).kundennummer || "",
      items: finalItems,
    };
    sessionStorage.setItem("convertToInvoice", JSON.stringify(convertData));
    navigate("/invoices/new?typ=rechnung&from_angebot=true");
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
      const stornoNummer = `S-${form.nummer || invoiceId.substring(0, 8)}`;
      const stornoDatum = new Date().toISOString().split("T")[0];
      const { error } = await supabase.from("invoices").update({
        status: "storniert",
        storno_nummer: stornoNummer,
        storno_datum: stornoDatum,
        storno_grund: "Storniert durch Benutzer",
      }).eq("id", invoiceId);
      if (error) throw error;
      setForm(prev => ({ ...prev, status: "storniert", storno_nummer: stornoNummer, storno_datum: stornoDatum, storno_grund: "Storniert durch Benutzer" }));

      // Stornobeleg sofort erstellen und herunterladen
      try {
        const { generateStornoPdf } = await import("@/lib/pdfGenerator");
        let logoUri: string | undefined;
        try {
          const resp = await fetch("/logo-tilger.png");
          const blob = await resp.blob();
          logoUri = await new Promise<string>((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(blob); });
        } catch {}
        const pdfBlob = generateStornoPdf(
          { nummer: form.nummer, kunde_name: form.kunde_name, brutto_summe: bruttoSumme, datum: form.datum },
          stornoNummer, stornoDatum, "Storniert durch Benutzer",
          undefined, logoUri
        );
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement("a"); a.href = url; a.download = `Storno_${stornoNummer}.pdf`; a.click();
        URL.revokeObjectURL(url);
      } catch (pdfErr) {
        console.error("Storno-PDF Fehler:", pdfErr);
      }

      toast({ title: "Rechnung storniert", description: `Stornobeleg ${stornoNummer} wurde erstellt` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message || "Stornierung fehlgeschlagen" });
    }
  };

  const handleMahnstufeUp = async () => {
    if (!invoiceId) return;
    if (form.mahnstufe >= 3) {
      toast({ variant: "destructive", title: "Maximum erreicht", description: "Mahnstufe 3 (Letzte Mahnung) ist das Maximum" });
      return;
    }
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

  // Stornierte Rechnung: Nur Stornobeleg anzeigen
  if (form.status === "storniert" && !isNew && invoiceId) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-[800px]">
          <PageHeader title={`Storno: ${form.nummer}`} backPath="/invoices" />
          <div className="space-y-6">
            <Card>
              <CardContent className="pt-6 text-center space-y-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-2">
                  <Ban className="w-8 h-8 text-red-600" />
                </div>
                <h2 className="text-xl font-bold text-red-700">Rechnung storniert</h2>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>Rechnungsnummer: <strong>{form.nummer}</strong></p>
                  <p>Kunde: <strong>{form.kunde_name}</strong></p>
                  <p>Bruttobetrag: <strong>€ {bruttoSumme.toFixed(2)}</strong></p>
                  {form.storno_nummer && <p>Stornonummer: <strong>{form.storno_nummer}</strong></p>}
                  {form.storno_datum && <p>Storniert am: <strong>{new Date(form.storno_datum + "T12:00:00").toLocaleDateString("de-AT")}</strong></p>}
                  {form.storno_grund && <p>Grund: <strong>{form.storno_grund}</strong></p>}
                </div>
                <div className="flex justify-center gap-3 pt-4">
                  <Button variant="outline" onClick={() => navigate("/invoices")}>Zurück</Button>
                  <Button variant="default" className="gap-2" onClick={async () => {
                    try {
                      // Always load fresh from DB to ensure data is available
                      const { data: freshInv } = await supabase.from("invoices")
                        .select("storno_nummer, storno_datum, storno_grund, nummer, kunde_name, brutto_summe, datum")
                        .eq("id", invoiceId).single();
                      if (!freshInv?.storno_nummer) {
                        toast({ variant: "destructive", title: "Kein Stornobeleg vorhanden" });
                        return;
                      }
                      const { generateStornoPdf } = await import("@/lib/pdfGenerator");
                      let logoUri: string | undefined;
                      try {
                        const resp = await fetch("/logo-tilger.png");
                        const blob = await resp.blob();
                        logoUri = await new Promise<string>((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(blob); });
                      } catch {}
                      const pdfBlob = generateStornoPdf(
                        { nummer: freshInv.nummer, kunde_name: freshInv.kunde_name, brutto_summe: Number(freshInv.brutto_summe), datum: freshInv.datum },
                        freshInv.storno_nummer, freshInv.storno_datum || freshInv.datum, freshInv.storno_grund || "",
                        undefined, logoUri
                      );
                      const url = URL.createObjectURL(pdfBlob);
                      const a = document.createElement("a"); a.href = url; a.download = `Storno_${freshInv.storno_nummer}.pdf`; a.click();
                      URL.revokeObjectURL(url);
                    } catch (e) { console.error(e); toast({ variant: "destructive", title: "Fehler beim Erstellen" }); }
                  }}>
                    <Download className="w-4 h-4" />
                    Stornobeleg herunterladen
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-[1600px]">
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
                      <Badge variant="destructive">
                        {form.mahnstufe === 1 ? "Zahlungserinnerung" : `${form.mahnstufe}. Mahnung`}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {form.typ === "rechnung" && (form.status === "offen" || form.status === "teilbezahlt") && (
                      <Select onValueChange={async (stufe) => {
                        const mahnstufe = parseInt(stufe);
                        try {
                          // Update mahnstufe in DB + save history
                          await supabase.from("invoices").update({ mahnstufe }).eq("id", invoiceId);
                          await supabase.from("mahnung_history").insert({ invoice_id: invoiceId, mahnstufe });
                          updateField("mahnstufe", mahnstufe);
                          loadMahnungen();
                          // Generate Mahnung PDF
                          let logoUri: string | undefined;
                          try {
                            const resp = await fetch("/logo-tilger.png");
                            const blob = await resp.blob();
                            logoUri = await new Promise<string>((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(blob); });
                          } catch {}
                          const { data: bankSettings } = await supabase.from("app_settings").select("key, value").in("key", ["bank_kontoinhaber", "bank_iban", "bank_bic"]);
                          const bank = { kontoinhaber: "Gottfried Tilger", iban: "AT61 2081 5000 0423 1474", bic: "STSPAT2GXXX" };
                          bankSettings?.forEach((s: any) => {
                            if (s.key === "bank_kontoinhaber") bank.kontoinhaber = s.value;
                            if (s.key === "bank_iban") bank.iban = s.value;
                            if (s.key === "bank_bic") bank.bic = s.value;
                          });
                          const { generateMahnungPdf } = await import("@/lib/pdfGenerator");
                          const pdfBlob = generateMahnungPdf(
                            { nummer: form.nummer, datum: form.datum, faellig_am: form.faellig_am, kunde_name: form.kunde_name, kunde_adresse: form.kunde_adresse, kunde_plz: form.kunde_plz, kunde_ort: form.kunde_ort, brutto_summe: bruttoSumme, bezahlt_betrag: form.bezahlt_betrag },
                            mahnstufe, 0, bank, logoUri
                          );
                          const url = URL.createObjectURL(pdfBlob);
                          const a = document.createElement("a"); a.href = url;
                          const stufeLabel = mahnstufe === 1 ? "Zahlungserinnerung" : `${mahnstufe}. Mahnung`;
                          a.download = `${stufeLabel}_${form.nummer}.pdf`; a.click();
                          URL.revokeObjectURL(url);
                          toast({ title: `${stufeLabel} erstellt`, description: "PDF wurde heruntergeladen" });
                        } catch (err: any) {
                          toast({ variant: "destructive", title: "Fehler", description: err.message });
                        }
                      }}>
                        <SelectTrigger className="w-[220px] h-9 text-sm">
                          <SelectValue placeholder="Mahnung erstellen..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Zahlungserinnerung (1. Stufe)</SelectItem>
                          <SelectItem value="2">2. Mahnung</SelectItem>
                          <SelectItem value="3">3. Mahnung (Letzte)</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {form.typ === "angebot" && form.status !== "verrechnet" && form.status !== "abgelehnt" && (
                      <Button onClick={handleConvertToInvoice} variant="default" size="sm" className="gap-1.5">
                        <ArrowRightLeft className="w-4 h-4" />
                        In Rechnung umwandeln
                      </Button>
                    )}
                    <Button onClick={handleDuplicate} variant="outline" size="sm" className="gap-1.5">
                      <Copy className="w-4 h-4" />
                      Duplizieren
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

          {/* Zahlungsverlauf */}
          {!isNew && form.typ === "rechnung" && form.status !== "storniert" && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-base">Zahlungsverlauf</CardTitle>
                  <div className="flex items-center gap-4 text-sm">
                    <span>Brutto: <strong>€ {bruttoSumme.toFixed(2)}</strong></span>
                    <span>Bezahlt: <strong className="text-green-600">€ {form.bezahlt_betrag.toFixed(2)}</strong></span>
                    <span>Offen: <strong className={restBetrag > 0 ? "text-orange-600" : "text-green-600"}>€ {restBetrag.toFixed(2)}</strong></span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Existing payments */}
                {payments.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between p-2 rounded-md border bg-muted/30">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-green-700">€ {Number(p.betrag).toFixed(2)}</span>
                          <span className="text-sm text-muted-foreground">{format(parseISO(p.datum), "dd.MM.yyyy")}</span>
                          {p.notizen && <span className="text-xs text-muted-foreground italic">{p.notizen}</span>}
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => deletePayment(p.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add payment form */}
                {restBetrag > 0 && (
                  <div className="flex items-end gap-3 pt-2 border-t">
                    <div>
                      <Label className="text-xs">Betrag €</Label>
                      <Input
                        type="number"
                        value={newPaymentAmount}
                        onChange={(e) => setNewPaymentAmount(e.target.value)}
                        placeholder={restBetrag.toFixed(2)}
                        min={0}
                        step={0.01}
                        className="w-32"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Datum</Label>
                      <Input
                        type="date"
                        value={newPaymentDate}
                        onChange={(e) => setNewPaymentDate(e.target.value)}
                        className="w-40"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Notiz (optional)</Label>
                      <Input
                        value={newPaymentNote}
                        onChange={(e) => setNewPaymentNote(e.target.value)}
                        placeholder="z.B. Überweisung"
                        className="w-40"
                      />
                    </div>
                    <Button size="sm" onClick={addPayment} className="gap-1">
                      <Plus className="w-3.5 h-3.5" />
                      Zahlung
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Mahnungs-Übersicht */}
          {!isNew && form.typ === "rechnung" && mahnungen.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Mahnungen</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {mahnungen.map((m, idx) => {
                    const label = m.mahnstufe === 1 ? "Zahlungserinnerung" : m.mahnstufe === 2 ? "2. Mahnung" : "3. Mahnung (Letzte)";
                    const dateTime = new Date(m.created_at);
                    const dateStr = dateTime.toLocaleDateString("de-AT");
                    const timeStr = dateTime.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
                    return (
                      <div key={idx} className="flex items-center justify-between p-2 rounded-md border">
                        <div className="flex items-center gap-3">
                          <Badge variant={m.mahnstufe >= 3 ? "destructive" : "outline"} className="text-xs">
                            Stufe {m.mahnstufe}
                          </Badge>
                          <div>
                            <span className="text-sm font-medium">{label}</span>
                            <p className="text-xs text-muted-foreground">{dateStr} um {timeStr} Uhr</p>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" className="gap-1" onClick={async () => {
                          try {
                            let logoUri: string | undefined;
                            try {
                              const resp = await fetch("/logo-tilger.png");
                              const blob = await resp.blob();
                              logoUri = await new Promise<string>((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(blob); });
                            } catch {}
                            const { data: bankSettings } = await supabase.from("app_settings").select("key, value").in("key", ["bank_kontoinhaber", "bank_iban", "bank_bic"]);
                            const bank = { kontoinhaber: "Gottfried Tilger", iban: "AT61 2081 5000 0423 1474", bic: "STSPAT2GXXX" };
                            bankSettings?.forEach((s: any) => {
                              if (s.key === "bank_kontoinhaber") bank.kontoinhaber = s.value;
                              if (s.key === "bank_iban") bank.iban = s.value;
                              if (s.key === "bank_bic") bank.bic = s.value;
                            });
                            const { generateMahnungPdf } = await import("@/lib/pdfGenerator");
                            const pdfBlob = generateMahnungPdf(
                              { nummer: form.nummer, datum: form.datum, faellig_am: form.faellig_am, kunde_name: form.kunde_name, kunde_adresse: form.kunde_adresse, kunde_plz: form.kunde_plz, kunde_ort: form.kunde_ort, brutto_summe: bruttoSumme, bezahlt_betrag: form.bezahlt_betrag },
                              m.mahnstufe, 0, bank, logoUri
                            );
                            const url = URL.createObjectURL(pdfBlob);
                            const a = document.createElement("a"); a.href = url; a.download = `${label}_${form.nummer}.pdf`; a.click();
                            URL.revokeObjectURL(url);
                          } catch {}
                        }}>
                          <Download className="w-4 h-4" />
                          PDF
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Projekt-Auswahl (nur bei neuen Rechnungen, vor den Kundendaten) */}
          {!isLocked && form.typ === "rechnung" && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Projekt (optional)</CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={form.project_id || "none"} onValueChange={async (v) => {
                  const projectId = v === "none" ? null : v;
                  updateField("project_id", projectId);
                  if (projectId) {
                    const project = projects.find(p => p.id === projectId);
                    if (project && (project as any).customer_id) {
                      const { data: cust } = await supabase
                        .from("customers")
                        .select("id, name, anrede, titel, uid_nummer, adresse, plz, ort, land, email, telefon, kundennummer, skonto_prozent, skonto_tage, nettofrist")
                        .eq("id", (project as any).customer_id)
                        .single();
                      if (cust) {
                        setForm(prev => ({
                          ...prev,
                          customer_id: cust.id,
                          kunde_name: cust.name,
                          kunde_adresse: cust.adresse || "",
                          kunde_plz: cust.plz || "",
                          kunde_ort: cust.ort || "",
                          kunde_land: cust.land || "Österreich",
                          kunde_email: cust.email || "",
                          kunde_telefon: cust.telefon || "",
                          kunde_uid: cust.uid_nummer || "",
                          kunde_anrede: cust.anrede || "",
                          kunde_titel: cust.titel || "",
                          kundennummer: cust.kundennummer || "",
                          skonto_prozent: Number(cust.skonto_prozent) || 0,
                          skonto_tage: Number(cust.skonto_tage) || 0,
                        } as any));
                        const custNettofrist = Number(cust.nettofrist) || 0;
                        if (custNettofrist > 0) {
                          updateField("zahlungsbedingungen", `${custNettofrist} Tage`);
                          if (form.datum) {
                            const due = new Date(form.datum + "T12:00:00");
                            due.setDate(due.getDate() + custNettofrist);
                            updateField("faellig_am", due.toISOString().split("T")[0]);
                          }
                        }
                        toast({ title: "Kundendaten vom Projekt übernommen", description: cust.name });
                      }
                    }
                  }
                }}>
                  <SelectTrigger><SelectValue placeholder="Kein Projekt" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Kein Projekt</SelectItem>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.project_id && form.customer_id && (
                  <p className="text-xs text-green-600 mt-2">Kundendaten wurden automatisch vom Projekt übernommen</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Projekt-Anzeige bei gespeicherten Dokumenten */}
          {form.project_id && (isLocked || isKundeLocked) && (() => {
            const proj = projects.find(p => p.id === form.project_id);
            return proj ? (
              <div className="flex items-center gap-2 text-sm bg-blue-50 border border-blue-200 rounded-md p-2.5">
                <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                <span className="text-muted-foreground">Projekt:</span>
                <span className="font-medium">{proj.name}</span>
              </div>
            ) : null;
          })()}

          {/* Kundendaten — locked nach Speichern nur bei Rechnungen, bei Angeboten editierbar */}
          <Card className={isKundeLocked ? "opacity-80" : ""}>
            <fieldset disabled={isKundeLocked}>
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
                                const updates: any = {
                                  customer_id: c.id,
                                  kunde_name: c.name,
                                  kunde_adresse: c.adresse || "",
                                  kunde_plz: c.plz || "",
                                  kunde_ort: c.ort || "",
                                  kunde_land: c.land || "Österreich",
                                  kunde_email: c.email || "",
                                  kunde_telefon: c.telefon || "",
                                  kunde_uid: c.uid_nummer || "",
                                  kunde_anrede: (c as any).anrede || "",
                                  kunde_titel: (c as any).titel || "",
                                  kundennummer: (c as any).kundennummer || "",
                                };
                                // Übernehme Skonto + Zahlungsfrist vom Kunden (nur bei Rechnungen)
                                const hints: string[] = [];
                                if (form.typ === "rechnung") {
                                  const custSkonto = Number((c as any).skonto_prozent) || 0;
                                  const custSkontoTage = Number((c as any).skonto_tage) || 0;
                                  const custNettofrist = Number((c as any).nettofrist) || 0;
                                  if (custSkonto > 0) {
                                    updates.skonto_prozent = custSkonto;
                                    updates.skonto_tage = custSkontoTage;
                                    hints.push(`Skonto: ${custSkonto}% / ${custSkontoTage} Tage`);
                                  }
                                  if (custNettofrist > 0) {
                                    updates.zahlungsbedingungen = `${custNettofrist} Tage`;
                                    // Recalculate due date
                                    if (form.datum) {
                                      const due = new Date(form.datum + "T12:00:00");
                                      due.setDate(due.getDate() + custNettofrist);
                                      updates.faellig_am = due.toISOString().split("T")[0];
                                    }
                                    hints.push(`Zahlungsfrist: ${custNettofrist} Tage`);
                                  }
                                }
                                setForm(prev => ({ ...prev, ...updates }));
                                setCustomerPopoverOpen(false);
                                if (hints.length > 0) {
                                  toast({ title: "Kundeneinstellungen übernommen", description: hints.join(" · ") });
                                }
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
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Kundennr.</Label>
                  <Input value={(form as any).kundennummer || ""} onChange={(e) => updateField("kundennummer" as any, e.target.value)} placeholder="z.B. 10001" />
                </div>
                <div>
                  <Label>Anrede/Firma</Label>
                  <Select value={(form as any).kunde_anrede || "none"} onValueChange={(v) => updateField("kunde_anrede" as any, v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Wählen..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      <SelectItem value="Herr">Herr</SelectItem>
                      <SelectItem value="Frau">Frau</SelectItem>
                      <SelectItem value="Firma">Firma</SelectItem>
                      <SelectItem value="Divers">Divers</SelectItem>
                      <SelectItem value="Familie">Familie</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Titel</Label>
                  <Input value={(form as any).kunde_titel || ""} onChange={(e) => updateField("kunde_titel" as any, e.target.value)} placeholder="Mag., Dr., Ing." />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Firma / Name *</Label>
                  <Input value={form.kunde_name} onChange={(e) => updateField("kunde_name", e.target.value)} placeholder="Firmenname / Name" />
                </div>
                <div>
                  <Label>UID-Nummer</Label>
                  <div className="flex gap-2">
                    <Input value={form.kunde_uid} onChange={(e) => updateField("kunde_uid", e.target.value)} placeholder="ATU12345678" className="flex-1" />
                    <Button
                      type="button" variant="outline" size="sm"
                      disabled={!form.kunde_uid || form.kunde_uid.length < 4}
                      onClick={async () => {
                        try {
                          const { data, error } = await supabase.functions.invoke("check-vat", {
                            body: { vatNumber: form.kunde_uid.replace(/\s/g, "") },
                          });
                          if (error) throw error;
                          if (data.valid) {
                            toast({ title: "UID gültig", description: data.name || "Verifiziert" });
                            if (data.name && !form.kunde_name.trim()) updateField("kunde_name", data.name.trim());
                          } else {
                            toast({ variant: "destructive", title: "UID ungültig", description: data.error || "Nicht verifizierbar" });
                          }
                        } catch { toast({ variant: "destructive", title: "Prüfung fehlgeschlagen" }); }
                      }}
                    >Prüfen</Button>
                  </div>
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
              {/* Zahlungseinstellungen (vom Kunden) */}
              {form.typ === "rechnung" && (form.skonto_prozent > 0 || form.skonto_tage > 0 || (form as any).zahlungsbedingungen) && (
                <div className="mt-3 p-3 rounded-lg bg-muted/30 border">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Zahlungseinstellungen vom Kunden</p>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    {form.skonto_prozent > 0 && (
                      <div><span className="text-muted-foreground">Skonto:</span> <strong>{form.skonto_prozent}%</strong></div>
                    )}
                    {form.skonto_tage > 0 && (
                      <div><span className="text-muted-foreground">Skonto-Tage:</span> <strong>{form.skonto_tage}</strong></div>
                    )}
                    {form.zahlungsbedingungen && (
                      <div><span className="text-muted-foreground">Zahlungsfrist:</span> <strong>{form.zahlungsbedingungen}</strong></div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
            </fieldset>
          </Card>

          {/* Rechnungsdetails */}
          <Card className={isLocked ? "opacity-80" : ""}>
            <fieldset disabled={isLocked}>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Datum</Label>
                  <Input type="date" value={form.datum} onChange={(e) => updateField("datum", e.target.value)} />
                </div>
                {form.typ === "rechnung" && (
                  <div>
                    <Label>Leistungsdatum</Label>
                    <Input type="date" value={form.leistungsdatum} onChange={(e) => updateField("leistungsdatum", e.target.value)} />
                  </div>
                )}
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
                {form.typ === "rechnung" && (
                  <div>
                    <Label>Zahlungsfrist</Label>
                    <div className="flex gap-2">
                      <Select
                        value={form.zahlungsbedingungen || "14 Tage"}
                        onValueChange={(v) => {
                          if (v === "manuell") return;
                          updateField("zahlungsbedingungen", v);
                          const daysMatch = v.match(/(\d+)/);
                          const days = v === "sofort" ? 0 : daysMatch ? parseInt(daysMatch[1]) : 14;
                          if (form.datum) {
                            const due = new Date(form.datum + "T12:00:00");
                            due.setDate(due.getDate() + days);
                            updateField("faellig_am", format(due, "yyyy-MM-dd"));
                          }
                        }}
                      >
                        <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sofort">Sofort fällig</SelectItem>
                          <SelectItem value="7 Tage">7 Tage</SelectItem>
                          <SelectItem value="14 Tage">14 Tage</SelectItem>
                          <SelectItem value="30 Tage">30 Tage</SelectItem>
                          <SelectItem value="60 Tage">60 Tage</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">Oder manuell:</Label>
                      <Input type="number" min={0} placeholder="Tage" className="w-20" onChange={(e) => {
                        const days = parseInt(e.target.value);
                        if (!isNaN(days) && days >= 0) {
                          updateField("zahlungsbedingungen", `${days} Tage`);
                          if (form.datum) {
                            const due = new Date(form.datum + "T12:00:00");
                            due.setDate(due.getDate() + days);
                            updateField("faellig_am", format(due, "yyyy-MM-dd"));
                          }
                        }
                      }} />
                      <span className="text-xs text-muted-foreground">Tage</span>
                    </div>
                  </div>
                )}
                {form.typ === "rechnung" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Skonto %</Label>
                      <Input
                        type="number"
                        value={form.skonto_prozent || ""}
                        onChange={(e) => updateField("skonto_prozent", Math.min(100, Math.max(0, Number(e.target.value))))}
                        placeholder="z.B. 2"
                        min={0}
                        max={100}
                        step={0.5}
                      />
                    </div>
                    <div>
                      <Label>Skonto Tage</Label>
                      <Input
                        type="number"
                        value={form.skonto_tage || ""}
                        onChange={(e) => updateField("skonto_tage", Number(e.target.value))}
                        placeholder="z.B. 10"
                        min={0}
                      />
                    </div>
                    {form.skonto_prozent > 0 && form.skonto_tage > 0 && (
                      <p className="col-span-2 text-xs text-muted-foreground">
                        Bei Zahlung bis {form.datum ? format(new Date(new Date(form.datum).getTime() + form.skonto_tage * 86400000), "dd.MM.yyyy") : "–"}:
                        {" "}€ {(bruttoSumme * (1 - form.skonto_prozent / 100)).toFixed(2)} ({form.skonto_prozent}% Skonto)
                      </p>
                    )}
                  </div>
                )}
                {/* Projekt-Auswahl ist jetzt oben als eigene Card */}
              </div>
              {form.typ === "rechnung" && (
                <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                  <input
                    type="checkbox"
                    id="reverse_charge"
                    checked={(form as any).reverse_charge || false}
                    onChange={(e) => {
                      updateField("reverse_charge" as any, e.target.checked);
                      if (e.target.checked) {
                        updateField("mwst_satz", 0);
                      } else {
                        updateField("mwst_satz", 20);
                      }
                    }}
                    className="rounded"
                  />
                  <div>
                    <Label htmlFor="reverse_charge" className="cursor-pointer font-medium">Reverse Charge (Leistung in EU-Ausland)</Label>
                    <p className="text-xs text-muted-foreground">Steuerschuldnerschaft geht auf den Leistungsempfänger über — keine USt auf der Rechnung</p>
                  </div>
                </div>
              )}
              {(form as any).reverse_charge && !form.kunde_uid && (
                <p className="text-xs text-red-600 font-medium">UID-Nummer des Kunden ist bei Reverse Charge Pflicht!</p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>MwSt-Satz (%)</Label>
                  <Input type="number" value={form.mwst_satz} onChange={(e) => updateField("mwst_satz", Number(e.target.value))} className="w-32" disabled={(form as any).reverse_charge} />
                </div>
                <div>
                  <Label>Rabatt (%)</Label>
                  <Input
                    type="number"
                    value={form.rabatt_prozent}
                    onChange={(e) => {
                      const val = Math.min(100, Math.max(0, Number(e.target.value)));
                      updateField("rabatt_prozent", val);
                      if (val > 0) updateField("rabatt_betrag", 0);
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
            </fieldset>
          </Card>

          {/* Betreff */}
          <Card className={isLocked ? "opacity-80" : ""}>
            <fieldset disabled={isLocked}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Betreff</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={form.betreff}
                onChange={(e) => updateField("betreff", e.target.value)}
                placeholder="z.B. Badezimmer-Sanierung EG — Angebot gemäß Besprechung vom..."
                rows={2}
                className="resize-none"
              />
            </CardContent>
            </fieldset>
          </Card>

          {/* Positionen */}
          <Card className={isLocked ? "opacity-80" : ""}>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Positionen</CardTitle>
                {!isLocked && (
                <div className="flex gap-2 flex-wrap">
                  {form.typ === "rechnung" && (
                    <>
                      <Button onClick={() => setImportOfferOpen(true)} variant="outline" size="sm" className="gap-1">
                        <FileText className="w-4 h-4" />
                        Aus Angebot
                      </Button>
                      <Button onClick={() => setImportRegieOpen(true)} variant="outline" size="sm" className="gap-1">
                        <FileText className="w-4 h-4" />
                        Aus Regiebericht
                      </Button>
                      <Button onClick={() => setImportProjectOpen(true)} variant="outline" size="sm" className="gap-1">
                        <TrendingUp className="w-4 h-4" />
                        Aus Projekt
                      </Button>
                      <Button onClick={() => setImportLieferscheinOpen(true)} variant="outline" size="sm" className="gap-1">
                        <Package className="w-4 h-4" />
                        Aus Lieferschein
                      </Button>
                    </>
                  )}
                  <Button onClick={() => setTemplateDialogOpen(true)} variant="outline" size="sm" className="gap-1">
                    <Package className="w-4 h-4" />
                    Materialien
                  </Button>
                  <Button onClick={addItem} variant="outline" size="sm" className="gap-1">
                    <Plus className="w-4 h-4" />
                    Position
                  </Button>
                </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <fieldset disabled={isLocked}>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">Pos.</TableHead>
                      <TableHead>Beschreibung</TableHead>
                      <TableHead className="w-28">Menge</TableHead>
                      <TableHead className="w-24">Einheit</TableHead>
                      <TableHead className="w-32">Preis (netto) €</TableHead>
                      <TableHead className="w-20">Rabatt %</TableHead>
                      <TableHead className="w-28 text-right">Gesamt (netto) €</TableHead>
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, idx) => {
                      const acQuery = (autocompleteIdx === idx && item.beschreibung.length >= 2) ? item.beschreibung.toLowerCase() : "";
                      const acResults = acQuery ? templates.filter(t => {
                        const kb = ((t as any).kurzbezeichnung || t.name || "").toLowerCase();
                        const pn = ((t as any).produktnummer || "").toLowerCase();
                        const lb = ((t as any).langbezeichnung || t.beschreibung || "").toLowerCase();
                        const pg = ((t as any).produktgruppe || "").toLowerCase();
                        return kb.includes(acQuery) || pn.includes(acQuery) || lb.includes(acQuery) || pg.includes(acQuery);
                      }).slice(0, 20) : [];

                      return (
                      <TableRow key={idx}>
                        <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                        <TableCell>
                          <div className="relative">
                            <Input
                              value={item.beschreibung}
                              onChange={(e) => {
                                updateItem(idx, "beschreibung", e.target.value);
                                updateItem(idx, "kurztext", e.target.value);
                                setAutocompleteIdx(idx);
                              }}
                              onFocus={() => setAutocompleteIdx(idx)}
                              onBlur={() => setTimeout(() => setAutocompleteIdx(null), 200)}
                              placeholder="Kurzbezeichnung"
                            />
                            {/* Autocomplete dropdown */}
                            {acResults.length > 0 && (
                              <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-popover border rounded-md shadow-lg max-h-72 overflow-y-auto">
                                {acResults.map(t => (
                                  <button
                                    key={t.id}
                                    type="button"
                                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent flex justify-between gap-2"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      const netto = Number((t as any).netto_preis) || t.einzelpreis;
                                      updateItem(idx, "beschreibung", (t as any).kurzbezeichnung || t.name);
                                      updateItem(idx, "kurztext", (t as any).kurzbezeichnung || t.name);
                                      const lang = (t as any).langbezeichnung || "";
                                      const kurz = (t as any).kurzbezeichnung || t.name || "";
                                      // Langtext nur setzen wenn es eine echte Langbezeichnung gibt und sie sich vom Kurztext unterscheidet
                                      updateItem(idx, "langtext", lang && lang !== kurz ? lang : "");
                                      updateItem(idx, "einheit", t.einheit);
                                      updateItem(idx, "einzelpreis", netto);
                                      updateItem(idx, "produktnummer", (t as any).produktnummer || "");
                                      setAutocompleteIdx(null);
                                    }}
                                  >
                                    <span className="truncate">{(t as any).kurzbezeichnung || t.name}</span>
                                    <span className="text-xs text-muted-foreground shrink-0">
                                      {(t as any).produktnummer && <span className="mr-2">{(t as any).produktnummer}</span>}
                                      € {(Number((t as any).netto_preis) || t.einzelpreis).toFixed(2)}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          {item.produktnummer && (
                            <span className="text-[10px] text-muted-foreground mt-0.5 block">Prod.-Nr: {item.produktnummer}</span>
                          )}
                          {(item.langtext || !isLocked) && (
                            <textarea
                              value={item.langtext || ""}
                              onChange={(e) => {
                                updateItem(idx, "langtext", e.target.value);
                                e.target.style.height = "auto";
                                e.target.style.height = e.target.scrollHeight + "px";
                              }}
                              onFocus={(e) => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
                              placeholder="Langtext / Details (optional, wird auf PDF angezeigt)"
                              className="mt-1 w-full text-xs border rounded px-2 py-1 resize-none bg-muted/30"
                              style={{ minHeight: "28px", height: item.langtext ? "auto" : "28px" }}
                              rows={item.langtext ? Math.max(2, item.langtext.split("\n").length) : 1}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={item.menge} onChange={(e) => updateItem(idx, "menge", Number(e.target.value))} min={0} step={0.1} className="text-right" />
                        </TableCell>
                        <TableCell>
                          <Select value={item.einheit || "Stk."} onValueChange={(v) => updateItem(idx, "einheit", v)}>
                            <SelectTrigger className="w-[90px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {einheiten.map(e => (
                                <SelectItem key={e} value={e}>{e}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={item.einzelpreis} onChange={(e) => updateItem(idx, "einzelpreis", Number(e.target.value))} min={0} step={0.01} className="text-right" />
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={item.rabatt_prozent || ""} onChange={(e) => updateItem(idx, "rabatt_prozent", Number(e.target.value))} min={0} max={100} step={0.5} className="text-right" placeholder="0" />
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          € {item.gesamtpreis.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-0.5">
                            {!isLocked && (
                              <>
                                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === 0} onClick={() => moveItem(idx, "up")}>
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === items.length - 1} onClick={() => moveItem(idx, "down")}>
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            )}
                            {items.length > 1 && !isLocked && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(idx)}>
                                <Trash2 className="w-3.5 h-3.5 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                    {!isLocked && (
                      <TableRow>
                        <TableCell colSpan={8} className="py-1">
                          <Button onClick={addItem} variant="ghost" size="sm" className="gap-1 text-muted-foreground">
                            <Plus className="w-3.5 h-3.5" />
                            Position hinzufügen
                          </Button>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={6} className="text-right">Positionen Netto</TableCell>
                      <TableCell className="text-right font-medium">€ {positionenNetto.toFixed(2)}</TableCell>
                      <TableCell />
                    </TableRow>
                    {rabattWert > 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-right text-orange-600">
                          Rabatt {form.rabatt_prozent > 0 ? `(${form.rabatt_prozent}%)` : ""}
                        </TableCell>
                        <TableCell className="text-right text-orange-600">- € {rabattWert.toFixed(2)}</TableCell>
                        <TableCell />
                      </TableRow>
                    )}
                    <TableRow>
                      <TableCell colSpan={6} className="text-right">Netto</TableCell>
                      <TableCell className="text-right font-medium">€ {nettoSumme.toFixed(2)}</TableCell>
                      <TableCell />
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={6} className="text-right">MwSt ({form.mwst_satz}%)</TableCell>
                      <TableCell className="text-right">€ {mwstBetrag.toFixed(2)}</TableCell>
                      <TableCell />
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={6} className="text-right font-bold text-lg">Brutto</TableCell>
                      <TableCell className="text-right font-bold text-lg">€ {bruttoSumme.toFixed(2)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
              </fieldset>
            </CardContent>
          </Card>

          {/* Notizen */}
          <Card className={isLocked ? "opacity-80" : ""}>
            <CardHeader>
              <CardTitle>Notizen</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={form.notizen}
                onChange={(e) => updateField("notizen", e.target.value)}
                disabled={isLocked}
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
            <Button variant="outline" onClick={() => navigate("/invoices")}>
              {isLocked ? "Zurück" : "Abbrechen"}
            </Button>
            {canCancel && (
              <Button variant="destructive" onClick={() => setStornoDialogOpen(true)}>Stornieren</Button>
            )}
            {form.status === "storniert" && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={async () => {
                try {
                  const { generateStornoPdf } = await import("@/lib/pdfGenerator");
                  const logoResp = await fetch("/logo-tilger.png");
                  const logoBlob = await logoResp.blob();
                  const logoUri = await new Promise<string>((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(logoBlob); });
                  const { data: inv } = await supabase.from("invoices").select("storno_nummer, storno_datum, storno_grund").eq("id", invoiceId).single();
                  if (!inv?.storno_nummer) return;
                  const blob = generateStornoPdf(
                    { nummer: form.nummer, kunde_name: form.kunde_name, brutto_summe: bruttoSumme, datum: form.datum },
                    inv.storno_nummer, inv.storno_datum || form.datum, inv.storno_grund || "",
                    undefined, logoUri
                  );
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a"); a.href = url; a.download = `Storno_${inv.storno_nummer}.pdf`; a.click(); URL.revokeObjectURL(url);
                } catch (e) { console.error(e); }
              }}>
                <Download className="w-4 h-4" />
                Storno-Beleg
              </Button>
            )}
            {isLocked && form.typ === "angebot" && form.status !== "verrechnet" && (
              <Button variant="destructive" onClick={async () => {
                if (!confirm("Angebot wirklich löschen?")) return;
                await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
                await supabase.from("invoices").delete().eq("id", invoiceId);
                toast({ title: "Angebot gelöscht" });
                navigate("/invoices");
              }}>Löschen</Button>
            )}
            {isLocked ? (
              <>
                <Button onClick={handleDownloadPdf} variant="outline" className="gap-2">
                  <Download className="w-4 h-4" />
                  PDF herunterladen
                </Button>
                <Button onClick={handlePrintPdf} variant="outline" className="gap-2">
                  <Printer className="w-4 h-4" />
                  Drucken
                </Button>
              </>
            ) : (
              <>
                {!isNew && invoiceId && (
                  <>
                    <Button onClick={handleDownloadPdf} variant="outline" className="gap-2">
                      <Download className="w-4 h-4" />
                      PDF
                    </Button>
                    <Button onClick={handlePrintPdf} variant="outline" className="gap-2">
                      <Printer className="w-4 h-4" />
                      Drucken
                    </Button>
                  </>
                )}
                {form.typ === "rechnung" && (
                  <Button onClick={async () => {
                    const ok = await handleSave(true);
                    if (ok) toast({ title: "Entwurf gespeichert" });
                  }} variant="outline" className="gap-2">
                    <Save className="w-4 h-4" />
                    Entwurf speichern
                  </Button>
                )}
                <Button onClick={handlePreview} className="gap-2">
                  <Eye className="w-4 h-4" />
                  Vorschau
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Template Picker Dialog — Suche + Filter + Multi-Select */}
        <Dialog open={templateDialogOpen} onOpenChange={(open) => {
          setTemplateDialogOpen(open);
          if (!open) setTemplateSearch("");
          if (!open) setTemplateFilter("alle");
          if (!open) setSelectedTemplateIds([]);
          if (!open) setAddedFromDialog([]);
          if (!open) setTemplateMengen({});
        }}>
          <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Materialien einfügen</DialogTitle>
            </DialogHeader>
            <div className="flex gap-3 mb-3">
              <Input
                placeholder="Suchen..."
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                className="flex-1"
              />
              <Select value={templateFilter} onValueChange={setTemplateFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Alle Gruppen" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle Gruppen</SelectItem>
                  {Object.keys(groupedTemplates).sort().map(k => (
                    <SelectItem key={k} value={k}>{k}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="overflow-y-auto flex-1 space-y-1 border rounded-md p-2">
              {(() => {
                const s = templateSearch.toLowerCase();
                const filtered = templates.filter(t => {
                  const matchSearch = !s || t.name.toLowerCase().includes(s) || (t.beschreibung && t.beschreibung.toLowerCase().includes(s)) || ((t as any).kurzbezeichnung && (t as any).kurzbezeichnung.toLowerCase().includes(s));
                  const matchFilter = templateFilter === "alle" || t.kategorie === templateFilter;
                  return matchSearch && matchFilter;
                });
                if (filtered.length === 0) return <p className="text-center text-muted-foreground py-8">Keine Materialien gefunden</p>;

                const favoriten = filtered.filter(t => t.ist_favorit);
                const restliche = filtered.filter(t => !t.ist_favorit);

                const toggleFavorit = async (e: React.MouseEvent, templateId: string) => {
                  e.stopPropagation();
                  const tmpl = templates.find(t => t.id === templateId);
                  if (!tmpl) return;
                  const newVal = !tmpl.ist_favorit;
                  await supabase.from("invoice_templates").update({ ist_favorit: newVal } as any).eq("id", templateId);
                  setTemplates(prev => prev.map(t => t.id === templateId ? { ...t, ist_favorit: newVal } : t));
                };

                const renderItem = (t: TemplateItem) => {
                  const isSelected = selectedTemplateIds.includes(t.id);
                  const netto = Number((t as any).netto_preis) || t.einzelpreis;
                  return (
                    <div key={t.id} className={`flex items-center gap-2 p-2 rounded hover:bg-accent text-sm ${isSelected ? "bg-primary/10" : ""}`}>
                      <button onClick={(e) => toggleFavorit(e, t.id)} className="shrink-0 p-0.5 hover:scale-110 transition-transform" title={t.ist_favorit ? "Favorit entfernen" : "Als Favorit markieren"}>
                        <Star className={`w-3.5 h-3.5 ${t.ist_favorit ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40 hover:text-yellow-400"}`} />
                      </button>
                      <input type="checkbox" checked={isSelected} onChange={() => {
                        setSelectedTemplateIds(prev => isSelected ? prev.filter(id => id !== t.id) : [...prev, t.id]);
                        if (!isSelected) setTemplateMengen(prev => ({ ...prev, [t.id]: 1 }));
                      }} className="rounded cursor-pointer" />
                      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => {
                        setSelectedTemplateIds(prev => isSelected ? prev.filter(id => id !== t.id) : [...prev, t.id]);
                        if (!isSelected) setTemplateMengen(prev => ({ ...prev, [t.id]: 1 }));
                      }}>
                        <p className="font-medium truncate">{(t as any).kurzbezeichnung || t.name}</p>
                        {(t as any).langbezeichnung && <p className="text-xs text-muted-foreground truncate">{(t as any).langbezeichnung}</p>}
                      </div>
                      {isSelected && (
                        <Input
                          type="number"
                          value={templateMengen[t.id] || 1}
                          onChange={(e) => { e.stopPropagation(); setTemplateMengen(prev => ({ ...prev, [t.id]: Number(e.target.value) || 1 })); }}
                          onClick={(e) => e.stopPropagation()}
                          min={0.01} step={0.01}
                          className="w-16 text-right text-xs h-7"
                        />
                      )}
                      <span className="text-xs text-muted-foreground shrink-0 w-12 text-center">{t.einheit}</span>
                      <span className="text-sm font-mono shrink-0 w-20 text-right">{netto > 0 ? `€ ${netto.toFixed(2)}` : "–"}</span>
                    </div>
                  );
                };

                return (
                  <>
                    {favoriten.length > 0 && (
                      <>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 pt-1">⭐ Häufig verwendet</p>
                        {favoriten.map(renderItem)}
                        {restliche.length > 0 && <hr className="my-2 border-border" />}
                      </>
                    )}
                    {restliche.map(renderItem)}
                  </>
                );
              })()}
            </div>
            {addedFromDialog.length > 0 && (
              <div className="border-t pt-2 mt-2">
                <p className="text-xs font-medium text-muted-foreground mb-1">Bereits hinzugefügt ({addedFromDialog.length}):</p>
                <div className="flex flex-wrap gap-1.5">
                  {addedFromDialog.map((a, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded px-2 py-0.5">
                      {a.menge > 1 ? `${a.menge} ${a.einheit}` : ""} {a.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-between items-center pt-2">
              <span className="text-sm text-muted-foreground">{selectedTemplateIds.length} ausgewählt</span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>Abbrechen</Button>
                <Button disabled={selectedTemplateIds.length === 0} onClick={() => {
                  const selected = templates.filter(t => selectedTemplateIds.includes(t.id));
                  const newItems = selected.map(t => {
                    const netto = Number((t as any).netto_preis) || t.einzelpreis;
                    const menge = templateMengen[t.id] || 1;
                    return {
                      position: 1,
                      beschreibung: (t as any).kurzbezeichnung || t.name || t.beschreibung,
                      kurztext: (t as any).kurzbezeichnung || t.name,
                      langtext: (t as any).langbezeichnung || t.beschreibung || "",
                      menge,
                      einheit: t.einheit,
                      einzelpreis: netto,
                      gesamtpreis: Math.round(netto * menge * 100) / 100,
                    } as InvoiceItem;
                  });
                  setItems(prev => mergeItems(prev, newItems));
                  // Track was hinzugefügt wurde
                  setAddedFromDialog(prev => [...prev, ...newItems.map(i => ({ name: i.beschreibung, menge: i.menge, einheit: i.einheit }))]);
                  // Dialog bleibt offen — nur Auswahl zurücksetzen
                  setSelectedTemplateIds([]);
                  setTemplateMengen({});
                  toast({ title: `${newItems.length} Positionen hinzugefügt` });
                }} className="gap-2">
                  <Plus className="w-4 h-4" />
                  {selectedTemplateIds.length > 0 ? `${selectedTemplateIds.length} hinzufügen` : "Hinzufügen"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        {/* PDF Preview Dialog — works both before and after saving */}
        <InvoicePdfPreview
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          onSave={handleSaveFromPreview}
          onSaveDraft={form.typ === "rechnung" ? handleSaveDraftFromPreview : undefined}
          onSavedClose={() => navigate("/invoices")}
          saving={saving}
          saved={previewSaved}
          saveLabel={form.typ === "rechnung" ? "Rechnung erstellen" : undefined}
          fileName={form.nummer || (form.typ === "angebot" ? "Angebot" : "Rechnung")}
          formData={{
            typ: form.typ,
            nummer: form.nummer,
            status: form.status,
            kunde_name: form.kunde_name,
            kunde_adresse: form.kunde_adresse,
            kunde_plz: form.kunde_plz,
            kunde_ort: form.kunde_ort,
            kunde_land: form.kunde_land,
            kunde_email: form.kunde_email,
            kunde_telefon: form.kunde_telefon,
            kunde_uid: form.kunde_uid,
            kunde_anrede: (form as any).kunde_anrede || "",
            kunde_titel: (form as any).kunde_titel || "",
            reverse_charge: (form as any).reverse_charge || false,
            datum: form.datum,
            faellig_am: form.faellig_am,
            leistungsdatum: form.leistungsdatum,
            gueltig_bis: form.gueltig_bis,
            zahlungsbedingungen: form.zahlungsbedingungen,
            notizen: form.notizen,
            betreff: form.betreff,
            netto_summe: nettoSumme,
            mwst_satz: form.mwst_satz,
            mwst_betrag: mwstBetrag,
            brutto_summe: bruttoSumme,
            bezahlt_betrag: form.bezahlt_betrag,
            rabatt_prozent: form.rabatt_prozent,
            rabatt_betrag: form.rabatt_betrag,
            mahnstufe: form.mahnstufe,
            skonto_prozent: form.skonto_prozent,
            skonto_tage: form.skonto_tage,
          }}
          items={items.map((item, idx) => ({
            position: idx + 1,
            beschreibung: item.beschreibung,
            kurztext: item.kurztext || item.beschreibung,
            langtext: item.langtext || "",
            menge: item.menge,
            einheit: item.einheit,
            einzelpreis: item.einzelpreis,
            gesamtpreis: item.gesamtpreis,
          }))}
        />

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
            setItems(prev => mergeItems(prev, newItems));
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
            setItems(prev => mergeItems(prev, newItems));
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

        {/* Import Time Dialog */}
        <ImportTimeDialog
          open={importTimeOpen}
          onClose={() => setImportTimeOpen(false)}
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
            setItems(prev => mergeItems(prev, newItems));
            setImportTimeOpen(false);
            toast({ title: "Arbeitszeit importiert", description: `${newItems.length} Positionen hinzugefügt` });
          }}
        />

        {/* Import from Project Dialog (Arbeitszeit + Material) */}
        <ImportFromProjectDialog
          open={importProjectOpen}
          onClose={() => setImportProjectOpen(false)}
          projectId={form.project_id}
          onImport={(importedItems) => {
            setItems(prev => {
              // Replace matching positions (same beschreibung) with imported menge
              let updated = prev.map(existing => {
                const match = importedItems.find(imp =>
                  imp.beschreibung.toLowerCase().trim() === existing.beschreibung.toLowerCase().trim()
                );
                if (match) {
                  return {
                    ...existing,
                    menge: match.menge,
                    einzelpreis: match.einzelpreis || existing.einzelpreis,
                    gesamtpreis: match.menge * (match.einzelpreis || existing.einzelpreis),
                  };
                }
                return existing;
              });
              // Add new positions that don't exist yet
              const newOnes = importedItems.filter(imp =>
                !prev.some(ex => ex.beschreibung.toLowerCase().trim() === imp.beschreibung.toLowerCase().trim())
              );
              if (newOnes.length > 0) {
                const additions = newOnes.map((item, idx) => ({
                  position: updated.length + idx + 1,
                  beschreibung: item.beschreibung,
                  menge: item.menge,
                  einheit: item.einheit,
                  einzelpreis: item.einzelpreis,
                  gesamtpreis: item.menge * item.einzelpreis,
                }));
                updated = [...updated, ...additions];
              }
              return updated.map((item, idx) => ({ ...item, position: idx + 1 }));
            });
            setImportProjectOpen(false);
            const replaced = importedItems.filter(imp => items.some(ex => ex.beschreibung.toLowerCase().trim() === imp.beschreibung.toLowerCase().trim())).length;
            const added = importedItems.length - replaced;
            toast({ title: "Aus Projekt importiert", description: `${replaced} Positionen aktualisiert${added > 0 ? `, ${added} neu hinzugefügt` : ""}` });
          }}
        />

        {/* Import from Lieferschein Dialog */}
        <ImportLieferscheinDialog
          open={importLieferscheinOpen}
          onClose={() => setImportLieferscheinOpen(false)}
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
            setItems(prev => mergeItems(prev, newItems));
            setImportLieferscheinOpen(false);
            toast({ title: "Material importiert", description: `${newItems.length} Positionen aus Lieferscheinen hinzugefügt` });
          }}
        />

        {/* Import from Regiebericht Dialog */}
        <ImportDisturbanceToInvoiceDialog
          open={importRegieOpen}
          onClose={() => setImportRegieOpen(false)}
          preselectedId={searchParams.get("disturbance_id")}
          onImport={(importedItems, kundeData) => {
            const newItems = importedItems.map((item, idx) => ({
              position: items.length + idx + 1,
              beschreibung: item.beschreibung,
              menge: item.menge,
              einheit: item.einheit,
              einzelpreis: item.einzelpreis,
              gesamtpreis: item.menge * item.einzelpreis,
            }));
            setItems(prev => mergeItems(prev, newItems));
            if (kundeData && !form.kunde_name) {
              setForm(prev => ({
                ...prev,
                kunde_name: kundeData.kunde_name || prev.kunde_name,
                kunde_adresse: kundeData.kunde_adresse || prev.kunde_adresse,
                kunde_plz: kundeData.kunde_plz || prev.kunde_plz,
                kunde_ort: kundeData.kunde_ort || prev.kunde_ort,
                kunde_land: kundeData.kunde_land || prev.kunde_land,
                kunde_email: kundeData.kunde_email || prev.kunde_email,
                kunde_telefon: kundeData.kunde_telefon || prev.kunde_telefon,
                kunde_uid: kundeData.kunde_uid || prev.kunde_uid,
              }));
            }
            setImportRegieOpen(false);
            toast({ title: "Aus Regiebericht importiert", description: `${newItems.length} Positionen hinzugefügt` });
          }}
        />

        {/* Import from Offer Dialog */}
        <ImportFromOfferDialog
          open={importOfferOpen}
          onClose={() => setImportOfferOpen(false)}
          projectId={form.project_id}
          onImport={(importedItems, offer) => {
            const newItems = importedItems.map((item, idx) => ({
              position: items.length + idx + 1,
              beschreibung: item.beschreibung,
              menge: item.menge,
              einheit: item.einheit,
              einzelpreis: item.einzelpreis,
              gesamtpreis: item.menge * item.einzelpreis,
            }));
            setItems(prev => mergeItems(prev, newItems));
            // Fill customer data from offer if empty
            if (!form.kunde_name && offer.kunde_name) {
              setForm(prev => ({
                ...prev,
                kunde_name: offer.kunde_name || prev.kunde_name,
                kunde_adresse: offer.kunde_adresse || prev.kunde_adresse,
                kunde_plz: offer.kunde_plz || prev.kunde_plz,
                kunde_ort: offer.kunde_ort || prev.kunde_ort,
                kunde_land: offer.kunde_land || prev.kunde_land,
                kunde_email: offer.kunde_email || prev.kunde_email,
                kunde_telefon: offer.kunde_telefon || prev.kunde_telefon,
                kunde_uid: offer.kunde_uid || prev.kunde_uid,
                customer_id: offer.customer_id || prev.customer_id,
              }));
            }
            setImportOfferOpen(false);
            toast({ title: "Aus Angebot importiert", description: `${newItems.length} Positionen hinzugefügt` });
          }}
        />

        {/* Storno Dialog */}
        <Dialog open={stornoDialogOpen} onOpenChange={setStornoDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Rechnung stornieren</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Die Rechnung {form.nummer} wird unwiderruflich storniert. Eine Storno-Bestätigung wird erstellt.
            </p>
            <div>
              <Label>Storno-Grund *</Label>
              <Textarea
                value={stornoGrund}
                onChange={(e) => setStornoGrund(e.target.value)}
                placeholder="z.B. Fehlerhafte Rechnung, Kundenreklamation, doppelt erstellt..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStornoDialogOpen(false)}>Abbrechen</Button>
              <Button variant="destructive" disabled={!stornoGrund.trim()} onClick={async () => {
                const year = form.jahr || new Date().getFullYear();
                const { data: maxStorno } = await supabase
                  .from("invoices")
                  .select("storno_nummer")
                  .like("storno_nummer", `ST-${year}-%`)
                  .order("storno_nummer", { ascending: false })
                  .limit(1)
                  .maybeSingle();

                let nextNum = 1;
                if (maxStorno?.storno_nummer) {
                  const match = maxStorno.storno_nummer.match(/ST-\d+-(\d+)/);
                  if (match) nextNum = parseInt(match[1]) + 1;
                }
                const stornoNummer = `ST-${year}-${String(nextNum).padStart(3, "0")}`;
                const stornoDatum = new Date().toISOString().split("T")[0];

                await supabase.from("invoices").update({
                  status: "storniert",
                  storno_nummer: stornoNummer,
                  storno_datum: stornoDatum,
                  storno_grund: stornoGrund.trim(),
                }).eq("id", invoiceId);

                // Update local form state with storno data
                setForm(prev => ({
                  ...prev,
                  status: "storniert",
                  storno_nummer: stornoNummer,
                  storno_datum: stornoDatum,
                  storno_grund: stornoGrund.trim(),
                }));

                // Generate and download Storno-PDF
                try {
                  const { generateStornoPdf } = await import("@/lib/pdfGenerator");
                  const logoResp = await fetch("/logo-tilger.png");
                  const logoBlob = await logoResp.blob();
                  const logoUri = await new Promise<string>((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(logoBlob); });

                  const stornoBlob = generateStornoPdf(
                    { nummer: form.nummer, kunde_name: form.kunde_name, brutto_summe: bruttoSumme, datum: form.datum },
                    stornoNummer, stornoDatum, stornoGrund.trim(),
                    undefined, logoUri
                  );
                  const url = URL.createObjectURL(stornoBlob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `Storno_${stornoNummer}.pdf`;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch (e) { console.warn("Storno-PDF failed:", e); }

                toast({ title: "Rechnung storniert", description: `Stornonummer: ${stornoNummer}` });
                setStornoDialogOpen(false);
                navigate("/invoices");
              }}>
                Rechnung stornieren
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Create Project Dialog (when offer accepted) */}
        <CreateProjectDialog
          open={createProjectDialogOpen}
          onClose={() => setCreateProjectDialogOpen(false)}
          onCreated={async (newProject) => {
            updateField("project_id", newProject.id);
            const { data: projectsData } = await supabase
              .from("projects")
              .select("id, name")
              .eq("status", "aktiv")
              .order("name");
            if (projectsData) setProjects(projectsData);
            setCreateProjectDialogOpen(false);
          }}
          defaultName={`${form.kunde_name} - ${form.nummer}`}
          defaultCustomerName={form.kunde_name}
          defaultAdresse={form.kunde_adresse}
          defaultPlz={form.kunde_plz}
          defaultOrt={form.kunde_ort}
        />
      </div>

    </div>
  );
}
