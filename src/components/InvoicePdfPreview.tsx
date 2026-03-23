import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, X, Save, Printer, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  buildInvoiceHtml,
  type InvoiceHtmlData,
  type InvoiceHtmlItem,
} from "@/lib/invoiceHtml";

interface InvoicePdfPreviewProps {
  open: boolean;
  onClose: () => void;
  onSave?: () => Promise<void> | void;
  onSavedClose?: () => void;
  saving?: boolean;
  saved?: boolean;
  invoiceId?: string;
  formData?: InvoiceHtmlData;
  items?: InvoiceHtmlItem[];
  fileName?: string;
}

async function createPdfBlob(html: string, margins: number[]): Promise<Blob> {
  const html2pdf = (await import("html2pdf.js")).default;
  const container = document.createElement("div");
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  container.innerHTML = bodyMatch ? bodyMatch[1] : html;

  const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  if (styleMatch) {
    const style = document.createElement("style");
    style.textContent = styleMatch[1];
    container.prepend(style);
  }
  container.style.width = "210mm";
  container.style.position = "fixed";
  container.style.top = "0";
  container.style.left = "0";
  container.style.zIndex = "-9999";
  container.style.opacity = "0";
  document.body.appendChild(container);

  await new Promise(r => setTimeout(r, 300));

  const blob: Blob = await html2pdf().set({
    margin: margins,
    image: { type: "jpeg", quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true, scrollY: 0 },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["avoid-all", "css", "legacy"] },
  }).from(container).toPdf().output("blob");

  document.body.removeChild(container);
  return blob;
}

export function InvoicePdfPreview({
  open,
  onClose,
  onSave,
  onSavedClose,
  saving,
  saved,
  invoiceId,
  formData,
  items,
  fileName,
}: InvoicePdfPreviewProps) {
  const [generating, setGenerating] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const formDataRef = useRef(formData);
  const itemsRef = useRef(items);
  formDataRef.current = formData;
  itemsRef.current = items;

  // Clean up blob URL
  useEffect(() => {
    return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); };
  }, [pdfUrl]);

  // Generate PDF immediately when dialog opens
  useEffect(() => {
    if (!open) {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
      setError(null);
      return;
    }

    const generate = async () => {
      setGenerating(true);
      setError(null);
      try {
        let html: string;

        if (formDataRef.current && itemsRef.current) {
          html = buildInvoiceHtml(formDataRef.current, itemsRef.current);
        } else if (invoiceId) {
          const { data, error: fetchErr } = await supabase.functions.invoke(
            "generate-invoice-pdf", { body: { invoiceId } }
          );
          if (fetchErr) throw fetchErr;
          html = decodeURIComponent(escape(atob(data.pdf)));
        } else {
          setGenerating(false);
          return;
        }

        const blob = await createPdfBlob(html, [15, 15, 28, 15]);
        if (pdfUrl) URL.revokeObjectURL(pdfUrl);
        setPdfUrl(URL.createObjectURL(blob));
      } catch (err: any) {
        console.error("PDF generation error:", err);
        setError("PDF konnte nicht erstellt werden. Bitte erneut versuchen.");
      } finally {
        setGenerating(false);
      }
    };

    generate();
  }, [open, invoiceId]);

  // Regenerate PDF after save (nummer gets updated)
  useEffect(() => {
    if (!open || !saved || !formDataRef.current || !itemsRef.current) return;

    const regenerate = async () => {
      setGenerating(true);
      try {
        const html = buildInvoiceHtml(formDataRef.current!, itemsRef.current!);
        const blob = await createPdfBlob(html, [15, 15, 28, 15]);
        if (pdfUrl) URL.revokeObjectURL(pdfUrl);
        setPdfUrl(URL.createObjectURL(blob));
      } catch (err) {
        console.error("PDF regeneration error:", err);
      } finally {
        setGenerating(false);
      }
    };

    regenerate();
  }, [saved, formData?.nummer]);

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
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0">
        <DialogTitle className="sr-only">Dokumentvorschau</DialogTitle>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
          <div className="flex gap-2 flex-wrap items-center">
            {mustSaveFirst && (
              <>
                <Button size="sm" onClick={onSave} disabled={saving} className="gap-2 bg-green-600 hover:bg-green-700">
                  <Save className="h-4 w-4" />
                  {saving ? "Speichert..." : "Speichern"}
                </Button>
                <span className="text-sm text-muted-foreground">
                  Zuerst speichern, dann herunterladen
                </span>
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
                <X className="h-4 w-4 mr-2" />
                Zurück zur Übersicht
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={onClose}>
                <X className="h-4 w-4 mr-2" />
                Schließen
              </Button>
            )}
          </div>
        </div>

        {/* PDF Preview */}
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
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : pdfUrl ? (
            <iframe
              src={pdfUrl}
              className="w-full h-full border-0"
              title="PDF Preview"
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
