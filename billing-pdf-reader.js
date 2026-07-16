// Billing PDF Reader - extracts key figures from Rabot Energy "Abrechnung" PDFs
// (consumption, costs, Abschlag, final amount) using pdf.js for text extraction.
// Standalone web tool (hosted on GitHub Pages), formerly bundled with the
// Logger extension.

pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';

let invoices = []; // one entry per parsed PDF
let sortCol = 'periodFromKey', sortDir = 1;
let lang = 'en';
let filterFrom = null, filterTo = null; // YYYYMM keys, null = full range
let lastMonthKeys = ''; // tracks whether filter <select> options need rebuilding

const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

const I18N = {
  en: {
    title: 'Billing PDF Reader',
    subtitle: 'Drop one or more "Abrechnung" PDFs to extract consumption, costs, Abschlag and Guthaben/Nachzahlung',
    dropMain: 'Drop billing PDF(s) here, or click to browse',
    dropSub: 'Supports Rabot Energy "Abrechnung im Detail" PDFs - multiple files at once for combined totals',
    addMore: 'Add more PDFs',
    exportExcel: 'Export to Excel',
    reset: 'Reset',
    overview: 'Billing Overview',
    files: 'file', filesPlural: 'files', failed: 'failed',
    account: { Customer: 'Customer', Kundennummer: 'Customer Number', Contract: 'Contract', Zählernummer: 'Meter Number', MaLo: 'MaLo', Tarif: 'Tariff' },
    reportLabel: 'Report', generatedOn: 'Generated on',
    kpi: {
      invoices: 'Invoices',
      totalConsumption: 'Total Consumption',
      totalCosts: 'Total Costs (brutto)',
      totalAbschlag: 'Total Abschläge collected',
      netResult: 'Net Gutschrift / Nachzahlung',
      countLabel: 'Guthaben / Nachzahlung count',
    },
    cols: {
      month: 'Period', invNumber: 'Invoice', invDate: 'Invoice Date',
      verbrauch: 'Consumption (kWh)', pricePerKwh: 'Ø Price (ct/kWh)',
      kosten: 'Costs brutto (€)', abschlag: 'Abschlag (€)', endAmount: 'Guthaben / Nachzahlung (€)',
    },
    total: 'TOTAL',
    endLabel: { Guthaben: 'Credit', Nachzahlung: 'Payment due' },
    monthly: {
      title: 'Monthly Breakdown', subtitle: 'Combines the per-month tables from every uploaded PDF, so periods can be filtered across files (e.g. isolate a calendar year).',
      from: 'From', to: 'To', all: 'All', viewPdf: 'View PDF', downloadPdf: 'Download PDF',
      noData: 'No monthly tables were found in the uploaded PDF(s).',
      kpi: { months: 'Months in Range', consumption: 'Consumption', costs: 'Costs (brutto)', abschlag: 'Abschläge', net: 'Net Verrechnung' },
      cols: { month: 'Month', verbrauch: 'Consumption (kWh)', kosten: 'Costs brutto (€)', abschlag: 'Abschlag (€)', verrechnung: 'Verrechnung (€)' },
    },
  },
  de: {
    title: 'Rechnungs-PDF-Leser',
    subtitle: 'Eine oder mehrere "Abrechnung"-PDFs ablegen, um Verbrauch, Kosten, Abschlag und Guthaben/Nachzahlung zu erfassen',
    dropMain: 'Rechnungs-PDF(s) hier ablegen oder klicken zum Auswählen',
    dropSub: 'Unterstützt Rabot Energy "Abrechnung im Detail" PDFs - mehrere Dateien gleichzeitig für Gesamtsummen',
    addMore: 'Weitere PDFs hinzufügen',
    exportExcel: 'Nach Excel exportieren',
    reset: 'Zurücksetzen',
    overview: 'Abrechnungsübersicht',
    files: 'Datei', filesPlural: 'Dateien', failed: 'fehlgeschlagen',
    account: { Customer: 'Kunde', Kundennummer: 'Kundennummer', Contract: 'Vertrag', Zählernummer: 'Zählernummer', MaLo: 'MaLo', Tarif: 'Tarif' },
    reportLabel: 'Bericht', generatedOn: 'Erstellt am',
    kpi: {
      invoices: 'Rechnungen',
      totalConsumption: 'Gesamtverbrauch',
      totalCosts: 'Gesamtkosten (brutto)',
      totalAbschlag: 'Eingezogene Abschläge',
      netResult: 'Saldo Guthaben / Nachzahlung',
      countLabel: 'Anzahl Guthaben / Nachzahlung',
    },
    cols: {
      month: 'Zeitraum', invNumber: 'Rechnung', invDate: 'Rechnungsdatum',
      verbrauch: 'Verbrauch (kWh)', pricePerKwh: 'Ø Preis (ct/kWh)',
      kosten: 'Kosten brutto (€)', abschlag: 'Abschlag (€)', endAmount: 'Guthaben / Nachzahlung (€)',
    },
    total: 'GESAMT',
    endLabel: { Guthaben: 'Guthaben', Nachzahlung: 'Nachzahlung' },
    monthly: {
      title: 'Monatliche Aufschlüsselung', subtitle: 'Fasst die Monatstabellen aller hochgeladenen PDFs zusammen, damit Zeiträume dateiübergreifend gefiltert werden können (z.B. ein Kalenderjahr isolieren).',
      from: 'Von', to: 'Bis', all: 'Alle', viewPdf: 'PDF anzeigen', downloadPdf: 'Als PDF herunterladen',
      noData: 'In den hochgeladenen PDF(s) wurden keine Monatstabellen gefunden.',
      kpi: { months: 'Monate im Zeitraum', consumption: 'Verbrauch', costs: 'Kosten (brutto)', abschlag: 'Abschläge', net: 'Saldo Verrechnung' },
      cols: { month: 'Monat', verbrauch: 'Verbrauch (kWh)', kosten: 'Abrechnung (€)', abschlag: 'Abschlag (€)', verrechnung: 'Verrechnung (€)' },
    },
  },
};

