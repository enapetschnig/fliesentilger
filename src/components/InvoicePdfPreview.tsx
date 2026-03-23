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
  const [loading, setLoading] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const formDataRef = useRef(formData);
  const itemsRef = useRef(items);
  formDataRef.current = formData;
  itemsRef.current = items;

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [pdfBlobUrl]);

  // Generate HTML when dialog opens
  useEffect(() => {
    if (!open) {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(null);
      setHtmlContent(null);
      return;
    }

    if (formDataRef.current && itemsRef.current) {
      const html = buildInvoiceHtml(formDataRef.current, itemsRef.current);
      setHtmlContent(html);
      return;
    }

    if (invoiceId) {
      setLoading(true);
      supabase.functions.invoke("generate-invoice-pdf", { body: { invoiceId } })
        .then(({ data, error }) => {
          if (error) throw error;
          const decoded = decodeURIComponent(escape(atob(data.pdf)));
          setHtmlContent(decoded);
        })
        .catch(err => console.error("Error:", err))
        .finally(() => setLoading(false));
    }
  }, [open, invoiceId]);

  // Re-generate HTML after save (nummer updates)
  useEffect(() => {
    if (open && saved && formDataRef.current && itemsRef.current) {
      const html = buildInvoiceHtml(formDataRef.current, itemsRef.current);
      setHtmlContent(html);
      // Also regenerate PDF
      generatePdf(html);
    }
  }, [open, saved, formData?.nummer]);

  const generatePdf = async (html?: string) => {
    const sourceHtml = html || htmlContent;
    if (!sourceHtml) return;

    setGeneratingPdf(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;

      // Create container with full HTML content
      const container = document.createElement("div");
      const bodyMatch = sourceHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      container.innerHTML = bodyMatch ? bodyMatch[1] : sourceHtml;

      // Apply styles
      const styleMatch = sourceHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
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

      // Wait for images to load
      await new Promise(r => setTimeout(r, 200));

      const worker = html2pdf().set({
        margin: [15, 15, 28, 15], // top, left, bottom, right in mm
        filename: `${fileName || "Dokument"}.pdf`,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true, scrollY: 0 },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] },
      }).from(container);

      // Get blob for preview
      const pdfBlob = await worker.toPdf().output("blob");

      document.body.removeChild(container);

      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
      const url = URL.createObjectURL(pdfBlob);
      setPdfBlobUrl(url);
    } catch (err) {
      console.error("PDF generation error:", err);
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleGeneratePdf = () => generatePdf();

  const handleDownload = () => {
    if (!pdfBlobUrl) return;
    const a = document.createElement("a");
    a.href = pdfBlobUrl;
    a.download = `${fileName || "Dokument"}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePrint = () => {
    if (!pdfBlobUrl) return;
    const printWindow = window.open(pdfBlobUrl);
    if (printWindow) {
      printWindow.addEventListener("load", () => {
        setTimeout(() => printWindow.print(), 300);
      });
    }
  };

  const mustSaveFirst = onSave && !saved;
  const hasPdf = !!pdfBlobUrl;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0">
        <DialogTitle className="sr-only">Dokumentvorschau</DialogTitle>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
          <div className="flex gap-2 flex-wrap items-center">
            {/* Step 1: Save */}
            {mustSaveFirst && (
              <Button size="sm" onClick={onSave} disabled={saving} className="gap-2 bg-green-600 hover:bg-green-700">
                <Save className="h-4 w-4" />
                {saving ? "Speichert..." : "Speichern"}
              </Button>
            )}

            {mustSaveFirst && (
              <span className="text-sm text-muted-foreground">
                Zuerst speichern, dann PDF erstellen
              </span>
            )}

            {/* Step 2: Generate PDF */}
            {!mustSaveFirst && !hasPdf && (
              <Button size="sm" onClick={handleGeneratePdf} disabled={generatingPdf || !htmlContent} className="gap-2">
                {generatingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {generatingPdf ? "PDF wird erstellt..." : "PDF erstellen"}
              </Button>
            )}

            {/* Step 3: Download + Print */}
            {hasPdf && (
              <>
                <Button size="sm" onClick={handleDownload} className="gap-2">
                  <Download className="h-4 w-4" />
                  PDF herunterladen
                </Button>
                <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
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

        {/* Preview area */}
        <div className="flex-1 overflow-hidden bg-gray-200">
          {loading || generatingPdf ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {generatingPdf ? "PDF wird erstellt..." : "Lädt..."}
                </p>
              </div>
            </div>
          ) : hasPdf ? (
            /* Show real PDF with page breaks visible */
            <iframe
              src={pdfBlobUrl!}
              className="w-full h-full border-0"
              title="PDF Preview"
            />
          ) : htmlContent ? (
            /* Show HTML preview before PDF is generated */
            <iframe
              srcDoc={htmlContent.replace(
                "</style>",
                `@media screen {
                  html, body { background: #e5e7eb !important; }
                  .page-wrap { background: white; box-shadow: 0 2px 16px rgba(0,0,0,0.12); margin: 24px auto; min-height: 297mm; max-width: 210mm; }
                  .footer { position: relative !important; bottom: auto !important; margin-top: 40px; }
                }
                </style>`
              )}
              className="w-full h-full border-0"
              title="HTML Preview"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Keine Vorschau verfügbar
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
