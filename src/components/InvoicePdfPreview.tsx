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

async function createPdfWithHeaderFooter(
  html: string,
  docLabel: string
): Promise<Blob> {
  const html2pdf = (await import("html2pdf.js")).default;

  // Strip footer from HTML (we'll add it via jsPDF on every page)
  const htmlWithoutFooter = html.replace(
    /<div class="footer">[\s\S]*?<\/div>\s*<\/div><!-- \/page-wrap -->/,
    '</div><!-- /page-wrap -->'
  );

  const container = document.createElement("div");
  const bodyMatch = htmlWithoutFooter.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  container.innerHTML = bodyMatch ? bodyMatch[1] : htmlWithoutFooter;

  const styleMatch = htmlWithoutFooter.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  if (styleMatch) {
    const style = document.createElement("style");
    style.textContent = styleMatch[1];
    container.prepend(style);
  }
  container.style.width = "180mm";
  container.style.position = "fixed";
  container.style.top = "0";
  container.style.left = "0";
  container.style.zIndex = "-9999";
  container.style.opacity = "0";
  document.body.appendChild(container);

  await new Promise(r => setTimeout(r, 400));

  // Generate PDF with margins for header/footer space
  const worker = html2pdf().set({
    margin: [12, 15, 22, 15], // top, left, bottom, right in mm
    image: { type: "jpeg", quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true, scrollY: 0 },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["avoid-all", "css", "legacy"] },
  });

  const pdfDoc = await worker.from(container).toPdf().get("pdf");

  document.body.removeChild(container);

  // Add header and footer on every page via jsPDF
  const totalPages = pdfDoc.internal.getNumberOfPages();
  const pageWidth = pdfDoc.internal.pageSize.getWidth();
  const pageHeight = pdfDoc.internal.pageSize.getHeight();

  for (let i = 1; i <= totalPages; i++) {
    pdfDoc.setPage(i);

    // --- Footer on every page ---
    const footerY = pageHeight - 14;

    // Red line
    pdfDoc.setDrawColor(204, 0, 0);
    pdfDoc.setLineWidth(0.3);
    pdfDoc.line(15, footerY, pageWidth - 15, footerY);

    // Footer text
    pdfDoc.setFont("helvetica", "normal");
    pdfDoc.setFontSize(6.5);
    pdfDoc.setTextColor(136, 136, 136);

    const footerLine1 = "Gottfried Tilger \u00B7 Fliesentechnik & Natursteinteppich \u00B7 Bahnhofstr. 174 \u00B7 8831 Niederwölz \u00B7 Tel: +43 664 44 35 346 \u00B7 info@ft-tilger.at";
    const footerLine2 = "Bankverbindung: IBAN AT61 2081 5000 0423 1474 \u00B7 BIC STSPAT2GXXX";

    pdfDoc.text(footerLine1, pageWidth / 2, footerY + 4, { align: "center" });
    pdfDoc.text(footerLine2, pageWidth / 2, footerY + 8, { align: "center" });

    // Page number
    pdfDoc.text(`Seite ${i} von ${totalPages}`, pageWidth - 15, footerY + 8, { align: "right" });
  }

  const blob = pdfDoc.output("blob");
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
    generatePdf();
  }, [open, invoiceId]);

  // Regenerate after save (nummer updates)
  useEffect(() => {
    if (open && saved) generatePdf();
  }, [saved, formData?.nummer]);

  const generatePdf = async () => {
    setGenerating(true);
    setError(null);
    try {
      let html: string;
      let docLabel = "";

      if (formDataRef.current && itemsRef.current) {
        html = buildInvoiceHtml(formDataRef.current, itemsRef.current);
        docLabel = `${formDataRef.current.typ === "angebot" ? "Angebot" : "Rechnung"} ${formDataRef.current.nummer || ""}`.trim();
      } else if (invoiceId) {
        const { data, error: fetchErr } = await supabase.functions.invoke(
          "generate-invoice-pdf", { body: { invoiceId } }
        );
        if (fetchErr) throw fetchErr;
        html = decodeURIComponent(escape(atob(data.pdf)));
        docLabel = "Dokument";
      } else {
        setGenerating(false);
        return;
      }

      const blob = await createPdfWithHeaderFooter(html, docLabel);
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(URL.createObjectURL(blob));
    } catch (err: any) {
      console.error("PDF generation error:", err);
      setError("PDF konnte nicht erstellt werden.");
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
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0">
        <DialogTitle className="sr-only">Dokumentvorschau</DialogTitle>

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