function t() { return I18N[lang]; }

function applyStaticTranslations() {
  const tr = t();
  document.getElementById('titleText').textContent = tr.title;
  document.getElementById('subtitleText').textContent = tr.subtitle;
  document.getElementById('dropMain').textContent = tr.dropMain;
  document.getElementById('dropSub').textContent = tr.dropSub;
  document.getElementById('addMoreBtn').lastChild.textContent = ' ' + tr.addMore;
  document.getElementById('exportBtnLabel').textContent = ' ' + tr.exportExcel;
  document.getElementById('resetBtn').textContent = tr.reset;
  document.getElementById('overviewLabel').textContent = tr.overview;
  document.getElementById('langToggle').textContent = lang === 'en' ? 'Deutsch' : 'English';
  document.getElementById('downloadMonthlyPdfBtnLabel').textContent = tr.monthly.viewPdf;
}

const dz = document.getElementById('dropzone');
dz.addEventListener('click',     () => document.getElementById('fileInput').click());
dz.addEventListener('dragover',  e  => { e.preventDefault(); dz.classList.add('drag-over'); });
dz.addEventListener('dragleave', ()  => dz.classList.remove('drag-over'));
dz.addEventListener('drop',      e  => { e.preventDefault(); dz.classList.remove('drag-over'); handleFiles(e.dataTransfer.files); });
document.getElementById('fileInput').addEventListener('change', e => handleFiles(e.target.files));
document.getElementById('exportBtn').addEventListener('click', exportExcel);
document.getElementById('downloadMonthlyPdfBtn').addEventListener('click', downloadMonthlyPdf);
document.getElementById('resetBtn').addEventListener('click', resetApp);
document.getElementById('addMoreBtn').addEventListener('click', () => document.getElementById('fileInput').click());
document.getElementById('langToggle').addEventListener('click', () => {
  lang = lang === 'en' ? 'de' : 'en';
  applyStaticTranslations();
  render();
});
applyStaticTranslations();

async function handleFiles(fileList) {
  const files = [...fileList].filter(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  if (!files.length) return;

  document.getElementById('dropzone').style.display = 'none';
  document.getElementById('toolbar').style.display = 'flex';
  document.getElementById('resultsCard').style.display = '';
  document.getElementById('status').textContent = 'Reading ' + files.length + ' file' + (files.length > 1 ? 's' : '') + '...';

  for (const file of files) {
    try {
      const data = await readFileAsArrayBuffer(file);
      const text = await extractText(data);
      const info = parseInvoice(text, file.name);
      invoices.push(info);
    } catch (err) {
      invoices.push({ fileName: file.name, error: (err && err.message) || String(err) });
    }
  }

  document.getElementById('status').textContent = '';
  document.getElementById('fileInput').value = '';
  render();
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result));
    r.onerror = reject;
    r.readAsArrayBuffer(file);
  });
}

