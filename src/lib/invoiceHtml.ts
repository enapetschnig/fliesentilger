// Shared HTML generator for invoice/offer PDF preview
// Used both client-side (preview) and matches edge function output

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

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 140" width="220" height="64">
  <rect x="0" y="0" width="480" height="4" fill="#CC0000"/>
  <text x="240" y="32" text-anchor="middle" font-family="Arial Black, Impact, Arial, sans-serif" font-weight="900" font-size="18" fill="#1A1A1A" letter-spacing="6">FLIESENTECHNIK</text>
  <text x="18" y="92" font-family="Arial Black, Impact, Arial, sans-serif" font-weight="900" font-size="68" fill="#1A1A1A" letter-spacing="3">TIL</text>
  <text x="215" y="92" font-family="Arial Black, Impact, Arial, sans-serif" font-weight="900" font-size="68" fill="#1A1A1A">G</text>
  <text x="235" y="78" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="9" fill="#CC0000" letter-spacing="0.8">GOTTFRIED</text>
  <text x="275" y="92" font-family="Arial Black, Impact, Arial, sans-serif" font-weight="900" font-size="68" fill="#CC0000" letter-spacing="3">ER</text>
  <rect x="0" y="102" width="480" height="3" fill="#CC0000"/>
  <text x="240" y="128" text-anchor="middle" font-family="Arial Black, Impact, Arial, sans-serif" font-weight="900" font-size="18" fill="#1A1A1A" letter-spacing="6">NATURSTEINTEPPICH</text>
  <rect x="0" y="136" width="480" height="4" fill="#CC0000"/>
