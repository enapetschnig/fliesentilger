import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { FileText, Receipt, Filter, Package, AlertTriangle, Zap } from "lucide-react";
import { format, parseISO, isBefore } from "date-fns";
import { de } from "date-fns/locale";
import { PageHeader } from "@/components/PageHeader";
import { QuickOfferDialog } from "@/components/QuickOfferDialog";

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
};

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTyp, setFilterTyp] = useState<string>("alle");
  const [filterStatus, setFilterStatus] = useState<string>("alle");
  const [quickOfferOpen, setQuickOfferOpen] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    const { data, error } = await supabase
      .from("invoices")
      .select("id, typ, nummer, status, kunde_name, datum, brutto_summe, netto_summe, project_id, faellig_am, mahnstufe, gueltig_bis")
      .order("datum", { ascending: false });

    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Rechnungen konnten nicht geladen werden" });
    } else {
      setInvoices((data || []).map(d => ({ ...d, mahnstufe: (d as any).mahnstufe || 0, gueltig_bis: (d as any).gueltig_bis || null })));
    }
    setLoading(false);
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
    .reduce((sum, i) => sum + Number(i.brutto_summe), 0);
  const bezahlteSumme = invoices
    .filter(i => i.typ === "rechnung" && i.status === "bezahlt")
    .reduce((sum, i) => sum + Number(i.brutto_summe), 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
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
                <Filter className="w-5 h-5 text-muted-foreground" />
                <Select value={filterTyp} onValueChange={setFilterTyp}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle Typen</SelectItem>
                    <SelectItem value="rechnung">Rechnungen</SelectItem>
                    <SelectItem value="angebot">Angebote</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle Status</SelectItem>
                    <SelectItem value="entwurf">Entwurf</SelectItem>
                    <SelectItem value="gesendet">Gesendet</SelectItem>
                    <SelectItem value="bezahlt">Bezahlt</SelectItem>
                    <SelectItem value="teilbezahlt">Teilbezahlt</SelectItem>
                    <SelectItem value="storniert">Storniert</SelectItem>
                    <SelectItem value="angenommen">Angenommen</SelectItem>
                    <SelectItem value="abgelehnt">Abgelehnt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button onClick={() => setQuickOfferOpen(true)} variant="default" className="gap-2 bg-primary">
                  <Zap className="w-4 h-4" />
                  Schnellangebot
                </Button>
                <Button onClick={() => navigate("/invoices/packages")} variant="outline" className="gap-2">
                  <Package className="w-4 h-4" />
                  Pakete
                </Button>
                <Button onClick={() => navigate("/invoices/templates")} variant="outline" className="gap-2">
                  <Package className="w-4 h-4" />
                  Vorlagen
                </Button>
                <Button onClick={() => navigate("/invoices/new?typ=angebot")} variant="outline" className="gap-2">
                  <FileText className="w-4 h-4" />
                  Neues Angebot
                </Button>
                <Button onClick={() => navigate("/invoices/new?typ=rechnung")} variant="outline" className="gap-2">
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
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((inv) => {
                      const overdue = isOverdue(inv);
                      const expired = isExpiredOffer(inv);
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
                          <TableCell className="text-right font-medium">€ {Number(inv.brutto_summe).toFixed(2)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge className={statusColors[inv.status] || ""}>
                                {statusLabels[inv.status] || inv.status}
                              </Badge>
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
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <QuickOfferDialog open={quickOfferOpen} onOpenChange={setQuickOfferOpen} />
    </div>
  );
}
