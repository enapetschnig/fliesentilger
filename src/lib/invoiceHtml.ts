// Shared HTML generator for invoice/offer PDF preview
// Used both client-side (preview) and matches edge function output

import QRCode from "qrcode";

// Generate EPC QR-Code (GiroCode) for SEPA bank transfer
export async function generateEpcQrCode(
  betrag: number,
  rechnungsnummer: string,
  bank?: BankData
): Promise<string> {
  const b = bank || DEFAULT_BANK;
  const ibanClean = b.iban.replace(/\s/g, ""); // IBAN ohne Leerzeichen

  const epcData = [
    "BCD",                    // Service Tag
    "002",                    // Version
    "1",                      // Encoding (UTF-8)
    "SCT",                    // SEPA Credit Transfer
    b.bic,                    // BIC
    b.kontoinhaber,           // Empfänger
    ibanClean,                // IBAN (ohne Leerzeichen)
    `EUR${betrag.toFixed(2)}`, // Betrag
    "",                       // Purpose
    "",                       // Structured Reference
    rechnungsnummer,          // Unstructured Reference (Rechnungsnr.)
    "",                       // Information
  ].join("\n");

  return await QRCode.toDataURL(epcData, { width: 150, margin: 1 });
}

export interface BankData {
  kontoinhaber: string;
  iban: string;
  bic: string;
}

export const DEFAULT_BANK: BankData = {
  kontoinhaber: "Gottfried Tilger",
  iban: "AT61 2081 5000 0423 1474",
  bic: "STSPAT2GXXX",
};

export interface InvoiceHtmlData {
  typ: string;
  nummer: string;
  status: string;
  kunde_name: string;
  kunde_adresse?: string | null;
  kunde_plz?: string | null;
  kunde_ort?: string | null;
  kunde_land?: string | null;
  kunde_email?: string | null;
  kunde_telefon?: string | null;
  kunde_uid?: string | null;
  datum: string;
  faellig_am?: string | null;
  leistungsdatum?: string | null;
  gueltig_bis?: string | null;
  zahlungsbedingungen?: string | null;
  notizen?: string | null;
  netto_summe: number;
  mwst_satz: number;
  mwst_betrag: number;
  brutto_summe: number;
  bezahlt_betrag?: number;
  rabatt_prozent?: number;
  rabatt_betrag?: number;
  mahnstufe?: number;
}

export interface InvoiceHtmlItem {
  position: number;
  beschreibung: string;
  menge: number;
  einheit: string;
  einzelpreis: number;
  gesamtpreis: number;
}

function fmt(val: number): string {
  return val.toFixed(2).replace(".", ",");
}

function fmtCurrency(val: number): string {
  return `€ ${fmt(val)}`;
}

const LOGO_IMG = `<img src="data:image/jpeg;base64,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" style="height:64px;width:auto;" alt="Tilger Logo"/>`;

