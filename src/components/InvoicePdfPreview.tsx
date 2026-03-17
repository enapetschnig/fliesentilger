import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface InvoicePdfPreviewProps {
  open: boolean;
  onClose: () => void;
  invoiceId: string;
}

export function InvoicePdfPreview({ open, onClose, invoiceId }: InvoicePdfPreviewProps) {
  const [loading, setLoading] = useState(false);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!open) {
      setHtmlContent(null);
      return;
    }

    const fetchPdf = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("generate-invoice-pdf", {
          body: { invoiceId },
        });

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
  }, [open, invoiceId]);

  const handlePrint = () => {
    iframeRef.current?.contentWindow?.print();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Download className="h-4 w-4 mr-2" />
              PDF speichern / Drucken
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
