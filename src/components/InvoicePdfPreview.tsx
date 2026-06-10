import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, X, Save, Printer, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  generateEpcQrCode,
  DEFAULT_BANK,
  type InvoiceHtmlData,
  type InvoiceHtmlItem,
  type BankData,
} from "@/lib/invoiceHtml";

// Logo as base64 for jsPDF (loaded once)
let cachedLogoDataUri: string | null = null;

async function getLogoDataUri(): Promise<string | undefined> {
  if (cachedLogoDataUri) return cachedLogoDataUri;
  try {
    const response = await fetch("/logo-tilger.png");
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        cachedLogoDataUri = reader.result as string;
        resolve(cachedLogoDataUri!);
      };
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

interface InvoicePdfPreviewProps {
  open: boolean;
  onClose: () => void;
  onSave?: () => Promise<void> | void;
  onSaveDraft?: () => Promise<void> | void;
  onSavedClose?: () => void;
  saving?: boolean;
  saved?: boolean;
  invoiceId?: string;
  formData?: InvoiceHtmlData;
  items?: InvoiceHtmlItem[];
  fileName?: string;
  saveLabel?: string;
}

export function InvoicePdfPreview({
  open,
  onClose,
  onSave,
  onSaveDraft,
  onSavedClose,
  saving,
  saved,
  invoiceId,
  formData,
  items,
  fileName,
  saveLabel,
}: InvoicePdfPreviewProps) {
  const [generating, setGenerating] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Mobile detection: iframe PDF preview unzuverlässig auf Mobile (zeigt nur Platzhalter)
  const isMobile = typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const formDataRef = useRef(formData);
  const itemsRef = useRef(items);
  formDataRef.current = formData;
  itemsRef.current = items;

  useEffect(() => {
    return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); };
  }, [pdfUrl]);

  useEffect(() => {
    if (!open) {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
      setError(null);
      return;
    }
    generatePdf();
  }, [open, invoiceId]);

  useEffect(() => {
    if (open && saved) generatePdf();
  }, [saved, formData?.nummer]);

  const generatePdf = async () => {
    setGenerating(true);
    setError(null);
    try {
      // Load bank data + firmen UID
      let bankData: BankData = { ...DEFAULT_BANK };
      let loadedFirmenUid = "";
      try {
        const { data: bankSettings } = await supabase
          .from("app_settings").select("key, value").in("key", ["bank_kontoinhaber", "bank_iban", "bank_bic", "firmen_uid"]);
        if (bankSettings) {
          bankSettings.forEach((row: any) => {
            if (row.key === "bank_kontoinhaber") bankData.kontoinhaber = row.value;
            if (row.key === "bank_iban") bankData.iban = row.value;
            if (row.key === "bank_bic") bankData.bic = row.value;
            if (row.key === "firmen_uid") loadedFirmenUid = row.value;
          });
        }
      } catch {}

      if (!formDataRef.current || !itemsRef.current) {
        setGenerating(false);
        return;
      }

      const logoUri = await getLogoDataUri();

      // QR code for invoices
      let qrDataUri: string | undefined;
      if (formDataRef.current.typ === "rechnung" && formDataRef.current.brutto_summe > 0) {
        try {
          qrDataUri = await generateEpcQrCode(
            formDataRef.current.brutto_summe,
            formDataRef.current.nummer || "Rechnung",
            bankData
          );
        } catch {}
      }

      // Dynamischer Import — hält jsPDF aus dem Haupt-Bundle raus
      const { generateInvoicePdf } = await import("@/lib/pdfGenerator");
      const blob = await generateInvoicePdf(
        formDataRef.current,
        itemsRef.current,
        bankData,
        logoUri,
        qrDataUri,
        loadedFirmenUid
      );

      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(URL.createObjectURL(blob));
    } catch (err: any) {
      console.error("PDF error:", err);
      setError(`PDF-Fehler: ${err?.message || "Unbekannt"}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!pdfUrl) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = `${fileName || "Dokument"}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePrint = () => {
    if (!pdfUrl) return;
    const win = window.open(pdfUrl);
    if (win) {
      win.addEventListener("load", () => setTimeout(() => win.print(), 300));
    }
  };

  const mustSaveFirst = onSave && !saved;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) { saved && onSavedClose ? onSavedClose() : onClose(); } }}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0">
        <DialogTitle className="sr-only">Dokumentvorschau</DialogTitle>

        <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
          <div className="flex gap-2 flex-wrap items-center">
            {mustSaveFirst && (
              <>
                {onSaveDraft && (
                  <Button size="sm" variant="outline" onClick={onSaveDraft} disabled={saving} className="gap-2">
                    <Save className="h-4 w-4" />
                    Entwurf speichern
                  </Button>
                )}
                <Button size="sm" onClick={onSave} disabled={saving} className="gap-2 bg-green-600 hover:bg-green-700">
                  <Save className="h-4 w-4" />
                  {saving ? "Speichert..." : (saveLabel || "Speichern")}
                </Button>
              </>
            )}
            {!mustSaveFirst && (
              <>
                <Button size="sm" onClick={handleDownload} disabled={!pdfUrl} className="gap-2">
                  <Download className="h-4 w-4" />
                  PDF herunterladen
                </Button>
                <Button variant="outline" size="sm" onClick={handlePrint} disabled={!pdfUrl} className="gap-2">
                  <Printer className="h-4 w-4" />
                  Drucken
                </Button>
              </>
            )}
          </div>
          <div>
            {saved && onSavedClose ? (
              <Button variant="outline" size="sm" onClick={onSavedClose}>
                <X className="h-4 w-4 mr-2" /> Zurück zur Übersicht
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={onClose}>
                <X className="h-4 w-4 mr-2" /> Schließen
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-hidden bg-gray-300">
          {generating ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">PDF wird erstellt...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-sm text-destructive mb-2">{error}</p>
                <Button variant="outline" size="sm" onClick={generatePdf}>Nochmal versuchen</Button>
              </div>
            </div>
          ) : pdfUrl ? (
            isMobile ? (
              <div className="flex items-center justify-center h-full p-6">
                <div className="text-center max-w-sm">
                  <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center">
                    <span className="text-red-600 font-bold text-lg">PDF</span>
                  </div>
                  <p className="font-medium mb-1">{fileName || "Dokument"}</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Auf Mobile wird das PDF in einem neuen Tab geöffnet.
                  </p>
                  <Button onClick={() => window.open(pdfUrl, "_blank")} className="gap-2 w-full">
                    <Download className="h-4 w-4" />
                    PDF öffnen
                  </Button>
                  <Button variant="outline" onClick={handleDownload} className="gap-2 w-full mt-2">
                    <Download className="h-4 w-4" />
                    PDF herunterladen
                  </Button>
                </div>
              </div>
            ) : (
              <iframe src={pdfUrl} className="w-full h-full border-0" title="PDF Preview" />
            )
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
