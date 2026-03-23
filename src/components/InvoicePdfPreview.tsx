import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, X, Save, Printer, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  buildInvoiceHtml,
  generateEpcQrCode,
  type InvoiceHtmlData,
  type InvoiceHtmlItem,
} from "@/lib/invoiceHtml";
import jsPDF from "jspdf";

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

function addFooterToAllPages(pdf: jsPDF) {
  const totalPages = pdf.internal.getNumberOfPages();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    const footerY = pageHeight - 20;

    // Red line
    pdf.setDrawColor(204, 0, 0);
    pdf.setLineWidth(0.3);
    pdf.line(15, footerY, pageWidth - 15, footerY);

    // Footer text
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    pdf.setTextColor(136, 136, 136);

    pdf.text(
      "Gottfried Tilger \u00B7 Fliesentechnik & Natursteinteppich \u00B7 Bahnhofstr. 174 \u00B7 8831 Niederwölz \u00B7 Tel: +43 664 44 35 346 \u00B7 info@ft-tilger.at",
      pageWidth / 2, footerY + 5, { align: "center" }
    );
    pdf.text(
      "Bankverbindung: IBAN AT61 2081 5000 0423 1474 \u00B7 BIC STSPAT2GXXX",
      pageWidth / 2, footerY + 9, { align: "center" }
    );
    pdf.text(`Seite ${i} von ${totalPages}`, pageWidth - 15, footerY + 13, { align: "right" });
  }
}

async function createPdf(html: string): Promise<Blob> {
  const html2canvas = (await import("html2canvas")).default;

  // Strip footer from HTML (we add it via jsPDF)
  const cleanHtml = html.replace(/<div class="footer">[\s\S]*?<\/div>/, "");

  const container = document.createElement("div");
  const bodyMatch = cleanHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  container.innerHTML = bodyMatch ? bodyMatch[1] : cleanHtml;

  const styleMatch = cleanHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  if (styleMatch) {
    const style = document.createElement("style");
    style.textContent = styleMatch[1];
    container.prepend(style);
  }

  // Render container at A4 width minus margins (180mm ≈ 680px at 96dpi)
  container.style.width = "680px";
  container.style.padding = "0";
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.background = "white";
  document.body.appendChild(container);

  await new Promise(r => setTimeout(r, 300));

  const canvas = await html2canvas(container, {
    scale: 2,
    useCORS: true,
    letterRendering: true,
    scrollY: 0,
    windowWidth: 680,
  });

  document.body.removeChild(container);

  // Create PDF from canvas
  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const marginLeft = 15;
  const marginTop = 12;
  const marginBottom = 26; // Space for footer (3 lines + spacing)
  const marginRight = 15;
  const contentWidth = pageWidth - marginLeft - marginRight;
  const contentHeight = pageHeight - marginTop - marginBottom;

  // Calculate image dimensions
  const imgWidth = contentWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  const imgData = canvas.toDataURL("image/jpeg", 0.95);

  // If content fits on one page
  if (imgHeight <= contentHeight) {
    pdf.addImage(imgData, "JPEG", marginLeft, marginTop, imgWidth, imgHeight);
  } else {
    // Multi-page: slice the canvas
    const totalContentPx = canvas.height;
    const pxPerMm = canvas.width / contentWidth;
    const contentHeightPx = contentHeight * pxPerMm;

    let yOffset = 0;
    let pageNum = 0;

    while (yOffset < totalContentPx) {
      if (pageNum > 0) pdf.addPage();

      const sliceHeight = Math.min(contentHeightPx, totalContentPx - yOffset);

      // Create slice canvas
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceHeight;
      const ctx = sliceCanvas.getContext("2d")!;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(canvas, 0, -yOffset);

      const sliceData = sliceCanvas.toDataURL("image/jpeg", 0.95);
      const sliceImgHeight = (sliceHeight / pxPerMm);

      pdf.addImage(sliceData, "JPEG", marginLeft, marginTop, imgWidth, sliceImgHeight);

      yOffset += contentHeightPx;
      pageNum++;
    }
  }

  // Add table header on pages 2+ and footer on every page
  addFooterToAllPages(pdf);

  // Add table column headers on continuation pages
  const totalPagesNow = pdf.internal.getNumberOfPages();
  if (totalPagesNow > 1) {
    const cols = [
      { text: "POS.", x: marginLeft, w: 12, align: "center" as const },
      { text: "MENGE", x: marginLeft + 12, w: 16, align: "right" as const },
      { text: "EINH.", x: marginLeft + 28, w: 14, align: "center" as const },
      { text: "BESCHREIBUNG", x: marginLeft + 42, w: 70, align: "left" as const },
      { text: "PREIS", x: marginLeft + 112, w: 25, align: "right" as const },
      { text: "GESAMT", x: marginLeft + 137, w: 28, align: "right" as const },
    ];
    for (let p = 2; p <= totalPagesNow; p++) {
      pdf.setPage(p);
      pdf.setFontSize(6);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(100, 100, 100);
      const headerY = marginTop - 2;
      // Line under header
      pdf.setDrawColor(60, 60, 60);
      pdf.setLineWidth(0.4);
      pdf.line(marginLeft, headerY + 1, pageWidth - marginRight, headerY + 1);
      cols.forEach(col => {
        const textX = col.align === "right" ? col.x + col.w : col.align === "center" ? col.x + col.w / 2 : col.x;
        pdf.text(col.text, textX, headerY, { align: col.align });
      });
    }
  }

  return pdf.output("blob");
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
      let html: string;

      if (formDataRef.current && itemsRef.current) {
        // Generate QR code for invoices (not offers)
        let qrDataUri: string | undefined;
        if (formDataRef.current.typ === "rechnung" && formDataRef.current.brutto_summe > 0) {
          try {
            qrDataUri = await generateEpcQrCode(
              formDataRef.current.brutto_summe,
              formDataRef.current.nummer || "Rechnung"
            );
          } catch (e) {
            console.warn("QR code generation failed:", e);
          }
        }
        html = buildInvoiceHtml(formDataRef.current, itemsRef.current, qrDataUri);
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

      const blob = await createPdf(html);
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
