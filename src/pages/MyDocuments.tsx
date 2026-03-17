import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FileText, Upload, Eye, Trash2, Calendar, Clock } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { FileViewer } from "@/components/FileViewer";

interface Document {
  name: string;
  path: string;
  created_at?: string;
}

interface GroupedDocs {
  label: string;
  sortKey: string;
  docs: Document[];
}

const monthNames = [
  "Jänner", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function parseDocDate(doc: Document): Date {
  // Try to extract date from created_at or filename
  if (doc.created_at) return new Date(doc.created_at);
  // Filename might start with timestamp: 1234567890_name.pdf
  const match = doc.name.match(/^(\d{13})_/);
  if (match) return new Date(parseInt(match[1]));
  return new Date();
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("de-AT", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function cleanFileName(name: string): string {
  // Remove leading timestamp prefix (e.g. "1234567890_")
  return name.replace(/^\d{13}_/, "");
}

function groupByMonth(docs: Document[]): GroupedDocs[] {
  const groups = new Map<string, Document[]>();

  for (const doc of docs) {
    const date = parseDocDate(doc);
    const key = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, "0")}`;
    const label = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(doc);
  }

  return Array.from(groups.entries())
    .map(([sortKey, docs]) => {
      const date = parseDocDate(docs[0]);
      return {
        label: `${monthNames[date.getMonth()]} ${date.getFullYear()}`,
        sortKey,
        docs: docs.sort((a, b) => parseDocDate(b).getTime() - parseDocDate(a).getTime()),
      };
    })
    .sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}

export default function MyDocuments() {
  const [payslips, setPayslips] = useState<Document[]>([]);
  const [sickNotes, setSickNotes] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string>("");
  const [viewingFile, setViewingFile] = useState<{ name: string; path: string; bucketName: string } | null>(null);

  useEffect(() => {
    fetchUserAndDocuments();
  }, []);

  const fetchUserAndDocuments = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ variant: "destructive", title: "Fehler", description: "Sie müssen angemeldet sein" });
      return;
    }
    setUserId(user.id);
    await Promise.all([
      fetchDocuments(user.id, "lohnzettel", setPayslips),
      fetchDocuments(user.id, "krankmeldung", setSickNotes),
    ]);
    setLoading(false);
  };

  const fetchDocuments = async (
    userId: string,
    type: "lohnzettel" | "krankmeldung",
    setter: (docs: Document[]) => void
  ) => {
    const { data, error } = await supabase.storage
      .from("employee-documents")
      .list(`${userId}/${type}`, { sortBy: { column: "created_at", order: "desc" } });

    if (error) {
      console.error(`Fehler beim Laden von ${type}:`, error);
      return;
    }

    if (data) {
      const docs = data
        .filter(file => file.name !== ".emptyFolderPlaceholder")
        .map((file) => ({
          name: file.name,
          path: `${userId}/${type}/${file.name}`,
          created_at: file.created_at,
        }));
      setter(docs);
    }
  };

  const handleUpload = async (type: "lohnzettel" | "krankmeldung", file: File | null) => {
    if (!file || !userId) return;
    if (file.size > 50 * 1024 * 1024) {
      toast({ variant: "destructive", title: "Fehler", description: "Datei ist zu groß (max. 50 MB)" });
      return;
    }
    setUploading(true);
    const filePath = `${userId}/${type}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from("employee-documents").upload(filePath, file);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: `Upload fehlgeschlagen: ${error.message}` });
    } else {
      toast({ title: "Erfolg", description: "Dokument hochgeladen" });
      await fetchDocuments(userId, type, type === "lohnzettel" ? setPayslips : setSickNotes);
    }
    setUploading(false);
  };

  const handleView = (doc: Document) => {
    setViewingFile({ name: doc.name, path: doc.path, bucketName: "employee-documents" });
  };

  const handleDelete = async (doc: Document, type: "lohnzettel" | "krankmeldung") => {
    if (!confirm(`Möchten Sie "${cleanFileName(doc.name)}" wirklich löschen?`)) return;
    const { error } = await supabase.storage.from("employee-documents").remove([doc.path]);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Löschen fehlgeschlagen" });
    } else {
      toast({ title: "Erfolg", description: "Dokument gelöscht" });
      await fetchDocuments(userId, type, type === "lohnzettel" ? setPayslips : setSickNotes);
    }
  };

  const payslipGroups = groupByMonth(payslips);
  const sickNoteGroups = groupByMonth(sickNotes);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><p>Lädt...</p></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Meine Dokumente" />

      <div className="container mx-auto p-4 max-w-4xl">
        <Tabs defaultValue="payslips" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="payslips" className="gap-2">
              <FileText className="w-4 h-4" />
              Lohnzettel
              {payslips.length > 0 && (
                <Badge variant="secondary" className="ml-1">{payslips.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="sicknotes" className="gap-2">
              <FileText className="w-4 h-4" />
              Krankmeldungen
              {sickNotes.length > 0 && (
                <Badge variant="secondary" className="ml-1">{sickNotes.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* === LOHNZETTEL === */}
          <TabsContent value="payslips" className="space-y-4">
            {payslipGroups.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-semibold mb-1">Keine Lohnzettel</p>
                  <p className="text-sm text-muted-foreground">
                    Lohnzettel werden vom Administrator hochgeladen
                  </p>
                </CardContent>
              </Card>
            ) : (
              payslipGroups.map((group) => (
                <Card key={group.sortKey}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      {group.label}
                    </CardTitle>
                    <CardDescription>
                      {group.docs.length} {group.docs.length === 1 ? "Dokument" : "Dokumente"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {group.docs.map((doc) => {
                        const date = parseDocDate(doc);
                        return (
                          <div
                            key={doc.path}
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                <FileText className="w-5 h-5 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{cleanFileName(doc.name)}</p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  Hochgeladen am {formatDate(date)} um {formatTime(date)}
                                </p>
                              </div>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => handleView(doc)}>
                              <Eye className="w-4 h-4 mr-1" />
                              <span className="hidden sm:inline">Ansehen</span>
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* === KRANKMELDUNGEN === */}
          <TabsContent value="sicknotes" className="space-y-4">
            {/* Upload */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Krankmeldung hochladen
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Label htmlFor="sicknote-upload">Datei auswählen (PDF, JPG, PNG)</Label>
                  <Input
                    id="sicknote-upload"
                    type="file"
                    onChange={(e) => handleUpload("krankmeldung", e.target.files?.[0] || null)}
                    disabled={uploading}
                    accept=".pdf,.jpg,.jpeg,.png"
                  />
                  {uploading && <p className="text-sm text-muted-foreground">Lädt hoch...</p>}
                </div>
              </CardContent>
            </Card>

            {/* Übersicht */}
            {sickNoteGroups.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-semibold mb-1">Keine Krankmeldungen</p>
                  <p className="text-sm text-muted-foreground">
                    Hier erscheinen deine hochgeladenen Krankmeldungen
                  </p>
                </CardContent>
              </Card>
            ) : (
              sickNoteGroups.map((group) => (
                <Card key={group.sortKey}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      {group.label}
                    </CardTitle>
                    <CardDescription>
                      {group.docs.length} {group.docs.length === 1 ? "Krankmeldung" : "Krankmeldungen"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {group.docs.map((doc) => {
                        const date = parseDocDate(doc);
                        return (
                          <div
                            key={doc.path}
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                                <FileText className="w-5 h-5 text-amber-700" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{cleanFileName(doc.name)}</p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  Hochgeladen am {formatDate(date)} um {formatTime(date)}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                              <Button size="sm" variant="outline" onClick={() => handleView(doc)}>
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleDelete(doc, "krankmeldung")}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      {viewingFile && (
        <FileViewer
          open={true}
          onClose={() => setViewingFile(null)}
          fileName={viewingFile.name}
          filePath={viewingFile.path}
          bucketName={viewingFile.bucketName}
        />
      )}
    </div>
  );
}