</svg>`;

export function buildInvoiceHtml(
  invoice: InvoiceHtmlData,
  items: InvoiceHtmlItem[]
): string {
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
  if (leistungFormatted)
    metaParts.push(
      `<div><span class="meta-label">Leistungsdatum</span><span class="meta-value">${leistungFormatted}</span></div>`
    );
  if (faelligFormatted)
    metaParts.push(
      `<div><span class="meta-label">Fällig am</span><span class="meta-value">${faelligFormatted}</span></div>`
    );
  if (gueltigBisFormatted)
    metaParts.push(
      `<div><span class="meta-label">Gültig bis</span><span class="meta-value">${gueltigBisFormatted}</span></div>`
    );
  if (invoice.zahlungsbedingungen)
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

  const closingText = isAngebot
    ? `<div class="closing-text">Wir freuen uns auf Ihren Auftrag und stehen für Rückfragen jederzeit gerne zur Verfügung.</div>`
    : `<div class="closing-text">Wir bedanken uns für Ihren Auftrag und bitten um Überweisung des Rechnungsbetrages innerhalb der angegebenen Zahlungsfrist.</div>`;

  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>${typLabel} ${invoice.nummer || "Vorschau"}</title>
<style>
  @page { size: A4; margin: 15mm 18mm 28mm 18mm; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .no-print { display: none !important; } }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 9.5pt; color: #333; line-height: 1.5; }

  /* Header */
  .header-bar { background: #fff; padding: 18px 28px 14px; display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #CC0000; }
  .header-left { display: flex; align-items: center; gap: 20px; }
  .header-contact { color: #555; font-size: 7.5pt; line-height: 1.7; text-align: right; }
  .header-contact a { color: #CC0000; text-decoration: none; }
  .doc-badge { background: ${accent}; color: #fff; padding: 8px 24px; border-radius: 4px; font-size: 13pt; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }

  /* Red accent line */
  .accent-line { display: none; }

  /* Sender line */
  .sender-line { font-size: 7pt; color: #999; padding: 12px 0 0 0; letter-spacing: 0.5px; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 12px; }

  /* Addresses */
  .addresses { display: flex; gap: 40px; margin-bottom: 24px; padding: 0 4px; }
  .addr { flex: 1; }
  .addr-label { font-size: 7pt; text-transform: uppercase; letter-spacing: 1.5px; color: #999; margin-bottom: 6px; font-weight: 700; }
  .addr-name { font-weight: 700; font-size: 11pt; color: #1a1a1a; margin-bottom: 2px; }
  .addr-detail { font-size: 9pt; color: #555; line-height: 1.6; }

  /* Meta info */
  .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; background: #f8f8f8; border: 1px solid #e5e5e5; border-radius: 6px; padding: 14px 18px; margin-bottom: 24px; }
  .meta-label { display: block; font-size: 7pt; text-transform: uppercase; letter-spacing: 1px; color: #999; font-weight: 600; }
  .meta-value { display: block; font-size: 9.5pt; color: #1a1a1a; font-weight: 600; margin-top: 1px; }

  /* Items table */
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  table.items thead th { background: #1a1a1a; color: #fff; padding: 10px 12px; font-size: 7pt; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; }
  table.items thead th:first-child { border-radius: 4px 0 0 0; }
  table.items thead th:last-child { border-radius: 0 4px 0 0; }

  /* Totals */
  .totals-wrap { display: flex; justify-content: flex-end; margin-bottom: 16px; }
  .totals-table { width: 280px; }
  .totals-table td { padding: 3px 0; }

  /* Notes */
  .notes { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 0 6px 6px 0; font-size: 9pt; color: #78350f; margin-bottom: 20px; }

  /* Closing */
  .closing-text { font-size: 9pt; color: #555; margin-bottom: 20px; padding: 12px 0; border-top: 1px solid #eee; }

  /* Bank info */
  .bank-info { background: #f8f9fa; border: 1px solid #e5e5e5; border-radius: 6px; padding: 14px 18px; margin-bottom: 20px; }
  .bank-info-title { font-size: 7pt; text-transform: uppercase; letter-spacing: 1.5px; color: #999; font-weight: 700; margin-bottom: 6px; }
  .bank-info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .bank-info-label { font-size: 7pt; color: #999; text-transform: uppercase; letter-spacing: 0.5px; }
  .bank-info-value { font-size: 9pt; color: #1a1a1a; font-weight: 600; }

  /* Footer */
  .footer { position: fixed; bottom: 0; left: 0; right: 0; background: #1a1a1a; padding: 12px 18mm; }
  .footer-inner { display: flex; justify-content: space-between; gap: 20px; }
  .footer-col { flex: 1; }
  .footer-label { font-size: 6pt; text-transform: uppercase; letter-spacing: 1.5px; color: #777; font-weight: 700; margin-bottom: 3px; }
  .footer-text { font-size: 7.5pt; color: #ccc; line-height: 1.5; }
  .footer-accent { color: #CC0000; font-weight: 700; }

  /* Storniert watermark */
  .storniert::after { content: 'STORNIERT'; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 72pt; color: rgba(204,0,0,0.08); font-weight: 900; pointer-events: none; letter-spacing: 8px; }

  /* Print bar */
  .print-bar { position: fixed; top: 0; left: 0; right: 0; background: #fff; border-bottom: 1px solid #e2e8f0; padding: 10px 24px; display: flex; gap: 12px; align-items: center; z-index: 999; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  .print-bar button { padding: 8px 24px; border: none; border-radius: 6px; font-size: 10pt; font-weight: 700; cursor: pointer; }
  .btn-print { background: #1a1a1a; color: #fff; }
  .btn-print:hover { background: #333; }
  body.has-bar { padding-top: 56px; }
</style>
</head>
<body class="${invoice.status === "storniert" ? "storniert" : ""} has-bar">

<div class="print-bar no-print">
  <button class="btn-print" onclick="window.print()">Als PDF speichern / Drucken</button>
  <span style="color:#888;font-size:9pt;">Tipp: Im Druckdialog "Als PDF speichern" wählen</span>
</div>

${mahnBanner}

<!-- Professional Header with Logo -->
<div class="header-bar">
  <div class="header-left">
    ${LOGO_SVG}
  </div>
  <div style="display:flex;align-items:center;gap:20px;">
    <div class="header-contact">
      Bahnhofstr. 174 · 8831 Niederwölz<br>
      Tel: <a href="tel:+436641234567">+43 664 44 35 346</a><br>
      <a href="mailto:info@ft-tilger.at">info@ft-tilger.at</a>
    </div>
    <div class="doc-badge">${typLabel}</div>
  </div>
</div>
<div class="accent-line"></div>

<div style="padding: 0 4px;">

<!-- Sender reference line -->
<div class="sender-line">Gottfried Tilger · Fliesentechnik & Natursteinteppich · Bahnhofstr. 174 · 8831 Niederwölz</div>

<!-- Addresses -->
<div class="addresses">
  <div class="addr">
    <div class="addr-label">Empfänger</div>
    <div class="addr-name">${invoice.kunde_name || "–"}</div>
    <div class="addr-detail">
      ${invoice.kunde_adresse ? `${invoice.kunde_adresse}<br>` : ""}
      ${invoice.kunde_plz || invoice.kunde_ort ? `${invoice.kunde_plz || ""} ${invoice.kunde_ort || ""}<br>` : ""}
      ${invoice.kunde_land && invoice.kunde_land !== "Österreich" ? `${invoice.kunde_land}<br>` : ""}
      ${invoice.kunde_uid ? `<span style="color:#999;font-size:8pt;">UID: ${invoice.kunde_uid}</span>` : ""}
    </div>
  </div>
  <div class="addr" style="text-align:right;">
    <div class="addr-label">Absender</div>
    <div class="addr-name">Gottfried Tilger</div>
    <div class="addr-detail">
      Fliesentechnik & Natursteinteppich<br>
      Bahnhofstr. 174<br>
      8831 Niederwölz<br>
      <span style="color:#CC0000;">info@ft-tilger.at</span>
    </div>
  </div>
</div>

<!-- Document Meta -->
<div class="meta-grid">
  ${metaParts.join("")}
</div>

<!-- Items Table -->
<table class="items">
  <thead>
    <tr>
      <th style="width:36px;text-align:center;">Pos</th>
      <th style="text-align:left;">Beschreibung</th>
      <th style="width:60px;text-align:right;">Menge</th>
      <th style="width:50px;text-align:center;">Einheit</th>
      <th style="width:90px;text-align:right;">Einzelpreis</th>
      <th style="width:100px;text-align:right;">Gesamt</th>
    </tr>
  </thead>
  <tbody>
    ${itemRows}
  </tbody>
</table>

<!-- Totals -->
<div class="totals-wrap">
  <table class="totals-table">
    ${totalsHtml}
  </table>
</div>

${invoice.notizen ? `<div class="notes"><strong>Anmerkung:</strong> ${invoice.notizen}</div>` : ""}

${closingText}

${
  !isAngebot
    ? `<!-- Bank Details -->