async function extractText(data) {
  const doc = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
  let full = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    full += content.items.map(i => i.str).join(' ') + '\n';
  }
  return normalizeExtractedText(full);
}

// Some invoice templates split numbers and accented letters across separate
// PDF text runs (e.g. a font ligature for "fl", or "ä" as its own run), which
// come out of extractText() as "1 . 179 , 29" or "M ä rz" once items are
// joined with spaces. Collapse that spacing back together so the regexes
// below can match regardless of which template generated the PDF.
function normalizeExtractedText(text) {
  let prev;
  do {
    prev = text;
    text = text.replace(/(\d)\s+([.,])\s+(\d)/g, '$1$2$3');
    text = text.replace(/(^|[\s(])-\s+(\d)/g, '$1-$2');
  } while (text !== prev);
  return text;
}

// Matches a word allowing arbitrary whitespace between each of its letters,
// so a split-up month name like "M ä rz" still matches "März".
function loosePattern(word) {
  return word.split('').join('\\s*');
}

// Parse a German-formatted number: dots are thousands separators, comma is decimal.
function pn(s) {
  if (s === undefined || s === null) return null;
  s = String(s).trim();
  if (!s) return null;
  const v = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return isNaN(v) ? null : v;
}
function fmt(n) {
  if (n === null || n === undefined) return '';
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// Same as fmt(), with the unit appended — used for the Monthly Breakdown
// table cells (on-page, pop-out report, and PDF) so each value is readable
// on its own, not just via the column header.
function fmtKwh(n) { return n === null || n === undefined ? '' : fmt(n) + ' kWh'; }
function fmtEur(n) { return n === null || n === undefined ? '' : fmt(n) + ' €'; }
function dateKey(d) {
  const m = (d || '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? m[3] + m[2] + m[1] : '';
}

// Parses the "Monatsauflistung (Abrechnungen)" table present in both known templates:
// "<Monat> <Jahr>  <verbrauch> kWh  <kosten> €  <abschlag> €  <verrechnung> €"
function parseMonthlyTable(text) {
  const monthAlt = MONTHS_DE.map(loosePattern).join('|');
  const re = new RegExp('(' + monthAlt + ')\\s+(20\\d{2})\\s+([\\d.,]+)\\s*kWh\\s+([\\d.,-]+)\\s*€\\s+([\\d.,-]+)\\s*€\\s+([\\d.,-]+)\\s*€', 'g');
  const rows = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const monthName = m[1].replace(/\s+/g, '');
    const monthNum = MONTHS_DE.indexOf(monthName) + 1;
    rows.push({
      key: m[2] + String(monthNum).padStart(2, '0'),
      monthLabel: monthName + ' ' + m[2],
      verbrauch: pn(m[3]),
      kosten: pn(m[4]),
      abschlag: pn(m[5]),
      verrechnung: pn(m[6]),
    });
  }
  return rows;
}

function parseInvoice(text, fileName) {
  const get = (re) => { const m = text.match(re); return m ? m[1].trim() : ''; };

  // Two known templates differ in wording: "Ihre Abrechnung im Detail für X" (newer) vs
  // "Abrechnung Stromlieferung für X" (older) - both end in "... Kundennummer".
  const month       = get(/(?:Ihre Abrechnung im Detail für|Abrechnung Stromlieferung für)\s+(.+?)\s+Kundennummer/);
  const kundennummer = get(/Kundennummer:\s*(\S+)/);
  const vertrag     = get(/Vertragsnummer:\s*(\S+)/);
  const rechnungRef = get(/Rechnungsnummerref:\s*(\S+)/);
  const zaehler     = get(/Zählernummer:\s*(\S+)/);
  const malo        = get(/Marktlokations-ID:\s*(\S+)/);
  const tarif       = get(/Tarif:\s*(\S+)/);
  const name        = get(/Guten Tag\s+(.+?),/);

  const per = text.match(/Zeitraum vom\s+([\d.]+)\s+bis\s+([\d.]+)/);
  const periodFrom = per ? per[1] : '';
  const periodTo   = per ? per[2] : '';

  // Two known templates differ in wording ("Ihr Verbrauch" vs "Verbrauch", label before/after
  // the amount, with/without parentheses) - these patterns accept both variants.
  const verbrauch = pn(get(/(?:Ihr\s+)?Verbrauch\s+([\d.,]+)\s*kWh/));
  const kosten    = pn(get(/(?:Ihre\s+)?Kosten brutto\s+([\d.,-]+)\s*€/));
  const abschlag  = pn(get(/Abschlagszahlungen brutto\s*(?:\(?bereits in Rechnung gestellt\)?\s*)?([\d.,-]+)\s*€/));

  const end = text.match(/(?:Ihr\s+)?Rechnungsbetrag brutto\s*\(?(Guthaben|Nachzahlung)?\)?\s*([\d.,-]+)\s*€\s*\(?(Guthaben|Nachzahlung)?\)?/);
  const endLabel  = end ? (end[1] || end[3] || '') : '';
  const endAmount = end ? pn(end[2]) : null;

  const inv = text.match(/Rechnungsnummer\s+(\S+)\s+vom\s+([\d.]+)/);
  const invNumber = inv ? inv[1] : rechnungRef;
  const invDate   = inv ? inv[2] : '';

  // Average price per kWh (costs brutto / consumption), in ct/kWh
  const pricePerKwh = (kosten !== null && verbrauch) ? (kosten * 100 / verbrauch) : null;

  const monthly = parseMonthlyTable(text);

  return {
    fileName, month, kundennummer, vertrag, rechnungRef, zaehler, malo, tarif, name,
    periodFrom, periodTo, periodFromKey: dateKey(periodFrom),
    verbrauch, kosten, abschlag, endLabel, endAmount, pricePerKwh,
    invNumber, invDate, monthly,
  };
}

function getSorted() {
  const ok = invoices.filter(i => !i.error);
  return [...ok].sort((a, b) => {
    const va = a[sortCol] ?? '';
    const vb = b[sortCol] ?? '';
    return typeof va === 'string'
      ? sortDir * va.localeCompare(vb)
      : sortDir * ((va ?? 0) - (vb ?? 0));
  });
}

function render() {
  const ok = invoices.filter(i => !i.error);
  const errored = invoices.filter(i => i.error);

  const tr = t();
  document.getElementById('rowBadge').textContent = invoices.length + ' ' + (invoices.length === 1 ? tr.files : tr.filesPlural) +
    (errored.length ? ' (' + errored.length + ' ' + tr.failed + ')' : '');

  renderAccountInfo(ok);
  renderKpis(ok);
  renderTable();
  renderMonthlyBreakdown();

  if (errored.length) {
    document.getElementById('errors').innerHTML = errored.map(e =>
      "<div class='err-row'>" + e.fileName + ': ' + e.error + '</div>').join('');
  } else {
    document.getElementById('errors').innerHTML = '';
  }
}

function renderAccountInfo(ok) {
  const el = document.getElementById('accountInfo');
  if (!el) return;
  const ref = ok.find(r => r.name || r.vertrag || r.kundennummer);
  if (!ref) { el.innerHTML = ''; return; }
  const a = t().account;
  const items = [
    [a.Customer, ref.name],
    [a.Kundennummer, ref.kundennummer],
    [a.Contract, ref.vertrag],
    [a.Zählernummer, ref.zaehler],
    [a.MaLo, ref.malo],
    [a.Tarif, ref.tarif],
  ].filter(([, v]) => v);
  el.innerHTML = items.map(([label, value]) =>
    "<div class='account-item'><div class='label'>" + label + "</div><div class='value'>" + value + "</div></div>"
  ).join('');
}

function renderKpis(ok) {
  const totalVerbrauch = ok.reduce((s, r) => s + (r.verbrauch || 0), 0);
  const totalKosten    = ok.reduce((s, r) => s + (r.kosten || 0), 0);
  const totalAbschlag  = ok.reduce((s, r) => s + Math.abs(r.abschlag || 0), 0);
  const totalEnd       = ok.reduce((s, r) => s + (r.endAmount || 0), 0);
  const gutCount  = ok.filter(r => r.endLabel === 'Guthaben').length;
  const nachCount = ok.filter(r => r.endLabel === 'Nachzahlung').length;

  const k = t().kpi;
  document.getElementById('kpis').innerHTML =
    "<div class='kpi neutral'><div class='label'>" + k.invoices + "</div><div class='value'>" + ok.length + "</div></div>" +
    "<div class='kpi neutral'><div class='label'>" + k.totalConsumption + "</div><div class='value' style='font-size:1.1rem'>" + fmt(totalVerbrauch) + " kWh</div></div>" +
    "<div class='kpi neutral'><div class='label'>" + k.totalCosts + "</div><div class='value' style='font-size:1.1rem'>" + fmt(totalKosten) + " €</div></div>" +
    "<div class='kpi ok'><div class='label'>" + k.totalAbschlag + "</div><div class='value' style='font-size:1.1rem'>" + fmt(totalAbschlag) + " €</div></div>" +
    "<div class='kpi " + (totalEnd < -0.005 ? 'credit-val' : totalEnd > 0.005 ? 'debt' : 'ok') + "'><div class='label'>" + k.netResult + "</div><div class='value' style='font-size:1.1rem'>" + fmt(totalEnd) + " €</div></div>" +
    "<div class='kpi credit-val'><div class='label'>" + k.countLabel + "</div><div class='value' style='font-size:1.1rem'>" + gutCount + ' / ' + nachCount + "</div></div>";
}

function renderTable() {
  const c = t().cols;
  const cols = [
    { key: 'month',         label: c.month },
    { key: 'invNumber',     label: c.invNumber },
    { key: 'invDate',       label: c.invDate },
    { key: 'verbrauch',     label: c.verbrauch, num: true },
    { key: 'pricePerKwh',   label: c.pricePerKwh, num: true },
    { key: 'kosten',        label: c.kosten, num: true },
    { key: 'abschlag',      label: c.abschlag, num: true },
    { key: 'endAmount',     label: c.endAmount, num: true },
  ];

  let thead = '<tr>';
  cols.forEach(c => {
    const active = sortCol === c.key;
    const arrow  = active ? (sortDir === 1 ? ' ▲' : ' ▼') : ' ⇅';
    thead += "<th class='sortable" + (c.num ? ' num' : '') + "' data-col='" + c.key + "'>"
           + c.label + "<span class='sort-arrow" + (active ? ' active' : '') + "'>" + arrow + "</span></th>";
  });
  thead += '</tr>';

  const sorted = getSorted();
  const tbody = sorted.map(r => {
    const endCls = r.endLabel === 'Nachzahlung' ? 'badge-debt' : r.endLabel === 'Guthaben' ? 'badge-credit' : '';
    return "<tr><td>" + (r.month || '') + "</td>" +
      "<td>" + (r.invNumber || '') + "</td>" +
      "<td>" + (r.invDate || '') + "</td>" +
      "<td class='num'>" + fmt(r.verbrauch) + "</td>" +
      "<td class='num'>" + fmt(r.pricePerKwh) + "</td>" +
      "<td class='num'>" + fmt(r.kosten) + "</td>" +
      "<td class='num'>" + fmt(r.abschlag) + "</td>" +
      "<td class='num " + endCls + "'>" + fmt(r.endAmount) + (r.endLabel ? ' (' + (t().endLabel[r.endLabel] || r.endLabel) + ')' : '') + "</td></tr>";
  }).join('');

  const tV = sorted.reduce((s, r) => s + (r.verbrauch || 0), 0);
  const tK = sorted.reduce((s, r) => s + (r.kosten || 0), 0);
  const tA = sorted.reduce((s, r) => s + (r.abschlag || 0), 0);
  const tE = sorted.reduce((s, r) => s + (r.endAmount || 0), 0);
  const tPrice = tV ? (tK * 100 / tV) : null;
  const tfoot = "<tr><td>" + t().total + "</td><td></td><td></td>" +
    "<td class='num'>" + fmt(tV) + " kWh</td>" +
    "<td class='num'>" + fmt(tPrice) + " ct/kWh</td>" +
    "<td class='num'>" + fmt(tK) + " €</td>" +
    "<td class='num'>" + fmt(tA) + " €</td>" +
    "<td class='num'>" + fmt(tE) + " €</td></tr>";

  document.getElementById('invoiceTable').innerHTML =
    "<thead>" + thead + "</thead><tbody>" + tbody + "</tbody><tfoot>" + tfoot + "</tfoot>";

  document.querySelectorAll('#invoiceTable th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      sortDir = sortCol === col ? sortDir * -1 : 1;
      sortCol = col;
      renderTable();
    });
  });
}