export function buildInvoiceHtml(
  invoice: InvoiceHtmlData,
  items: InvoiceHtmlItem[],
  qrCodeDataUri?: string,
  bank?: BankData
): string {
  const b = bank || DEFAULT_BANK;
  const isAngebot = invoice.typ === "angebot";
  const typLabel = isAngebot ? "Angebot" : "Rechnung";
  const accent = "#CC0000";

  const datumFormatted = new Date(invoice.datum).toLocaleDateString("de-AT");
  const faelligFormatted = invoice.faellig_am
    ? new Date(invoice.faellig_am).toLocaleDateString("de-AT")
    : null;
  const leistungFormatted = invoice.leistungsdatum
    ? new Date(invoice.leistungsdatum).toLocaleDateString("de-AT")
    : null;
  const gueltigBisFormatted = invoice.gueltig_bis
    ? new Date(invoice.gueltig_bis).toLocaleDateString("de-AT")
    : null;

  const bezahltBetrag = Number(invoice.bezahlt_betrag) || 0;
  const rabattProzent = Number(invoice.rabatt_prozent) || 0;
  const rabattBetrag = Number(invoice.rabatt_betrag) || 0;
  const positionenNetto = (items || []).reduce(
    (sum, it) => sum + Number(it.gesamtpreis),
    0
  );
  const rabattWert =
    rabattProzent > 0
      ? positionenNetto * (rabattProzent / 100)
      : rabattBetrag;
  const hasRabatt = rabattWert > 0;
  const restBetrag = Number(invoice.brutto_summe) - bezahltBetrag;
  const showPaymentInfo = !isAngebot && bezahltBetrag > 0;
  const mahnstufe = Number(invoice.mahnstufe) || 0;

  const itemRows = (items || [])
    .map(
      (item, idx) => `
    <tr style="background:${idx % 2 === 0 ? "#fff" : "#fafafa"};">
      <td style="padding:9px 12px;border-bottom:1px solid #e8e8e8;color:#888;text-align:center;font-size:9pt;">${item.position}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e8e8e8;color:#1a1a1a;font-size:9.5pt;white-space:pre-wrap;">${item.beschreibung}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e8e8e8;text-align:right;color:#444;font-size:9pt;">${fmt(Number(item.menge))}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e8e8e8;text-align:center;color:#444;font-size:9pt;">${item.einheit || "Stk."}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e8e8e8;text-align:right;color:#444;font-size:9pt;">${fmtCurrency(Number(item.einzelpreis))}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e8e8e8;text-align:right;font-weight:600;color:#1a1a1a;font-size:9.5pt;">${fmtCurrency(Number(item.gesamtpreis))}</td>
    </tr>`
    )
    .join("");

  let totalsHtml = "";
  if (hasRabatt) {
    totalsHtml += `<tr><td style="padding:5px 0;color:#666;font-size:9.5pt;">Zwischensumme</td><td style="padding:5px 0;text-align:right;color:#333;font-size:9.5pt;">${fmtCurrency(positionenNetto)}</td></tr>`;
    totalsHtml += `<tr><td style="padding:5px 0;color:#CC0000;font-size:9.5pt;">Rabatt${rabattProzent > 0 ? ` (${rabattProzent}%)` : ""}</td><td style="padding:5px 0;text-align:right;color:#CC0000;font-size:9.5pt;">- ${fmtCurrency(rabattWert)}</td></tr>`;
  }
  totalsHtml += `<tr><td style="padding:5px 0;color:#666;font-size:9.5pt;">Nettobetrag</td><td style="padding:5px 0;text-align:right;color:#333;font-size:9.5pt;">${fmtCurrency(Number(invoice.netto_summe))}</td></tr>`;
  totalsHtml += `<tr><td style="padding:5px 0;color:#666;font-size:9.5pt;">USt. ${Number(invoice.mwst_satz).toFixed(0)}%</td><td style="padding:5px 0;text-align:right;color:#333;font-size:9.5pt;">${fmtCurrency(Number(invoice.mwst_betrag))}</td></tr>`;
  totalsHtml += `<tr><td colspan="2" style="padding:0;"><div style="border-top:2px solid ${accent};margin:6px 0;"></div></td></tr>`;
  totalsHtml += `<tr><td style="padding:6px 0;font-size:14pt;font-weight:800;color:#1a1a1a;">Gesamtbetrag</td><td style="padding:6px 0;text-align:right;font-size:14pt;font-weight:800;color:#1a1a1a;">${fmtCurrency(Number(invoice.brutto_summe))}</td></tr>`;
  if (showPaymentInfo) {
    totalsHtml += `<tr><td style="padding:4px 0;color:#16a34a;font-size:9pt;">Bereits bezahlt</td><td style="padding:4px 0;text-align:right;color:#16a34a;font-size:9pt;">${fmtCurrency(bezahltBetrag)}</td></tr>`;
    totalsHtml += `<tr><td style="padding:4px 0;font-weight:700;color:#CC0000;font-size:10pt;">Offener Betrag</td><td style="padding:4px 0;text-align:right;font-weight:700;color:#CC0000;font-size:10pt;">${fmtCurrency(restBetrag)}</td></tr>`;
  }

  const metaParts: string[] = [];
  metaParts.push(
    `<div><span class="meta-label">${typLabel} Nr.</span><span class="meta-value">${invoice.nummer || "–"}</span></div>`
  );
  metaParts.push(
    `<div><span class="meta-label">Datum</span><span class="meta-value">${datumFormatted}</span></div>`
  );
  if (!isAngebot && leistungFormatted)
    metaParts.push(
      `<div><span class="meta-label">Leistungsdatum</span><span class="meta-value">${leistungFormatted}</span></div>`
    );
  if (!isAngebot && faelligFormatted)
    metaParts.push(
      `<div><span class="meta-label">Fällig am</span><span class="meta-value">${faelligFormatted}</span></div>`
    );
  if (gueltigBisFormatted)
    metaParts.push(
      `<div><span class="meta-label">Gültig bis</span><span class="meta-value">${gueltigBisFormatted}</span></div>`
    );
  if (!isAngebot && invoice.zahlungsbedingungen)
    metaParts.push(
      `<div><span class="meta-label">Zahlung</span><span class="meta-value">${invoice.zahlungsbedingungen}</span></div>`
    );

  const mahnBanner =
    mahnstufe > 0
      ? `
    <div style="background:#fef2f2;border:2px solid #CC0000;border-radius:6px;padding:12px 20px;margin-bottom:20px;text-align:center;font-weight:800;color:#CC0000;font-size:12pt;letter-spacing:1px;">
      ⚠ ${mahnstufe}. MAHNUNG
    </div>`
      : "";

  // Extract Zahlungsfrist days for closing text
  const zahlungsTage = invoice.zahlungsbedingungen
    ? invoice.zahlungsbedingungen.match(/(\d+)/)?.[1] || "14"
    : "14";

  const closingText = isAngebot
    ? `<div class="closing-text">Wir freuen uns auf Ihren Auftrag und stehen für Rückfragen jederzeit gerne zur Verfügung.</div>`
    : `<div class="closing-text">Wir bedanken uns für Ihren Auftrag und bitten um Überweisung des Rechnungsbetrages innerhalb von ${zahlungsTage} Tagen.</div>`;

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>${typLabel} ${invoice.nummer || "Vorschau"}</title>
<style>
  @page { size: A4; margin: 15mm; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9pt; color: #333; line-height: 1.5; }
  .page-wrap { max-width: 180mm; margin: 0 auto; padding: 0; display: flex; flex-direction: column; min-height: 100vh; }

  /* Header — logo left, company info right (first page) */
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12px; border-bottom: 1px solid #ccc; margin-bottom: 18px; }
  .header-logo img { height: 50px; width: auto; }
  .header-info { text-align: right; font-size: 8pt; color: #555; line-height: 1.6; }
  .header-info strong { color: #1a1a1a; font-size: 9pt; }

  /* Address row — recipient left, meta right */
  .address-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 22px; }
  .recipient { flex: 1; }
  .sender-line { font-size: 7pt; color: #999; border-bottom: 1px solid #ddd; padding-bottom: 3px; margin-bottom: 8px; display: inline-block; }
  .recipient-name { font-weight: 700; font-size: 10pt; color: #1a1a1a; }
  .recipient-addr { font-size: 9pt; color: #555; line-height: 1.6; }
  .doc-meta { text-align: right; min-width: 180px; }
  .doc-meta-row { display: flex; justify-content: space-between; gap: 12px; font-size: 8.5pt; line-height: 1.8; }
  .doc-meta-label { color: #888; }
  .doc-meta-value { color: #1a1a1a; font-weight: 600; }

  /* Document title */
  .doc-title { font-size: 14pt; font-weight: 800; color: #1a1a1a; margin-bottom: 16px; border-bottom: 2px solid ${accent}; padding-bottom: 6px; }

  /* Items table — clean like reference, thead repeats on each page */
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
  table.items thead { display: table-header-group; }
  table.items thead th { border-bottom: 2px solid #333; padding: 6px 8px; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; color: #555; background: #fff; }
  table.items tbody td { padding: 7px 8px; border-bottom: 1px solid #e0e0e0; font-size: 8.5pt; vertical-align: top; }
  table.items tbody tr { page-break-inside: avoid; }
  table.items tbody tr:last-child td { border-bottom: 2px solid #333; }
  table.items tfoot { display: table-footer-group; }
  table.items tfoot td { border: none; padding: 4px 8px; font-size: 7.5pt; color: #888; font-style: italic; }

  /* Totals — avoid page break */
  .totals-section { page-break-inside: avoid; break-inside: avoid; }
  .totals-wrap { display: flex; justify-content: flex-end; margin-bottom: 18px; }
  .totals-table { width: 250px; }
  .totals-table td { padding: 3px 0; font-size: 9pt; }

  /* Notes */
  .notes { border-left: 3px solid #ddd; padding: 8px 14px; font-size: 8.5pt; color: #555; margin-bottom: 14px; }

  /* Closing */
  .closing-text { font-size: 8.5pt; color: #666; margin-bottom: 14px; padding-top: 8px; page-break-inside: avoid; break-inside: avoid; }

  /* Bank info — inline like reference */
  .bank-info { page-break-inside: avoid; break-inside: avoid; margin-bottom: 10px; }
  .bank-info-row { font-size: 8pt; color: #555; }
  .bank-info-row strong { color: #333; }

  /* Footer — pushed to bottom via flex, full width */
  .footer { border-top: 1px solid #ccc; padding: 8px 0 4px 0; font-size: 6.5pt; color: #888; line-height: 1.6; margin-top: auto; page-break-inside: avoid; break-inside: avoid; width: 100%; }
  .footer-line { text-align: center; white-space: nowrap; overflow: visible; }

  /* Storniert watermark */
  .storniert::after { content: 'STORNIERT'; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 72pt; color: rgba(204,0,0,0.08); font-weight: 900; pointer-events: none; letter-spacing: 8px; }
</style>
</head>
<body class="${invoice.status === "storniert" ? "storniert" : ""}">

<div class="page-wrap">

${mahnBanner}

<!-- Header -->
<div class="header">
  <div class="header-logo">
    ${LOGO_IMG}
  </div>
  <div class="header-info">
    <strong>Gottfried Tilger</strong><br>
    Bahnhofstr. 174<br>
    8831 Niederwölz<br>
    Tel: +43 664 44 35 346<br>
    E-Mail: info@ft-tilger.at
  </div>
</div>

<!-- Address row — recipient left, meta right -->
<div class="address-row">
  <div class="recipient">
    <div class="sender-line">Gottfried Tilger · Bahnhofstr. 174 · 8831 Niederwölz</div>
    <div class="recipient-name">${invoice.kunde_name || "–"}</div>
    <div class="recipient-addr">
      ${invoice.kunde_adresse ? `${invoice.kunde_adresse}<br>` : ""}
      ${invoice.kunde_plz || invoice.kunde_ort ? `${invoice.kunde_plz || ""} ${invoice.kunde_ort || ""}<br>` : ""}
      ${invoice.kunde_land && invoice.kunde_land !== "Österreich" ? `${invoice.kunde_land}<br>` : ""}
      ${invoice.kunde_uid ? `UID: ${invoice.kunde_uid}` : ""}
    </div>
  </div>
  <div class="doc-meta">
    ${metaParts.map(p => {
      // Convert meta-grid items to simple rows
      const labelMatch = p.match(/class="meta-label">([^<]+)/);
      const valueMatch = p.match(/class="meta-value">([^<]+)/);
      if (labelMatch && valueMatch) {
        return `<div class="doc-meta-row"><span class="doc-meta-label">${labelMatch[1]}</span><span class="doc-meta-value">${valueMatch[1]}</span></div>`;
      }
      return "";
    }).join("")}
  </div>
</div>

<!-- Document Title -->
<div class="doc-title">${typLabel}${invoice.nummer ? ` Nr.: ${invoice.nummer}` : ""}</div>

${(() => {
  const allItems = items || [];
  const MAX_PER_PAGE = 16;
  const tableHead = `<thead><tr>
    <th style="width:40px;text-align:center;">Pos.</th>
    <th style="width:55px;text-align:right;">Menge</th>
    <th style="width:45px;text-align:center;">Einh.</th>
    <th style="text-align:left;">Beschreibung</th>
    <th style="width:80px;text-align:right;">Preis</th>
    <th style="width:90px;text-align:right;">Gesamt</th>
  </tr></thead>`;

  const renderRow = (item: InvoiceHtmlItem) => `<tr>
    <td style="text-align:center;color:#888;">${String(item.position).padStart(2, "0")}</td>
    <td style="text-align:right;">${fmt(Number(item.menge))}</td>
    <td style="text-align:center;color:#888;">${item.einheit || "Stk."}</td>
    <td>${item.beschreibung}</td>
    <td style="text-align:right;">${fmtCurrency(Number(item.einzelpreis))}</td>
    <td style="text-align:right;font-weight:600;">${fmtCurrency(Number(item.gesamtpreis))}</td>
  </tr>`;

  // If few items, render normally
  if (allItems.length <= MAX_PER_PAGE) {
    return `<table class="items">${tableHead}<tbody>${allItems.map(renderRow).join("")}</tbody></table>
    <div class="totals-section"><div class="totals-wrap"><table class="totals-table">${totalsHtml}</table></div></div>`;
  }

  // Many items: split into pages, ensure totals are with last items
  const chunks: InvoiceHtmlItem[][] = [];
  for (let i = 0; i < allItems.length; i += MAX_PER_PAGE) {
    chunks.push(allItems.slice(i, i + MAX_PER_PAGE));
  }

  // If last chunk has fewer than 4 items AND totals need to fit,
  // move some items from second-to-last chunk
  const lastChunk = chunks[chunks.length - 1];
  if (lastChunk.length > MAX_PER_PAGE - 4) {
    // Last chunk is full — totals go on next page
    // Move last 4 items to a new chunk with totals
    const moveItems = lastChunk.splice(-4);
    chunks.push(moveItems);
  }

  let html = "";
  chunks.forEach((chunk, chunkIdx) => {
    const isLast = chunkIdx === chunks.length - 1;
    const isFirst = chunkIdx === 0;

    if (!isFirst) {
      html += `<div style="page-break-before:always;"></div>`;
    }

    html += `<table class="items">${tableHead}<tbody>${chunk.map(renderRow).join("")}</tbody></table>`;

    if (!isLast) {
      // Show subtotal carried forward
      const subtotal = chunks.slice(0, chunkIdx + 1).flat().reduce((s, it) => s + Number(it.gesamtpreis), 0);
      html += `<div style="text-align:right;font-size:8pt;color:#888;margin-bottom:4px;font-style:italic;">Übertrag: ${fmtCurrency(subtotal)}</div>`;
    }

    if (isLast) {
      html += `<div class="totals-section"><div class="totals-wrap"><table class="totals-table">${totalsHtml}</table></div></div>`;
    }
  });

  return html;
})()}

${invoice.notizen ? `<div class="notes"><strong>Anmerkung:</strong> ${invoice.notizen}</div>` : ""}

${closingText}

${
  !isAngebot
    ? `<div class="bank-info" style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
  <div class="bank-info-row">
    <strong>Bankverbindung:</strong> ${b.kontoinhaber} · IBAN: ${b.iban} · BIC: ${b.bic}
  </div>
  ${qrCodeDataUri ? `<div style="text-align:center;flex-shrink:0;">
    <img src="${qrCodeDataUri}" style="width:80px;height:80px;" alt="QR-Code Zahlung" />
    <div style="font-size:6pt;color:#888;margin-top:2px;">Zahlen mit Code</div>
  </div>` : ""}
</div>`
    : ""
}

<!-- Footer -->
<div class="footer">
  <div class="footer-line">
    Gottfried Tilger · Fliesentechnik & Natursteinteppich · Bahnhofstr. 174 · 8831 Niederwölz · Tel: +43 664 44 35 346 · info@ft-tilger.at
  </div>
  ${isAngebot ? `<div class="footer-line">IBAN: ${b.iban} · BIC: ${b.bic}</div>` : ""}
</div>

</div><!-- /page-wrap -->
</body></html>`;
}