<div class="bank-info">
  <div class="bank-info-title">Bankverbindung</div>
  <div class="bank-info-grid">
    <div><div class="bank-info-label">Kontoinhaber</div><div class="bank-info-value">Gottfried Tilger</div></div>
    <div><div class="bank-info-label">IBAN</div><div class="bank-info-value">AT61 2081 5000 0423 1474</div></div>
    <div><div class="bank-info-label">BIC</div><div class="bank-info-value">STSPAT2GXXX</div></div>
  </div>
</div>`
    : ""
}

</div>

<!-- Professional Footer -->
<div class="footer">
  <div class="footer-inner">
    <div class="footer-col">
      <div class="footer-label">Unternehmen</div>
      <div class="footer-text">
        <span class="footer-accent">Gottfried Tilger</span><br>
        Fliesentechnik & Natursteinteppich
      </div>
    </div>
    <div class="footer-col">
      <div class="footer-label">Adresse</div>
      <div class="footer-text">
        Bahnhofstr. 174<br>
        8831 Niederwölz
      </div>
    </div>
    <div class="footer-col">
      <div class="footer-label">Kontakt</div>
      <div class="footer-text">
        Tel: +43 664 44 35 346<br>
        <span class="footer-accent">info@ft-tilger.at</span>
      </div>
    </div>
    <div class="footer-col">
      <div class="footer-label">Bankverbindung</div>
      <div class="footer-text">
        IBAN: AT61 2081 5000 0423 1474<br>
        BIC: STSPAT2GXXX
      </div>
    </div>
  </div>
</div>

</body></html>`;
}
