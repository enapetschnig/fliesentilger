import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, FileText, FileCheck, Package, Camera, ImagePlus, Lock, ArrowUp, Pencil, Check, Settings } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type DocumentCategory = {
  type: "plans" | "reports" | "photos" | "chef";
  title: string;
  description: string;
  icon: React.ReactNode;
  count: number;
  adminOnly?: boolean;
};

const ProjectOverview = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [projectName, setProjectName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "", beschreibung: "", adresse: "", plz: "", ort: "",
    customer_id: null as string | null, kunde_name: "", kunde_anrede: "", kunde_titel: "",
    kunde_adresse: "", kunde_plz: "", kunde_ort: "", kunde_email: "", kunde_telefon: "", kunde_uid: "",
  });
  const [customers, setCustomers] = useState<{ id: string; name: string; plz: string | null; ort: string | null }[]>([]);
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [lieferscheinCount, setLieferscheinCount] = useState(0);
  const [invoiceCount, setInvoiceCount] = useState(0);
  const [angebotPositionen, setAngebotPositionen] = useState<{position: number; beschreibung: string; menge: number; einheit: string}[]>([]);
  const [categories, setCategories] = useState<DocumentCategory[]>([
    {
      type: "photos",
      title: "Fotos",
      description: "Baufortschritt und Dokumentationsfotos",
      icon: <Camera className="h-8 w-8" />,
      count: 0,
    },
    {
      type: "plans",
      title: "Pläne",
      description: "Baupläne und technische Zeichnungen",
      icon: <FileText className="h-8 w-8" />,
      count: 0,
    },
    {
      type: "chef",
      title: "🔒 Chefordner",
      description: "Vertrauliche Chef-Dokumente",
      icon: <Lock className="h-8 w-8" />,
      count: 0,
      adminOnly: true,
    },
  ]);

  useEffect(() => {
    if (projectId) {
      checkAdminStatus();
      fetchProjectName();
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId) {
      fetchFileCounts();
      fetchLieferscheinCount();
      fetchInvoiceCount();
      fetchAngebotPositionen();
    }
  }, [projectId, isAdmin]);

  const fetchAngebotPositionen = async () => {
    if (!projectId) return;
    const { data: angebote } = await supabase.from("invoices")
      .select("id").eq("project_id", projectId).eq("typ", "angebot")
      .not("status", "eq", "storniert")
      .order("datum", { ascending: false }).limit(1);
    if (angebote?.[0]) {
      const { data: items } = await supabase.from("invoice_items")
        .select("position, beschreibung, kurztext, menge, einheit")
        .eq("invoice_id", angebote[0].id).order("position");
      setAngebotPositionen((items || []).map(i => ({
        position: i.position, beschreibung: (i as any).kurztext || i.beschreibung,
        menge: Number(i.menge), einheit: i.einheit || "Stk.",
      })));
    }
  };

  const checkAdminStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "administrator")
      .maybeSingle();

    setIsAdmin(!!data);
  };

  const openEditDialog = async () => {
    if (!projectId) return;
    // Load project
    const { data: proj } = await supabase.from("projects").select("*").eq("id", projectId).single();
    if (!proj) return;
    // Parse adresse (stored as "street, plz, city")
    const parts = (proj.adresse || "").split(",").map((s: string) => s.trim());
    // Load customer
    let kunde: any = {};
    if (proj.customer_id) {
      const { data: c } = await supabase.from("customers").select("*").eq("id", proj.customer_id).single();
      if (c) kunde = c;
    }
    // Load customer list
    const { data: custs } = await supabase.from("customers").select("id, name, plz, ort").order("name");
    setCustomers(custs || []);
    setEditForm({
      name: proj.name || "",
      beschreibung: proj.beschreibung || "",
      adresse: kunde.adresse || parts[0] || "",
      plz: proj.plz || kunde.plz || parts[1] || "",
      ort: kunde.ort || parts[2] || "",
      customer_id: proj.customer_id || null,
      kunde_name: kunde.name || "",
      kunde_anrede: kunde.anrede || "",
      kunde_titel: kunde.titel || "",
      kunde_adresse: kunde.adresse || parts[0] || "",
      kunde_plz: kunde.plz || proj.plz || "",
      kunde_ort: kunde.ort || "",
      kunde_email: kunde.email || "",
      kunde_telefon: kunde.telefon || "",
      kunde_uid: kunde.uid_nummer || "",
    });
    setEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    if (!projectId || !editForm.name.trim()) return;
    setEditSaving(true);
    // Update project
    const adresseStr = [editForm.kunde_adresse, editForm.kunde_plz, editForm.kunde_ort].filter(Boolean).join(", ");
    await supabase.from("projects").update({
      name: editForm.name.trim(),
      beschreibung: editForm.beschreibung.trim() || null,
      adresse: adresseStr || null,
      plz: editForm.kunde_plz.trim() || null,
      customer_id: editForm.customer_id,
    }).eq("id", projectId);
    // Update or create customer
    if (editForm.customer_id && editForm.kunde_name.trim()) {
      await supabase.from("customers").update({
        name: editForm.kunde_name.trim(),
        anrede: editForm.kunde_anrede || null,
        titel: editForm.kunde_titel.trim() || null,
        adresse: editForm.kunde_adresse.trim() || null,
        plz: editForm.kunde_plz.trim() || null,
        ort: editForm.kunde_ort.trim() || null,
        email: editForm.kunde_email.trim() || null,
        telefon: editForm.kunde_telefon.trim() || null,
        uid_nummer: editForm.kunde_uid.trim() || null,
      }).eq("id", editForm.customer_id);
    } else if (!editForm.customer_id && editForm.kunde_name.trim()) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: newCust } = await supabase.from("customers").insert({
          user_id: user.id,
          name: editForm.kunde_name.trim(),
          anrede: editForm.kunde_anrede || null,
          titel: editForm.kunde_titel.trim() || null,
          adresse: editForm.kunde_adresse.trim() || null,
          plz: editForm.kunde_plz.trim() || null,
          ort: editForm.kunde_ort.trim() || null,
          email: editForm.kunde_email.trim() || null,
          telefon: editForm.kunde_telefon.trim() || null,
          uid_nummer: editForm.kunde_uid.trim() || null,
        }).select("id").single();
        if (newCust) {
          await supabase.from("projects").update({ customer_id: newCust.id }).eq("id", projectId);
        }
      }
    }
    setProjectName(editForm.name.trim());
    setEditSaving(false);
    setEditDialogOpen(false);
    toast({ title: "Projekt aktualisiert" });
  };

  const selectCustomerForEdit = (c: { id: string; name: string; plz: string | null; ort: string | null }) => {
    // Load full customer data
    supabase.from("customers").select("*").eq("id", c.id).single().then(({ data }) => {
      if (data) {
        setEditForm(f => ({
          ...f,
          customer_id: data.id,
          kunde_name: data.name,
          kunde_anrede: (data as any).anrede || "",
          kunde_titel: (data as any).titel || "",
          kunde_adresse: data.adresse || "",
          kunde_plz: data.plz || "",
          kunde_ort: data.ort || "",
          kunde_email: data.email || "",
          kunde_telefon: data.telefon || "",
          kunde_uid: data.uid_nummer || "",
        }));
      }
    });
    setCustomerPopoverOpen(false);
  };

  const fetchProjectName = async () => {
    if (!projectId) return;
    
    const { data } = await supabase
      .from("projects")
      .select("name")
      .eq("id", projectId)
      .single();

    if (data) {
      setProjectName(data.name);
    }
  };

  const fetchLieferscheinCount = async () => {
    if (!projectId) return;
    const { count } = await supabase
      .from("lieferscheine")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId);
    setLieferscheinCount(count || 0);
  };

  const fetchInvoiceCount = async () => {
    if (!projectId) return;
    const { count } = await supabase
      .from("invoices")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId);
    setInvoiceCount(count || 0);
  };

  const fetchFileCounts = async () => {
    if (!projectId) return;

    const bucketMap: Record<string, string> = {
      plans: "project-plans",
      reports: "project-reports",
      photos: "project-photos",
      chef: "project-chef",
    };

    const updatedCategories = await Promise.all(
      categories.map(async (category) => {
        // Skip chef bucket for non-admins
        if (category.type === "chef" && !isAdmin) {
          return { ...category, count: 0 };
        }
        
        const bucket = bucketMap[category.type];
        const { data } = await supabase
          .storage
          .from(bucket)
          .list(projectId);

        return {
          ...category,
          count: data?.length || 0,
        };
      })
    );

    setCategories(updatedCategories);
  };

  const handleQuickPhotoUpload = () => {
    navigate(`/projects/${projectId}/photos`);
  };

  const handleMaterialentnahme = async () => {
    if (!projectId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const today = new Date().toISOString().split("T")[0];
    // Check for existing Lieferschein today
    const { data: existing } = await supabase.from("lieferscheine")
      .select("id").eq("project_id", projectId).eq("datum", today)
      .order("created_at", { ascending: false }).limit(1);
    if (existing?.[0]) {
      navigate(`/material/${existing[0].id}`);
    } else {
      const { data: created, error } = await supabase.from("lieferscheine")
        .insert({ project_id: projectId, user_id: user.id, datum: today })
        .select("id").single();
      if (created) {
        navigate(`/material/${created.id}`);
      } else {
        toast({ variant: "destructive", title: "Fehler", description: error?.message || "Konnte nicht erstellt werden" });
      }
    }
  };

  // Filter categories based on admin status
  const visibleCategories = categories.filter(
    (category) => !category.adminOnly || isAdmin
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/projects")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Zurück</span>
            </Button>
            <img 
              src="/logo-tilger.png"
              alt="Fliesentechnik Tilger"
              className="h-8 sm:h-10 w-auto cursor-pointer hover:opacity-80 transition-opacity object-contain" 
              onClick={() => navigate("/projects")}
            />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 max-w-4xl">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            {editingName ? (
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!editNameValue.trim()) return;
                await supabase.from("projects").update({ name: editNameValue.trim() }).eq("id", projectId);
                setProjectName(editNameValue.trim());
                setEditingName(false);
                toast({ title: "Projektname geändert" });
              }} className="flex items-center gap-2 flex-1">
                <Input
                  value={editNameValue}
                  onChange={(e) => setEditNameValue(e.target.value)}
                  className="text-2xl font-bold h-auto py-1"
                  autoFocus
                />
                <Button type="submit" size="icon" variant="ghost" className="shrink-0"><Check className="h-5 w-5 text-green-600" /></Button>
                <Button type="button" size="icon" variant="ghost" className="shrink-0" onClick={() => setEditingName(false)}>✕</Button>
              </form>
            ) : (
              <>
                <h1 className="text-2xl sm:text-3xl font-bold">{projectName}</h1>
                <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => { setEditNameValue(projectName); setEditingName(true); }}>
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={openEditDialog}>
                  <Settings className="h-3.5 w-3.5" />
                  Bearbeiten
                </Button>
              </>
            )}
          </div>
          <p className="text-muted-foreground">Dokumentation und Dateien</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {visibleCategories.map((category) => (
            <Card 
              key={category.type}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => navigate(`/projects/${projectId}/${category.type}`)}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="text-primary">{category.icon}</div>
                  <div className="text-2xl font-bold">{category.count}</div>
                </div>
                <CardTitle className="text-xl">{category.title}</CardTitle>
                <CardDescription>{category.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full">
                  Öffnen
                </Button>
              </CardContent>
            </Card>
          ))}

          {/* Angebotspositionen — ohne Preise, für alle sichtbar */}
          {angebotPositionen.length > 0 && (
            <Card className="col-span-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Angebotspositionen ({angebotPositionen.length})
                </CardTitle>
                <CardDescription>Positionen aus dem Angebot — ohne Preise</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                {angebotPositionen.map(p => (
                  <div key={p.position} className="flex items-center justify-between gap-2 py-1.5 border-b last:border-0 text-sm">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-xs text-muted-foreground font-mono shrink-0">{String(p.position).padStart(2, "0")}</span>
                      <span className="truncate">{p.beschreibung}</span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{p.menge} {p.einheit}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Materialentnahme — direkter Einstieg */}
          <Card
            className="cursor-pointer hover:shadow-lg transition-shadow border-orange-200"
            onClick={handleMaterialentnahme}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="text-orange-600"><ArrowUp className="h-8 w-8" /></div>
              </div>
              <CardTitle className="text-xl">Materialentnahme</CardTitle>
              <CardDescription>Material entnehmen oder zurückgeben</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full border-orange-300 text-orange-700 hover:bg-orange-50">
                Materialentnahme starten
              </Button>
            </CardContent>
          </Card>

          {/* Lieferscheine */}
          <Card
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate(`/material?project=${projectId}`)}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="text-primary"><Package className="h-8 w-8" /></div>
                <div className="text-2xl font-bold">{lieferscheinCount}</div>
              </div>
              <CardTitle className="text-xl">Lieferscheine</CardTitle>
              <CardDescription>Material-Entnahmen und Rückgaben</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full">
                Öffnen
              </Button>
            </CardContent>
          </Card>

          {/* Angebote & Rechnungen */}
          {isAdmin && (
            <Card
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => navigate(`/invoices?project=${projectId}`)}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="text-primary"><FileText className="h-8 w-8" /></div>
                  <div className="text-2xl font-bold">{invoiceCount}</div>
                </div>
                <CardTitle className="text-xl">Angebote & Rechnungen</CardTitle>
                <CardDescription>Zugeordnete Angebote und Rechnungen</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full">
                  Öffnen
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Floating Action Button für Fotos */}
        <Button 
          className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg"
          size="icon"
          onClick={handleQuickPhotoUpload}
        >
          <ImagePlus className="h-6 w-6" />
        </Button>
      </main>

      {/* Projekt bearbeiten Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Projekt bearbeiten</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Projektname *</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>Beschreibung</Label>
              <Textarea value={editForm.beschreibung} onChange={(e) => setEditForm(f => ({ ...f, beschreibung: e.target.value }))} rows={2} />
            </div>

            {/* Kunde */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-semibold">Kunde</Label>
                {editForm.customer_id && <span className="text-xs text-green-600 font-medium">Verknüpft</span>}
              </div>
              <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start gap-2 mb-3">
                    <Pencil className="w-4 h-4" />
                    {editForm.kunde_name || "Kunde auswählen..."}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[350px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Kunde suchen..." />
                    <CommandList>
                      <CommandEmpty>Kein Kunde gefunden</CommandEmpty>
                      <CommandGroup>
                        {customers.map(c => (
                          <CommandItem key={c.id} value={c.name} onSelect={() => selectCustomerForEdit(c)}>
                            <div>
                              <p className="font-medium text-sm">{c.name}</p>
                              {c.ort && <p className="text-xs text-muted-foreground">{c.plz} {c.ort}</p>}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {editForm.customer_id && (
                <button className="text-xs text-muted-foreground underline mb-3" onClick={() => setEditForm(f => ({ ...f, customer_id: null, kunde_name: "", kunde_anrede: "", kunde_titel: "", kunde_adresse: "", kunde_plz: "", kunde_ort: "", kunde_email: "", kunde_telefon: "", kunde_uid: "" }))}>
                  Verknüpfung lösen
                </button>
              )}
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Anrede</Label>
                    <Select value={editForm.kunde_anrede || "none"} onValueChange={(v) => setEditForm(f => ({ ...f, kunde_anrede: v === "none" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        <SelectItem value="Herr">Herr</SelectItem>
                        <SelectItem value="Frau">Frau</SelectItem>
                        <SelectItem value="Firma">Firma</SelectItem>
                        <SelectItem value="Familie">Familie</SelectItem>
                        <SelectItem value="Divers">Divers</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Titel</Label>
                    <Input value={editForm.kunde_titel} onChange={(e) => setEditForm(f => ({ ...f, kunde_titel: e.target.value }))} placeholder="Mag., Dr." />
                  </div>
                  <div>
                    <Label>Firma / Name</Label>
                    <Input value={editForm.kunde_name} onChange={(e) => setEditForm(f => ({ ...f, kunde_name: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>Adresse</Label>
                  <Input value={editForm.kunde_adresse} onChange={(e) => setEditForm(f => ({ ...f, kunde_adresse: e.target.value }))} placeholder="Straße + Hausnr." />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label>PLZ</Label>
                    <Input value={editForm.kunde_plz} onChange={(e) => setEditForm(f => ({ ...f, kunde_plz: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <Label>Ort</Label>
                    <Input value={editForm.kunde_ort} onChange={(e) => setEditForm(f => ({ ...f, kunde_ort: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>E-Mail</Label>
                    <Input value={editForm.kunde_email} onChange={(e) => setEditForm(f => ({ ...f, kunde_email: e.target.value }))} type="email" />
                  </div>
                  <div>
                    <Label>Telefon</Label>
                    <Input value={editForm.kunde_telefon} onChange={(e) => setEditForm(f => ({ ...f, kunde_telefon: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>UID-Nummer</Label>
                  <Input value={editForm.kunde_uid} onChange={(e) => setEditForm(f => ({ ...f, kunde_uid: e.target.value }))} placeholder="ATU..." />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleEditSave} disabled={editSaving || !editForm.name.trim()}>
              {editSaving ? "Speichert..." : "Speichern"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProjectOverview;
