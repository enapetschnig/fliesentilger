import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, UserPlus, Building } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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

interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (project: { id: string; name: string }) => void;
  defaultName?: string;
  defaultCustomerId?: string | null;
  defaultCustomerName?: string;
  defaultAdresse?: string;
  defaultPlz?: string;
  defaultOrt?: string;
}

export function CreateProjectDialog({
  open,
  onClose,
  onCreated,
  defaultName = "",
  defaultCustomerId = null,
  defaultCustomerName = "",
  defaultAdresse = "",
  defaultPlz = "",
  defaultOrt = "",
}: CreateProjectDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [customerTab, setCustomerTab] = useState<"existing" | "new">("existing");

  const [projectName, setProjectName] = useState(defaultName);
  const [beschreibung, setBeschreibung] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(defaultCustomerId);
  const [customerName, setCustomerName] = useState(defaultCustomerName);
  const [adresse, setAdresse] = useState(defaultAdresse);
  const [plz, setPlz] = useState(defaultPlz);
  const [ort, setOrt] = useState(defaultOrt);
  const [land, setLand] = useState("Österreich");
  const [email, setEmail] = useState("");
  const [telefon, setTelefon] = useState("");
  const [uidNummer, setUidNummer] = useState("");

  useEffect(() => {
    if (open) {
      setProjectName(defaultName);
      setSelectedCustomerId(defaultCustomerId);
      setCustomerName(defaultCustomerName);
      setAdresse(defaultAdresse);
      setPlz(defaultPlz);
      setOrt(defaultOrt);
      supabase.from("customers").select("id, name, ansprechpartner, uid_nummer, adresse, plz, ort, land, email, telefon").order("name")
        .then(({ data }) => { if (data) setCustomers(data); });
    }
  }, [open]);

  const selectCustomer = (c: CustomerOption) => {
    setSelectedCustomerId(c.id);
    setCustomerName(c.name);
    setAdresse(c.adresse || "");
    setPlz(c.plz || "");
    setOrt(c.ort || "");
    setLand(c.land || "Österreich");
    setEmail(c.email || "");
    setTelefon(c.telefon || "");
    setUidNummer(c.uid_nummer || "");
    setCustomerPopoverOpen(false);
    if (!projectName) setProjectName(c.name);
  };

  const handleSave = async () => {
    if (!projectName.trim()) {
      toast({ variant: "destructive", title: "Projektname erforderlich" });
      return;
    }

    setSaving(true);
    try {
      let customerId = selectedCustomerId;

      // Create new customer if no existing selected
      if (!customerId && customerName.trim()) {
        const { data: newCustomer, error: custErr } = await supabase
          .from("customers")
          .insert({
            name: customerName.trim(),
            adresse: adresse.trim() || null,
            plz: plz.trim() || null,
            ort: ort.trim() || null,
            land: land.trim() || null,
            email: email.trim() || null,
            telefon: telefon.trim() || null,
            uid_nummer: uidNummer.trim() || null,
          })
          .select("id")
          .single();
        if (custErr) throw custErr;
        customerId = newCustomer.id;
      }

      const { data: newProject, error } = await supabase
        .from("projects")
        .insert({
          name: projectName.trim(),
          beschreibung: beschreibung.trim() || null,
          adresse: [adresse, plz, ort].filter(Boolean).join(", ") || null,
          plz: plz.trim() || null,
          customer_id: customerId,
          status: "aktiv",
        })
        .select("id, name")
        .single();

      if (error) throw error;
      toast({ title: "Projekt erstellt", description: `"${newProject.name}" wurde angelegt.` });
      onCreated(newProject);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Fehler", description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building className="w-5 h-5" />
            Neues Projekt erstellen
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Projektname */}
          <div>
            <Label>Projektname *</Label>
            <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="z.B. Badezimmer Sanierung Müller" />
          </div>
          <div>
            <Label>Beschreibung</Label>
            <Textarea value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} placeholder="Kurze Projektbeschreibung..." rows={2} />
          </div>

          {/* Kunde */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <Label className="text-base font-semibold">Kunde</Label>
              {selectedCustomerId && (
                <span className="text-xs text-green-600 font-medium">Kunde ausgewählt</span>
              )}
            </div>

            <Tabs value={customerTab} onValueChange={(v) => setCustomerTab(v as any)}>
              <TabsList className="w-full mb-3">
                <TabsTrigger value="existing" className="flex-1 gap-1">
                  <Search className="w-3.5 h-3.5" />
                  Bestehender Kunde
                </TabsTrigger>
                <TabsTrigger value="new" className="flex-1 gap-1">
                  <UserPlus className="w-3.5 h-3.5" />
                  Neuer Kunde
                </TabsTrigger>
              </TabsList>

              <TabsContent value="existing">
                <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start gap-2">
                      <Search className="w-4 h-4" />
                      {customerName || "Kunde suchen..."}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[350px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Kunde suchen..." />
                      <CommandList>
                        <CommandEmpty>Kein Kunde gefunden</CommandEmpty>
                        <CommandGroup>
                          {customers.map((c) => (
                            <CommandItem key={c.id} value={c.name} onSelect={() => selectCustomer(c)}>
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
              </TabsContent>

              <TabsContent value="new" className="space-y-3">
                <div>
                  <Label>Kundenname *</Label>
                  <Input value={customerName} onChange={(e) => { setCustomerName(e.target.value); setSelectedCustomerId(null); }} placeholder="Firma / Name" />
                </div>
              </TabsContent>
            </Tabs>

            {/* Adresse (always visible) */}
            <div className="space-y-3 mt-3">
              <div>
                <Label>Adresse</Label>
                <Input value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="Straße + Hausnr." />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label>PLZ</Label>
                  <Input value={plz} onChange={(e) => setPlz(e.target.value)} placeholder="8831" />
                </div>
                <div className="col-span-2">
                  <Label>Ort</Label>
                  <Input value={ort} onChange={(e) => setOrt(e.target.value)} placeholder="Niederwölz" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>E-Mail</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="kunde@email.at" type="email" />
                </div>
                <div>
                  <Label>Telefon</Label>
                  <Input value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder="+43 ..." />
                </div>
              </div>
              <div>
                <Label>UID-Nummer</Label>
                <Input value={uidNummer} onChange={(e) => setUidNummer(e.target.value)} placeholder="ATU..." />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleSave} disabled={saving || !projectName.trim()}>
            {saving ? "Erstellt..." : "Projekt erstellen"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