// Combines the per-month rows from every parsed invoice into one sorted list.
// If two files supply the same month (e.g. a duplicate/overlapping upload), the
// later-parsed file wins rather than double-counting that month.
function getAllMonths() {
  const ok = invoices.filter(i => !i.error);
  const byKey = new Map();
  ok.forEach(inv => (inv.monthly || []).forEach(m => byKey.set(m.key, { ...m, fileName: inv.fileName })));
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function renderMonthlyBreakdown() {
  const card = document.getElementById('monthlyCard');
  const allMonths = getAllMonths();
  const tr = t().monthly;
  document.getElementById('monthlyTitleText').textContent = tr.title;
  document.getElementById('monthlySubtitleText').textContent = tr.subtitle;
  document.getElementById('filterFromLabel').textContent = tr.from;
  document.getElementById('filterToLabel').textContent = tr.to;

  if (!allMonths.length) {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';

  const keys = allMonths.map(m => m.key);
  const keySignature = keys.join(',');
  if (keySignature !== lastMonthKeys) {
    // Month set changed (files added/reset) - rebuild the From/To options and quick-year buttons.
    lastMonthKeys = keySignature;
    filterFrom = keys[0];
    filterTo = keys[keys.length - 1];

    const fromSel = document.getElementById('filterFrom');
    const toSel = document.getElementById('filterTo');
    fromSel.innerHTML = allMonths.map(m => `<option value="${m.key}">${m.monthLabel}</option>`).join('');
    toSel.innerHTML = allMonths.map(m => `<option value="${m.key}">${m.monthLabel}</option>`).join('');
    fromSel.value = filterFrom;
    toSel.value = filterTo;

    const years = [...new Set(keys.map(k => k.slice(0, 4)))];
    const yearBtns = document.getElementById('yearQuickBtns');
    yearBtns.innerHTML = `<button type="button" class="year-btn" data-year="all">${tr.all}</button>` +
      years.map(y => `<button type="button" class="year-btn" data-year="${y}">${y}</button>`).join('');
    yearBtns.querySelectorAll('.year-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const y = btn.dataset.year;
        if (y === 'all') {
          filterFrom = keys[0];
          filterTo = keys[keys.length - 1];
        } else {
          const inYear = keys.filter(k => k.slice(0, 4) === y);
          filterFrom = inYear[0];
          filterTo = inYear[inYear.length - 1];
        }
        document.getElementById('filterFrom').value = filterFrom;
        document.getElementById('filterTo').value = filterTo;
        renderMonthlyBreakdown();
      });
    });
  }

  document.querySelectorAll('#yearQuickBtns .year-btn').forEach(btn => {
    const y = btn.dataset.year;
    const isActive = y !== 'all' && filterFrom === keys.filter(k => k.slice(0, 4) === y)[0] &&
      filterTo === keys.filter(k => k.slice(0, 4) === y).slice(-1)[0];
    const isAll = y === 'all' && filterFrom === keys[0] && filterTo === keys[keys.length - 1];
    btn.classList.toggle('active', isActive || isAll);
  });

  const filtered = allMonths.filter(m => m.key >= filterFrom && m.key <= filterTo);

  const k = tr.kpi;
  const tV = filtered.reduce((s, r) => s + (r.verbrauch || 0), 0);
  const tK = filtered.reduce((s, r) => s + (r.kosten || 0), 0);
  const tA = filtered.reduce((s, r) => s + (r.abschlag || 0), 0);
  const tR = filtered.reduce((s, r) => s + (r.verrechnung || 0), 0);
  document.getElementById('monthlyKpis').innerHTML =
    "<div class='kpi neutral'><div class='label'>" + k.months + "</div><div class='value'>" + filtered.length + "</div></div>" +
    "<div class='kpi neutral'><div class='label'>" + k.consumption + "</div><div class='value' style='font-size:1.1rem'>" + fmt(tV) + " kWh</div></div>" +
    "<div class='kpi neutral'><div class='label'>" + k.costs + "</div><div class='value' style='font-size:1.1rem'>" + fmt(tK) + " €</div></div>" +
    "<div class='kpi ok'><div class='label'>" + k.abschlag + "</div><div class='value' style='font-size:1.1rem'>" + fmt(Math.abs(tA)) + " €</div></div>" +
    "<div class='kpi " + (tR < -0.005 ? 'credit-val' : tR > 0.005 ? 'debt' : 'ok') + "'><div class='label'>" + k.net + "</div><div class='value' style='font-size:1.1rem'>" + fmt(tR) + " €</div></div>";

  const c = tr.cols;
  const thead = "<tr><th>" + c.month + "</th><th class='num'>" + c.verbrauch + "</th><th class='num'>" + c.kosten +
    "</th><th class='num'>" + c.abschlag + "</th><th class='num'>" + c.verrechnung + "</th></tr>";
  const tbody = filtered.map(r =>
    "<tr><td>" + r.monthLabel + "</td><td class='num'>" + fmtKwh(r.verbrauch) + "</td><td class='num'>" + fmtEur(r.kosten) +
    "</td><td class='num'>" + fmtEur(r.abschlag) + "</td><td class='num'>" + fmtEur(r.verrechnung) + "</td></tr>"
  ).join('');
  const tfoot = "<tr><td>" + t().total + "</td><td class='num'>" + fmtKwh(tV) + "</td><td class='num'>" + fmtEur(tK) +
    "</td><td class='num'>" + fmtEur(tA) + "</td><td class='num'>" + fmtEur(tR) + "</td></tr>";
  document.getElementById('monthlyTable').innerHTML = "<thead>" + thead + "</thead><tbody>" + tbody + "</tbody><tfoot>" + tfoot + "</tfoot>";
}

