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

  // Re-generate HTML when saved changes (nummer gets updated after save)
  useEffect(() => {
    if (open && saved && formDataRef.current && itemsRef.current) {
      const html = buildInvoiceHtml(formDataRef.current, itemsRef.current);
      setHtmlContent(html);
    }
  }, [open, saved, formData?.nummer]);

  const handlePrint = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.print();
    }
  };

  const handleDownloadPdf = () => {
    if (!htmlContent) return;
    // Open in new window for "Save as PDF" via print dialog
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(htmlContent);
      win.document.close();
      // Trigger print dialog where user can choose "Save as PDF"
      setTimeout(() => win.print(), 500);
    }
  };

  const mustSaveFirst = onSave && !saved;

  // Inject page-simulation CSS for screen preview
  const previewHtml = htmlContent ? htmlContent.replace(
    "</style>",
    `
    /* Screen: simulate A4 pages with visible page breaks */
    @media screen {
      html, body {
        background: #e5e7eb !important;
      }
      .page-wrap {
        background: white;
        box-shadow: 0 2px 16px rgba(0,0,0,0.12);
        margin: 24px auto;
        min-height: 297mm;
        max-width: 210mm;
      }
      .footer {
        position: relative !important;
        bottom: auto !important;
        margin-top: 40px;
      }
    }
    </style>`
  ) : null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0">
        <DialogTitle className="sr-only">Dokumentvorschau</DialogTitle>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
          <div className="flex gap-2 flex-wrap">
            {/* Step 1: Save button (required before download/print) */}
            {mustSaveFirst && (
              <Button size="sm" onClick={onSave} disabled={saving} className="gap-2 bg-green-600 hover:bg-green-700">
                <Save className="h-4 w-4" />
                {saving ? "Speichert..." : "Speichern"}
              </Button>
            )}

            {/* Step 2: Download + Print (only after saving) */}
            {!mustSaveFirst ? (
              <>
                <Button size="sm" onClick={handleDownloadPdf} disabled={!htmlContent} className="gap-2">
                  <Download className="h-4 w-4" />
                  PDF herunterladen
                </Button>
                <Button variant="outline" size="sm" onClick={handlePrint} disabled={!htmlContent} className="gap-2">
                  <Printer className="h-4 w-4" />
                  Drucken
                </Button>
              </>
            ) : (
              <span className="text-sm text-muted-foreground self-center">
                Zuerst speichern, dann PDF herunterladen
              </span>
            )}
          </div>

          {/* Close / Back button */}
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

        {/* Preview */}
        <div className="flex-1 overflow-hidden bg-gray-200">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : previewHtml ? (
            <iframe
              ref={iframeRef}
              srcDoc={previewHtml}
              className="w-full h-full border-0"
              title="Invoice Preview"
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
