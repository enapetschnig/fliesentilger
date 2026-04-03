import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Upload, FileText, Trash2, Eye, Download, FolderOpen, MoveRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { FileViewer } from "@/components/FileViewer";

type DocumentType = "plans" | "reports" | "photos" | "chef";

type StorageFile = {
  name: string;
  id: string;
  created_at: string;
  metadata: any;
};

const bucketMap: Record<DocumentType, string> = {
  plans: "project-plans",
  reports: "project-reports",
  photos: "project-photos",
  chef: "project-chef",
};

const titleMap: Record<DocumentType, string> = {
  plans: "Pläne",
  reports: "Regieberichte",
  photos: "Fotos",
  chef: "🔒 Chefordner",
};

const PHOTO_SUBFOLDERS = [
  { key: "allgemein", label: "Allgemeine Fotos" },
  { key: "rechnungen", label: "Rechnungen" },
  { key: "lieferscheine", label: "Lieferscheine" },
];

const ProjectDetail = () => {
  const { projectId, type } = useParams<{ projectId: string; type: DocumentType }>();
  const { toast } = useToast();
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [viewerState, setViewerState] = useState<{
    open: boolean;
    fileName: string;
    filePath: string;
  }>({ open: false, fileName: "", filePath: "" });

  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [urlsLoading, setUrlsLoading] = useState(false);

  // Photo subfolders
  const isPhotos = type === "photos";
  const [activeSubfolder, setActiveSubfolder] = useState("allgemein");
  const [uploadSubfolder, setUploadSubfolder] = useState("allgemein");
  const [movingFile, setMovingFile] = useState<StorageFile | null>(null);
  const [subfolderCounts, setSubfolderCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (projectId && type) {
      checkAdminStatus();
      fetchProjectName();
      fetchFiles();
      if (isPhotos) fetchSubfolderCounts();
    }
  }, [projectId, type]);

  useEffect(() => {
    if (isPhotos && projectId) {
      fetchFiles();
    }
  }, [activeSubfolder]);

  useEffect(() => {
    if (files.length > 0 && projectId && type) {
      generateSignedUrls();
    }
  }, [files]);

  const getStoragePath = (subfolder?: string) => {
    if (isPhotos && subfolder) return `${projectId}/${subfolder}`;
    if (isPhotos) return `${projectId}/${activeSubfolder}`;
    return projectId!;
  };

  const generateSignedUrls = async () => {
    if (!projectId || !type) return;
    const bucket = bucketMap[type];
    const isPublic = bucket === "project-photos";
    setUrlsLoading(true);
    const urls: Record<string, string> = {};
    const basePath = getStoragePath();
    for (const file of files) {
      const filePath = `${basePath}/${file.name}`;
      if (isPublic) {
        const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
        urls[file.name] = data.publicUrl;
      } else {
        const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filePath, 3600);
        if (!error && data) urls[file.name] = data.signedUrl;
      }
    }
    setSignedUrls(urls);
    setUrlsLoading(false);
  };

  const checkAdminStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).single();
    setIsAdmin(data?.role === "administrator");
  };

  const fetchProjectName = async () => {
    if (!projectId) return;
    const { data } = await supabase.from("projects").select("name").eq("id", projectId).single();
    if (data) setProjectName(data.name);
  };

  const fetchFiles = async () => {
    if (!projectId || !type) return;
    const bucket = bucketMap[type];
    const path = getStoragePath();
    const { data, error } = await supabase.storage.from(bucket).list(path, {
      sortBy: { column: "created_at", order: "desc" },
    });
    if (!error && data) {
      // Filter out subfolder placeholders (empty folders show as .emptyFolderPlaceholder)
      setFiles(data.filter(f => f.name !== ".emptyFolderPlaceholder"));
    }
    setLoading(false);
  };

  const fetchSubfolderCounts = async () => {
    if (!projectId) return;
    const bucket = bucketMap["photos"];
    const counts: Record<string, number> = {};
    for (const sf of PHOTO_SUBFOLDERS) {
      const { data } = await supabase.storage.from(bucket).list(`${projectId}/${sf.key}`);
      counts[sf.key] = (data || []).filter(f => f.name !== ".emptyFolderPlaceholder").length;
    }
    // Also count root-level files (legacy, not in subfolder)
    const { data: rootData } = await supabase.storage.from(bucket).list(projectId!);
    const rootFiles = (rootData || []).filter(f => !PHOTO_SUBFOLDERS.some(sf => sf.key === f.name) && f.name !== ".emptyFolderPlaceholder" && !f.id?.startsWith("folder"));
    if (rootFiles.length > 0) counts["_root"] = rootFiles.length;
    setSubfolderCounts(counts);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !projectId || !type) return;
    setUploading(true);
    const bucket = bucketMap[type];
    const uploadFiles = Array.from(e.target.files);

    for (const file of uploadFiles) {
      const subfolder = isPhotos ? uploadSubfolder : "";
      const basePath = isPhotos ? `${projectId}/${subfolder}` : projectId;
      const filePath = `${basePath}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from(bucket).upload(filePath, file);
      if (error) {
        toast({ variant: "destructive", title: "Fehler", description: `${file.name}: ${error.message}` });
      }
    }

    toast({ title: "Hochgeladen", description: `${uploadFiles.length} Datei(en)` });
    fetchFiles();
    if (isPhotos) fetchSubfolderCounts();
    setUploading(false);
    e.target.value = "";
  };

  const handleDelete = async (file: StorageFile) => {
    if (!projectId || !type || !confirm("Datei wirklich löschen?")) return;
    const bucket = bucketMap[type];
    const filePath = `${getStoragePath()}/${file.name}`;
    const { error } = await supabase.storage.from(bucket).remove([filePath]);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: "Datei konnte nicht gelöscht werden" });
    } else {
      toast({ title: "Gelöscht" });
      fetchFiles();
      if (isPhotos) fetchSubfolderCounts();
    }
  };

  const handleMove = async (file: StorageFile, targetSubfolder: string) => {
    if (!projectId) return;
    const bucket = bucketMap["photos"];
    const fromPath = `${getStoragePath()}/${file.name}`;
    const toPath = `${projectId}/${targetSubfolder}/${file.name}`;

    const { error } = await supabase.storage.from(bucket).move(fromPath, toPath);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
    } else {
      toast({ title: "Verschoben", description: `→ ${PHOTO_SUBFOLDERS.find(s => s.key === targetSubfolder)?.label}` });
      setMovingFile(null);
      fetchFiles();
      fetchSubfolderCounts();
    }
  };

  const handleFileOpen = (file: StorageFile) => {
    const filePath = `${getStoragePath()}/${file.name}`;
    setViewerState({ open: true, fileName: file.name, filePath });
  };

  if (!type) return <div>Ungültiger Dokumenttyp</div>;
  if (loading) return <div className="min-h-screen flex items-center justify-center"><p>Lädt...</p></div>;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title={`${projectName} - ${titleMap[type]}`} backPath={`/projects/${projectId}`} />

      <main className="container mx-auto px-4 py-6 max-w-5xl">
        <Card>
          <CardHeader>
            <CardTitle>{titleMap[type]}</CardTitle>
            <CardDescription>
              {isPhotos
                ? `${Object.values(subfolderCounts).reduce((s, c) => s + c, 0)} Dateien gesamt`
                : `${files.length} ${files.length === 1 ? "Datei" : "Dateien"}`}
            </CardDescription>
          </CardHeader>

          <CardContent className="p-6">
            {/* Photo subfolder tabs */}
            {isPhotos && (
              <div className="flex gap-2 flex-wrap mb-4">
                {PHOTO_SUBFOLDERS.map(sf => (
                  <Button
                    key={sf.key}
                    variant={activeSubfolder === sf.key ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5"
                    onClick={() => { setActiveSubfolder(sf.key); setLoading(true); }}
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    {sf.label}
                    {(subfolderCounts[sf.key] || 0) > 0 && (
                      <Badge variant="secondary" className="ml-1 text-xs h-5 px-1.5">{subfolderCounts[sf.key]}</Badge>
                    )}
                  </Button>
                ))}
              </div>
            )}

            {/* Upload section */}
            {isAdmin && (
              <div className="mb-6">
                {isPhotos && (
                  <div className="mb-3">
                    <Select value={uploadSubfolder} onValueChange={setUploadSubfolder}>
                      <SelectTrigger className="w-[250px]">
                        <SelectValue placeholder="Hochladen in..." />
                      </SelectTrigger>
                      <SelectContent>
                        {PHOTO_SUBFOLDERS.map(sf => (
                          <SelectItem key={sf.key} value={sf.key}>{sf.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <label htmlFor="file-upload" className="cursor-pointer">
                  <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                    <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-base font-medium mb-1">
                      {uploading ? "Lädt hoch..." : "Datei auswählen"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {isPhotos ? `Hochladen in: ${PHOTO_SUBFOLDERS.find(s => s.key === uploadSubfolder)?.label}` : "Klicken zum Auswählen"}
                    </p>
                  </div>
                </label>
                <Input
                  id="file-upload"
                  type="file"
                  onChange={handleUpload}
                  disabled={uploading}
                  multiple
                  className="hidden"
                  accept={type === "photos" ? "image/*" : "*"}
                />
              </div>
            )}

            {files.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-semibold mb-2">Keine Dateien</p>
                <p className="text-sm text-muted-foreground">
                  {isPhotos ? `Keine Dateien in "${PHOTO_SUBFOLDERS.find(s => s.key === activeSubfolder)?.label}"` : "Lade die erste Datei hoch"}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-3 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    {urlsLoading ? (
                      <div className="w-12 h-12 sm:w-16 sm:h-16 bg-muted animate-pulse rounded shrink-0" />
                    ) : signedUrls[file.name] && file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                      <img
                        src={signedUrls[file.name]}
                        alt={file.name}
                        className="w-12 h-12 sm:w-16 sm:h-16 object-cover rounded shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <FileText className="w-12 h-12 sm:w-16 sm:h-16 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{file.name.replace(/^\d+_/, "")}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(file.created_at).toLocaleDateString("de-DE")}
                      </p>
                    </div>

                    <div className="flex gap-1 ml-2 items-center">
                      <Button variant="outline" size="sm" onClick={() => handleFileOpen(file)}>
                        <Eye className="w-4 h-4 sm:mr-2" />
                        <span className="hidden sm:inline">Ansehen</span>
                      </Button>
                      {isPhotos && isAdmin && (
                        movingFile?.id === file.id ? (
                          <div className="flex gap-1 items-center">
                            {PHOTO_SUBFOLDERS.filter(sf => sf.key !== activeSubfolder).map(sf => (
                              <Button key={sf.key} variant="outline" size="sm" className="text-xs" onClick={() => handleMove(file, sf.key)}>
                                → {sf.label}
                              </Button>
                            ))}
                            <Button variant="ghost" size="sm" onClick={() => setMovingFile(null)}>✕</Button>
                          </div>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => setMovingFile(file)} title="Verschieben">
                            <MoveRight className="w-4 h-4" />
                          </Button>
                        )
                      )}
                      {isAdmin && (
                        <Button variant="destructive" size="sm" onClick={() => handleDelete(file)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <FileViewer
        open={viewerState.open}
        onClose={() => setViewerState({ open: false, fileName: "", filePath: "" })}
        fileName={viewerState.fileName}
        filePath={viewerState.filePath}
        bucketName={bucketMap[type]}
      />
    </div>
  );
};

export default ProjectDetail;
