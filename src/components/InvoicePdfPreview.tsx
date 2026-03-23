import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, X, Save, Printer, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  buildInvoiceHtml,
  generateEpcQrCode,
  DEFAULT_BANK,
  type InvoiceHtmlData,
  type InvoiceHtmlItem,
  type BankData,
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

function addFooterToAllPages(pdf: jsPDF, bank: BankData = DEFAULT_BANK) {
  const totalPages = pdf.internal.getNumberOfPages();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    // Footer starts 15mm from bottom, so everything fits
    const footerLineY = pageHeight - 15;

    // Red line
    pdf.setDrawColor(204, 0, 0);
    pdf.setLineWidth(0.3);
    pdf.line(15, footerLineY, pageWidth - 15, footerLineY);

    // Footer text
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6);
    pdf.setTextColor(136, 136, 136);

    pdf.text(
      "Gottfried Tilger \u00B7 Fliesentechnik & Natursteinteppich \u00B7 Bahnhofstr. 174 \u00B7 8831 Niederwölz \u00B7 Tel: +43 664 44 35 346 \u00B7 info@ft-tilger.at",
      pageWidth / 2, footerLineY + 4, { align: "center" }
    );
    pdf.text(
      `IBAN: ${bank.iban} \u00B7 BIC: ${bank.bic}`,
      pageWidth / 2, footerLineY + 7.5, { align: "center" }
    );
    pdf.text(`Seite ${i} von ${totalPages}`, pageWidth - 15, footerLineY + 7.5, { align: "right" });
  }
}

async function createPdf(html: string, bank: BankData = DEFAULT_BANK): Promise<Blob> {
  const html2pdf = (await import("html2pdf.js")).default;

  // Keep footer in HTML (it flows naturally at the end)
  const cleanHtml = html;

  const container = document.createElement("div");
  const bodyMatch = cleanHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  container.innerHTML = bodyMatch ? bodyMatch[1] : cleanHtml;

  const styleMatch = cleanHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  if (styleMatch) {
    const style = document.createElement("style");
    // Add page-break rules for proper splitting
    style.textContent = styleMatch[1] + `
      .totals-section { page-break-inside: avoid !important; break-inside: avoid !important; margin-top: 8px; }
      .bank-info { page-break-inside: avoid !important; break-inside: avoid !important; }
      .closing-text { page-break-inside: avoid !important; break-inside: avoid !important; }
      table.items tbody tr { page-break-inside: avoid !important; }
    `;
    container.prepend(style);
  }

  container.style.width = "180mm";
  container.style.background = "white";
  document.body.appendChild(container);

  // Wait for images to load
  const images = container.querySelectorAll("img");
  await Promise.all(Array.from(images).map(img =>
    img.complete ? Promise.resolve() : new Promise(resolve => { img.onload = resolve; img.onerror = resolve; })
  ));
  await new Promise(r => setTimeout(r, 500));

  // Use html2pdf.js — save() returns a promise, output('blob') for blob
  const worker = html2pdf().set({
    margin: [12, 15, 18, 15],
    image: { type: "jpeg", quality: 0.95 },
    html2canvas: { scale: 2, useCORS: true, allowTaint: true },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["avoid-all", "css"], avoid: [".totals-section", ".bank-info", ".closing-text", "tr"] },
  }).from(container);

  // Get the blob
  const pdfBlob: Blob = await worker.toPdf().output("blob");

  document.body.removeChild(container);
  return pdfBlob;
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

      // Load bank data from settings
      let bankData: BankData = { ...DEFAULT_BANK };
      try {
        const { data: bankSettings } = await supabase
          .from("app_settings")
          .select("key, value")
          .in("key", ["bank_kontoinhaber", "bank_iban", "bank_bic"]);
        if (bankSettings) {
          bankSettings.forEach((row: any) => {
            if (row.key === "bank_kontoinhaber") bankData.kontoinhaber = row.value;
            if (row.key === "bank_iban") bankData.iban = row.value;
            if (row.key === "bank_bic") bankData.bic = row.value;
          });
        }
      } catch (e) { /* use defaults */ }

      if (formDataRef.current && itemsRef.current) {
        // Generate QR code for invoices (not offers)
        let qrDataUri: string | undefined;
        if (formDataRef.current.typ === "rechnung" && formDataRef.current.brutto_summe > 0) {
          try {
            qrDataUri = await generateEpcQrCode(
              formDataRef.current.brutto_summe,
              formDataRef.current.nummer || "Rechnung",
              bankData
            );
          } catch (e) {
            console.warn("QR code generation failed:", e);
          }
        }
        html = buildInvoiceHtml(formDataRef.current, itemsRef.current, qrDataUri, bankData);
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

      const blob = await createPdf(html, bankData);
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(URL.createObjectURL(blob));
    } catch (err: any) {
      console.error("PDF generation error:", err);
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
