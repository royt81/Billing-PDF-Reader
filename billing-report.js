// Runs inside billing-report.html (opened from billing-pdf-reader.js's
// downloadMonthlyPdf()). Reads the report data out of localStorage (stashed
// there by the opener right before this page was opened), fills in the page,
// and — when the "Download PDF" button is clicked — builds a real PDF file
// with jsPDF + jspdf-autotable and saves it directly. No browser print
// dialog involved.
(function () {
  const STORAGE_KEY = 'billingReportData';

  // Palette shared between the on-page render (CSS, in billing-report.html)
  // and the jsPDF build below, kept in one place so the two stay in sync.
  const COLOR = {
    ink: [30, 41, 59],
    muted: [100, 116, 139],
    accent: [14, 116, 144],
    border: [226, 232, 240],
    bgSoft: [248, 250, 252],
  };

  function el(tag, props) {
    const e = document.createElement(tag);
    if (props) Object.assign(e, props);
    return e;
  }

  function renderPage(data) {
    document.title = data.filename || 'Billing Report';
    document.getElementById('reportEyebrow').textContent = data.eyebrow || 'Report';
    document.getElementById('reportTitle').textContent = data.title || '';
    document.getElementById('reportGenerated').textContent = data.generatedLabel || '';

    const printBtn = document.getElementById('printBtn');
    if (data.downloadPdfLabel) printBtn.textContent = data.downloadPdfLabel;

    // Info panel: each contract/customer field gets its own labeled slot in
    // a grid, instead of being crammed into a single dot-separated line that
    // could run past the edge of the page.
    const infoEl = document.getElementById('reportInfo');
    infoEl.innerHTML = '';
    (data.detailItems || []).forEach((item) => {
      const wrap = el('div', { className: 'info-item' });
      wrap.appendChild(el('div', { className: 'label', textContent: item.label }));
      wrap.appendChild(el('div', { className: 'value', textContent: item.value }));
      infoEl.appendChild(wrap);
    });

    const kpisEl = document.getElementById('reportKpis');
    kpisEl.innerHTML = '';
    (data.kpis || []).forEach((k) => {
      const kpi = el('div', { className: 'kpi' });
      kpi.appendChild(el('div', { className: 'label', textContent: k.label }));
      kpi.appendChild(el('div', { className: 'value', textContent: k.value }));
      kpisEl.appendChild(kpi);
    });

    const theadEl = document.getElementById('reportThead');
    const headRow = el('tr');
    (data.tableHead || []).forEach((label, i) => {
      headRow.appendChild(el('th', { className: i === 0 ? '' : 'num', textContent: label }));
    });
    theadEl.innerHTML = '';
    theadEl.appendChild(headRow);

    const tbodyEl = document.getElementById('reportTbody');
    tbodyEl.innerHTML = '';
    (data.tableRows || []).forEach((row) => {
      const tr = el('tr');
      row.forEach((val, i) => {
        tr.appendChild(el('td', { className: i === 0 ? '' : 'num', textContent: val }));
      });
      tbodyEl.appendChild(tr);
    });

    const tfootEl = document.getElementById('reportTfoot');
    const footRow = el('tr');
    (data.tableFoot || []).forEach((val, i) => {
      footRow.appendChild(el('td', { className: i === 0 ? '' : 'num', textContent: val }));
    });
    tfootEl.innerHTML = '';
    tfootEl.appendChild(footRow);
  }

  function buildPdf(data) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert('PDF library failed to load. Please close this tab and try again.');
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 14;
    const rightX = pageWidth - marginX;
    const tableMargin = { left: marginX, right: marginX };

    // Eyebrow label ("REPORT")
    doc.setFontSize(8.5);
    doc.setFont(undefined, 'bold');
    doc.setTextColor.apply(doc, COLOR.accent);
    doc.text((data.eyebrow || 'Report').toUpperCase(), marginX, 15);

    // Generated-on date, right-aligned on the same line as the eyebrow
    if (data.generatedLabel) {
      doc.setFontSize(8.5);
      doc.setFont(undefined, 'normal');
      doc.setTextColor.apply(doc, COLOR.muted);
      doc.text(data.generatedLabel, rightX, 15, { align: 'right' });
    }

    // Title
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.setTextColor.apply(doc, COLOR.ink);
    doc.text(data.title, marginX, 24);

    // Rule under the header block
    doc.setDrawColor.apply(doc, COLOR.ink);
    doc.setLineWidth(0.6);
    doc.line(marginX, 29, rightX, 29);

    let y = 29;

    // Info panel — each contract/customer field is its own table row (two
    // label/value pairs per row), so long values like MaLo wrap within the
    // page instead of running off a single unbroken line.
    if (data.detailItems && data.detailItems.length) {
      const items = data.detailItems;
      const infoRows = [];
      for (let i = 0; i < items.length; i += 2) {
        const a = items[i];
        const b = items[i + 1];
        infoRows.push([a.label, a.value, b ? b.label : '', b ? b.value : '']);
      }
      doc.autoTable({
        startY: y + 6,
        body: infoRows,
        theme: 'plain',
        margin: tableMargin,
        styles: { fontSize: 9, cellPadding: { top: 2, bottom: 2, left: 0, right: 4 } },
        columnStyles: {
          0: { fontStyle: 'bold', textColor: COLOR.muted, cellWidth: 34 },
          1: { textColor: COLOR.ink, cellWidth: 58 },
          2: { fontStyle: 'bold', textColor: COLOR.muted, cellWidth: 34 },
          3: { textColor: COLOR.ink },
        },
      });
      y = doc.lastAutoTable.finalY + 8;
    } else {
      y += 8;
    }

    // KPI strip, rendered as a bordered table (label row + value row) so it
    // always fits the page width with automatic column sizing/wrapping.
    doc.autoTable({
      startY: y,
      body: [data.kpis.map((k) => k.label.toUpperCase()), data.kpis.map((k) => k.value)],
      theme: 'grid',
      margin: tableMargin,
      styles: { fontSize: 7.5, cellPadding: 4, halign: 'left', lineColor: COLOR.border, lineWidth: 0.3 },
      didParseCell: (hookData) => {
        if (hookData.row.index === 0) {
          hookData.cell.styles.textColor = COLOR.muted;
          hookData.cell.styles.fontSize = 6.8;
        } else {
          hookData.cell.styles.textColor = COLOR.ink;
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.fontSize = 9.5;
        }
      },
    });
    y = doc.lastAutoTable.finalY + 8;

    // Main data table
    doc.autoTable({
      startY: y,
      margin: tableMargin,
      head: [data.tableHead],
      body: data.tableRows,
      foot: [data.tableFoot],
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: COLOR.ink, textColor: 255 },
      footStyles: { fillColor: COLOR.bgSoft, textColor: COLOR.ink, fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      // columnStyles' halign is not honored for the "foot" section in this
      // jsPDF-AutoTable build, so the TOTAL row silently falls back to
      // left-aligned text while the body stays right-aligned — the totals
      // end up several columns to the left of where they should sit.
      // Forcing halign per-cell here (didParseCell fires for every section,
      // including foot) fixes the misalignment.
      didParseCell: (hookData) => {
        if (hookData.section === 'foot' && hookData.column.index >= 1) {
          hookData.cell.styles.halign = 'right';
        }
      },
    });

    doc.save(data.filename + '.pdf');
  }

  // The opener (billing-pdf-reader.js) stashes the report data in
  // localStorage right before opening this page. Same-origin, so both pages
  // share the same localStorage.
  let data = null;
  try { data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (_) { /* fall through */ }
  if (!data) {
    document.body.textContent = 'No report data found. Please close this tab and generate the report again.';
    return;
  }
  renderPage(data);
  document.getElementById('printBtn').addEventListener('click', () => buildPdf(data));
})();
