import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, X, Save, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import {
  buildInvoiceHtml,
  type InvoiceHtmlData,
  type InvoiceHtmlItem,
} from "@/lib/invoiceHtml";

interface InvoicePdfPreviewProps {
  open: boolean;
  onClose: () => void;
  onSave?: () => Promise<void> | void;
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
  saving,
  saved,
  invoiceId,
  formData,
  items,
  fileName,
}: InvoicePdfPreviewProps) {
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const formDataRef = useRef(formData);
  const itemsRef = useRef(items);
  formDataRef.current = formData;
  itemsRef.current = items;

  useEffect(() => {
    if (!open) {
      setHtmlContent(null);
      return;
    }

    if (formDataRef.current && itemsRef.current) {
      const html = buildInvoiceHtml(formDataRef.current, itemsRef.current);
      setHtmlContent(html);
      return;
    }

    if (invoiceId) {
      const fetchPdf = async () => {
        setLoading(true);
        try {
          const { data, error } = await supabase.functions.invoke(
            "generate-invoice-pdf",
            { body: { invoiceId } }
          );
          if (error) throw error;
          const decoded = decodeURIComponent(escape(atob(data.pdf)));
          setHtmlContent(decoded);
        } catch (err) {
          console.error("Error generating PDF preview:", err);
        } finally {
          setLoading(false);
        }
      };
      fetchPdf();
    }
  }, [open, invoiceId]);

  const handlePrint = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.print();
    }
  };

  const handleDownloadPdf = async () => {
    if (!htmlContent) return;
    setDownloading(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      // Create a temporary container with the HTML content
      const container = document.createElement("div");
      container.innerHTML = htmlContent;
      // Extract the body content
      const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      if (bodyMatch) {
        container.innerHTML = bodyMatch[1];
      }
      // Apply styles from the HTML
      const styleMatch = htmlContent.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
      if (styleMatch) {
        const style = document.createElement("style");
        style.textContent = styleMatch[1];
        container.prepend(style);
      }
      container.style.width = "210mm";
      document.body.appendChild(container);

      const pdfFileName = fileName || "Dokument";
      await html2pdf().set({
        margin: 0,
        filename: `${pdfFileName}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      }).from(container).save();

      document.body.removeChild(container);
    } catch (err) {
      console.error("PDF download error:", err);
      // Fallback: open in new window for manual save
      const win = window.open("", "_blank");
      if (win) {
        win.document.write(htmlContent);
        win.document.close();
      }
    } finally {
      setDownloading(false);
    }
  };

  const canDownload = saved || !onSave;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0">
        <DialogTitle className="sr-only">Dokumentvorschau</DialogTitle>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex gap-2">
            {onSave && !saved && (
              <Button size="sm" onClick={onSave} disabled={saving} className="gap-2 bg-green-600 hover:bg-green-700">
                <Save className="h-4 w-4" />
                {saving ? "Speichert..." : "Speichern"}
              </Button>
            )}
            {canDownload ? (
              <>
                <Button size="sm" onClick={handleDownloadPdf} disabled={!htmlContent || downloading} className="gap-2">
                  <Download className="h-4 w-4" />
                  {downloading ? "Wird erstellt..." : "PDF herunterladen"}
                </Button>
                <Button variant="outline" size="sm" onClick={handlePrint} disabled={!htmlContent}>
                  <Printer className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" disabled className="gap-2">
                <Download className="h-4 w-4" />
                Zuerst speichern
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onClose}>
              <X className="h-4 w-4 mr-2" />
              Schließen
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : htmlContent ? (
            <iframe
              ref={iframeRef}
              srcDoc={htmlContent}
              className="w-full h-full border-0"
              title="Invoice Preview"
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