document.getElementById('filterFrom').addEventListener('change', e => { filterFrom = e.target.value; renderMonthlyBreakdown(); });
document.getElementById('filterTo').addEventListener('change', e => { filterTo = e.target.value; renderMonthlyBreakdown(); });

// Builds a standalone, viewable report of the currently filtered Monthly
// Breakdown and opens it in a new tab, so the user sees the actual page
// first. The "Download PDF" button on that page builds a real PDF file
// with jsPDF (see billing-report.js) and saves it directly — no browser
// print dialog involved.
function downloadMonthlyPdf() {
  const allMonths = getAllMonths();
  const filtered = allMonths.filter(m => m.key >= filterFrom && m.key <= filterTo);
  if (!filtered.length) return;

  const tr = t();
  const c = tr.monthly.cols;
  const ok = invoices.filter(i => !i.error);
  const ref = ok.find(r => r.name || r.kundennummer);

  const tV = filtered.reduce((s, r) => s + (r.verbrauch || 0), 0);
  const tK = filtered.reduce((s, r) => s + (r.kosten || 0), 0);
  const tA = filtered.reduce((s, r) => s + (r.abschlag || 0), 0);
  const tR = filtered.reduce((s, r) => s + (r.verrechnung || 0), 0);

  const rangeLabel = filtered[0].monthLabel === filtered[filtered.length - 1].monthLabel
    ? filtered[0].monthLabel
    : filtered[0].monthLabel + ' – ' + filtered[filtered.length - 1].monthLabel;

  // Customer / contract details shown in a structured info panel under the
  // title (as label/value pairs, not one joined line) so every field -
  // including longer ones like MaLo - gets its own slot instead of being
  // squeezed onto a single line and cut off at the page edge.
  const detailItems = [];
  if (ref) {
    if (ref.name) detailItems.push({ label: tr.account.Customer, value: ref.name });
    if (ref.kundennummer) detailItems.push({ label: tr.account.Kundennummer, value: ref.kundennummer });
    if (ref.vertrag) detailItems.push({ label: tr.account.Contract, value: ref.vertrag });
    if (ref.zaehler) detailItems.push({ label: tr.account.Zählernummer, value: ref.zaehler });
    if (ref.malo) detailItems.push({ label: tr.account.MaLo, value: ref.malo });
  }

  const now = new Date();
  const generatedDate = String(now.getDate()).padStart(2, '0') + '.' + String(now.getMonth() + 1).padStart(2, '0') + '.' + now.getFullYear();

  const titleText = tr.monthly.title + ' — ' + rangeLabel;
  const nameForFile = (ref && ref.name ? ref.name.replace(/[^\w\-]+/g, '_') + '_' : '') + rangeLabel.replace(/[^\w\-]+/g, '_');

  // Data handed to billing-report.js (running on its own static page) via
  // localStorage so it can render the page and build the actual PDF file
  // via jsPDF without needing to re-derive anything from the DOM.
  const reportData = {
    title: titleText,
    eyebrow: tr.reportLabel,
    generatedLabel: tr.generatedOn + ' ' + generatedDate,
    detailItems: detailItems,
    filename: 'Billing_' + nameForFile,
    downloadPdfLabel: tr.monthly.downloadPdf,
    kpis: [
      { label: tr.monthly.kpi.months, value: String(filtered.length) },
      { label: tr.monthly.kpi.consumption, value: fmt(tV) + ' kWh' },
      { label: tr.monthly.kpi.costs, value: fmt(tK) + ' €' },
      { label: tr.monthly.kpi.abschlag, value: fmt(Math.abs(tA)) + ' €' },
      { label: tr.monthly.kpi.net, value: fmt(tR) + ' €' },
    ],
    tableHead: [c.month, c.verbrauch, c.kosten, c.abschlag, c.verrechnung],
    tableRows: filtered.map(r => [r.monthLabel, fmtKwh(r.verbrauch), fmtEur(r.kosten), fmtEur(r.abschlag), fmtEur(r.verrechnung)]),
    tableFoot: [tr.total, fmtKwh(tV), fmtEur(tK), fmtEur(tA), fmtEur(tR)],
  };

  // Stash the data in localStorage (both pages are served from the same
  // origin, so billing-report.html reads it right back out), then open the
  // report as a real static page. This replaces the extension-era
  // chrome.storage.session handoff.
  localStorage.setItem('billingReportData', JSON.stringify(reportData));
  window.open('billing-report.html', '_blank');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function exportExcel() {
  const cols = ['Period', 'Invoice', 'Invoice Date', 'Consumption (kWh)', 'Ø Price (ct/kWh)', 'Costs brutto (€)', 'Abschlag (€)', 'Guthaben/Nachzahlung (€)', 'Type',
    'Customer', 'Kundennummer', 'Contract', 'Zählernummer', 'MaLo', 'Tarif', 'Period From', 'Period To', 'Source File'];
  const rows = [cols];
  for (const r of getSorted()) {
    rows.push([r.month, r.invNumber, r.invDate, r.verbrauch, r.pricePerKwh, r.kosten, r.abschlag, r.endAmount, r.endLabel,
      r.name, r.kundennummer, r.vertrag, r.zaehler, r.malo, r.tarif, r.periodFrom, r.periodTo, r.fileName]);
  }
  const tD = getSorted().reduce((s, r) => s + (r.verbrauch || 0), 0);
  const tK = getSorted().reduce((s, r) => s + (r.kosten || 0), 0);
  const tA = getSorted().reduce((s, r) => s + (r.abschlag || 0), 0);
  const tE = getSorted().reduce((s, r) => s + (r.endAmount || 0), 0);
  const tPrice = tD ? (tK * 100 / tD) : null;
  rows.push(['TOTAL', '', '', tD, tPrice, tK, tA, tE, '', '', '', '', '', '', '', '', '', '']);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = cols.map(() => ({ wch: 16 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Billing Summary');

  const monthCols = ['Month', 'Consumption (kWh)', 'Costs brutto (€)', 'Abschlag (€)', 'Verrechnung (€)', 'Source File'];
  const monthRows = [monthCols];
  const allMonths = getAllMonths();
  for (const m of allMonths) {
    monthRows.push([m.monthLabel, m.verbrauch, m.kosten, m.abschlag, m.verrechnung, m.fileName]);
  }
  if (allMonths.length) {
    const mV = allMonths.reduce((s, r) => s + (r.verbrauch || 0), 0);
    const mK = allMonths.reduce((s, r) => s + (r.kosten || 0), 0);
    const mA = allMonths.reduce((s, r) => s + (r.abschlag || 0), 0);
    const mR = allMonths.reduce((s, r) => s + (r.verrechnung || 0), 0);
    monthRows.push(['TOTAL', mV, mK, mA, mR, '']);
    const wsMonthly = XLSX.utils.aoa_to_sheet(monthRows);
    wsMonthly['!cols'] = monthCols.map(() => ({ wch: 16 }));
    XLSX.utils.book_append_sheet(wb, wsMonthly, 'Monthly Detail');
  }

  XLSX.writeFile(wb, 'billing_summary.xlsx');
}

function resetApp() {
  invoices = [];
  filterFrom = null;
  filterTo = null;
  lastMonthKeys = '';
  document.getElementById('dropzone').style.display = '';
  document.getElementById('toolbar').style.display = 'none';
  document.getElementById('resultsCard').style.display = 'none';
  document.getElementById('monthlyCard').style.display = 'none';
  document.getElementById('fileInput').value = '';
  document.getElementById('status').textContent = '';
  ['kpis', 'invoiceTable', 'errors', 'monthlyKpis', 'monthlyTable', 'yearQuickBtns'].forEach(id => document.getElementById(id).innerHTML = '');
}
