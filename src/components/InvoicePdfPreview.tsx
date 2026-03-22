import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, X, Save } from "lucide-react";
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
  // Either pass invoiceId to load from DB, or pass formData + items for client-side preview
  invoiceId?: string;
  formData?: InvoiceHtmlData;
  items?: InvoiceHtmlItem[];
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
}: InvoicePdfPreviewProps) {
  const [loading, setLoading] = useState(false);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Store refs to avoid dependency issues with inline objects
  const formDataRef = useRef(formData);
  const itemsRef = useRef(items);
  formDataRef.current = formData;
  itemsRef.current = items;

  useEffect(() => {
    if (!open) {
      setHtmlContent(null);
      return;
    }

    // Client-side preview from form data (works before saving)
    if (formDataRef.current && itemsRef.current) {
      const html = buildInvoiceHtml(formDataRef.current, itemsRef.current);
      setHtmlContent(html);
      return;
    }

    // Server-side preview from saved invoice
    if (invoiceId) {
      const fetchPdf = async () => {
        setLoading(true);
        try {
          const { data, error } = await supabase.functions.invoke(
            "generate-invoice-pdf",
            {
              body: { invoiceId },
            }
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
    iframeRef.current?.contentWindow?.print();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0">
        <DialogTitle className="sr-only">Dokumentvorschau</DialogTitle>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex gap-2">
            {onSave && (
              <Button size="sm" onClick={onSave} disabled={saving} className="gap-2 bg-green-600 hover:bg-green-700">
                <Save className="h-4 w-4" />
                {saving ? "Speichert..." : "Speichern"}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handlePrint} disabled={!saved && !!onSave}>
              <Download className="h-4 w-4 mr-2" />
              {!saved && onSave ? "Zuerst speichern" : "PDF / Drucken"}
            </Button>
            <Button variant="outline" size="sm" onClick={onClose}>
              <X className="h-4 w-4 mr-2" />
              Schliessen
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
