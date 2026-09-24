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

    document.getElementById('reportTableNote').textContent = data.tableNote || '';
    renderCorrections(data);
  }

  // Billing corrections: one block per correction with its KPIs, the
  // month-by-month comparison (original vs. corrected) and the settlement
  // steps. Everything arrives as ready-made strings from billing-pdf-reader.js.
  function renderCorrections(data) {
    const host = document.getElementById('reportCorrections');
    host.innerHTML = '';
    const list = data.corrections || [];
    if (!list.length) return;
    host.appendChild(el('div', { className: 'corr-heading', textContent: data.correctionsHeading || '' }));
    list.forEach((c) => {
      const block = el('div', { className: 'corr-block' });
      block.appendChild(el('div', { className: 'corr-title', textContent: c.title }));
      if (c.subtitle) block.appendChild(el('div', { className: 'corr-sub', textContent: c.subtitle }));
      (c.warnings || []).forEach((w) => block.appendChild(el('div', { className: 'corr-warn', textContent: w })));

      const kpis = el('div', { className: 'kpis' });
      (c.kpis || []).forEach((k) => {
        const kpi = el('div', { className: 'kpi' });
        kpi.appendChild(el('div', { className: 'label', textContent: k.label }));
        kpi.appendChild(el('div', { className: 'value', textContent: k.value }));
        kpis.appendChild(kpi);
      });
      block.appendChild(kpis);

      block.appendChild(el('div', { className: 'corr-section-title', textContent: c.compareTitle }));
      const table = el('table');
      const thead = el('thead'), hr = el('tr');
      c.compareHead.forEach((h, i) => hr.appendChild(el('th', { className: i ? 'num' : '', textContent: h })));
      thead.appendChild(hr); table.appendChild(thead);
      const tbody = el('tbody');
      c.compareRows.forEach((r) => {
        const tr = el('tr');
        r.forEach((v, i) => tr.appendChild(el('td', { className: i ? 'num' : '', textContent: v })));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      const tfoot = el('tfoot'), fr = el('tr');
      c.compareFoot.forEach((v, i) => fr.appendChild(el('td', { className: i ? 'num' : '', textContent: v })));
      tfoot.appendChild(fr); table.appendChild(tfoot);
      block.appendChild(table);

      block.appendChild(el('div', { className: 'corr-section-title', textContent: c.stepsTitle }));
      const steps = el('table', { className: 'steps' });
      const sb = el('tbody');
      c.steps.forEach((s) => {
        const tr = el('tr', { className: 'step-' + s.kind });
        tr.appendChild(el('td', { textContent: s.label }));
        tr.appendChild(el('td', { className: 'num', textContent: s.value || '' }));
        sb.appendChild(tr);
      });
      steps.appendChild(sb);
      block.appendChild(steps);
      if (c.note) block.appendChild(el('div', { className: 'corr-note', textContent: c.note }));
      host.appendChild(block);
    });
  }

  // Same content as renderCorrections(), drawn into the jsPDF document.
  function pdfCorrections(doc, data, startY, marginX, tableMargin) {
    const list = data.corrections || [];
    if (!list.length) return;
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const textWidth = pageWidth - marginX * 2;
    let y = startY;
    const ensure = (h) => { if (y + h > pageHeight - 16) { doc.addPage(); y = 18; } };
    const text = (str, size, style, color, gap) => {
      doc.setFontSize(size);
      doc.setFont(undefined, style);
      doc.setTextColor.apply(doc, color);
      const lines = doc.splitTextToSize(str, textWidth);
      ensure(lines.length * size * 0.45 + 2);
      doc.text(lines, marginX, y);
      y += lines.length * size * 0.45 + (gap || 2);
    };

    // Each correction starts on a fresh page, so the comparison and the
    // settlement read as one unit.
    list.forEach((c, idx) => {
      doc.addPage();
      y = 18;
      if (idx === 0 && data.correctionsHeading) text(data.correctionsHeading.toUpperCase(), 8.5, 'bold', COLOR.accent, 3);
      text(c.title, 13, 'bold', COLOR.ink, 1.5);
      if (c.subtitle) text(c.subtitle, 9, 'normal', COLOR.muted, 2);
      (c.warnings || []).forEach((w) => text(w, 8.5, 'normal', [138, 90, 0], 2));

      doc.autoTable({
        startY: y + 2,
        body: [c.kpis.map((k) => k.label.toUpperCase()), c.kpis.map((k) => k.value)],
        theme: 'grid',
        margin: tableMargin,
        styles: { fontSize: 7.5, cellPadding: 3.5, lineColor: COLOR.border, lineWidth: 0.3 },
        didParseCell: (h) => {
          if (h.row.index === 0) { h.cell.styles.textColor = COLOR.muted; h.cell.styles.fontSize = 6.8; }
          else { h.cell.styles.textColor = COLOR.ink; h.cell.styles.fontStyle = 'bold'; h.cell.styles.fontSize = 9.5; }
        },
      });
      y = doc.lastAutoTable.finalY + 8;

      text(c.compareTitle, 10, 'bold', COLOR.ink, 1);
      doc.autoTable({
        startY: y,
        margin: tableMargin,
        head: [c.compareHead],
        body: c.compareRows,
        foot: [c.compareFoot],
        styles: { fontSize: 7, cellPadding: 1.6 },
        // Month names and amounts stay on one line; only headers may wrap.
        columnStyles: { 0: { minCellWidth: 24 }, 5: { minCellWidth: 19 } },
        headStyles: { fillColor: COLOR.ink, textColor: 255 },
        footStyles: { fillColor: COLOR.bgSoft, textColor: COLOR.ink, fontStyle: 'bold' },
        didParseCell: (h) => { if (h.column.index >= 1) h.cell.styles.halign = 'right'; },
      });
      y = doc.lastAutoTable.finalY + 8;

      text(c.stepsTitle, 10, 'bold', COLOR.ink, 1);
      doc.autoTable({
        startY: y,
        margin: tableMargin,
        body: c.steps.map((s) => [s.label, s.value || '']),
        theme: 'plain',
        styles: { fontSize: 8.5, cellPadding: { top: 1.4, bottom: 1.4, left: 2, right: 2 }, textColor: COLOR.ink },
        columnStyles: { 1: { halign: 'right', cellWidth: 48 } },
        didParseCell: (h) => {
          const kind = c.steps[h.row.index].kind;
          if (kind === 'section') { h.cell.styles.fontStyle = 'bold'; h.cell.styles.textColor = COLOR.accent; h.cell.styles.cellPadding = { top: 3.2, bottom: 1.2, left: 2, right: 2 }; }
          if (kind === 'item' && h.column.index === 0) h.cell.styles.cellPadding = { top: 1.4, bottom: 1.4, left: 8, right: 2 };
          if (kind === 'subtotal' || kind === 'total') h.cell.styles.fontStyle = 'bold';
          if (kind === 'total' || kind === 'result') h.cell.styles.fillColor = COLOR.bgSoft;
          if (kind === 'result') { h.cell.styles.fontStyle = 'bold'; h.cell.styles.fontSize = 9.5; }
        },
        didDrawCell: (h) => {
          const kind = c.steps[h.row.index] && c.steps[h.row.index].kind;
          if (h.section === 'body' && (kind === 'subtotal' || kind === 'total' || kind === 'result')) {
            doc.setDrawColor.apply(doc, kind === 'result' ? COLOR.ink : COLOR.border);
            doc.setLineWidth(kind === 'result' ? 0.5 : 0.3);
            doc.line(h.cell.x, h.cell.y, h.cell.x + h.cell.width, h.cell.y);
          }
        },
      });
      y = doc.lastAutoTable.finalY + 6;
      if (c.note) text(c.note, 8, 'normal', COLOR.muted, 2);
    });
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

    // Main data table. Beyond five columns the default 9pt/3mm cells no longer
    // fit the portrait page width, so the type and padding tighten a step.
    const colCount = (data.tableHead || []).length;
    const wideTable = colCount > 5;
    const numericCols = {};
    for (let i = 1; i < colCount; i++) numericCols[i] = { halign: 'right' };

    doc.autoTable({
      startY: y,
      margin: tableMargin,
      head: [data.tableHead],
      body: data.tableRows,
      foot: [data.tableFoot],
      styles: { fontSize: wideTable ? 7.5 : 9, cellPadding: wideTable ? 2 : 3 },
      columnStyles: Object.assign({}, numericCols, { 0: { minCellWidth: 30 } }),
      headStyles: { fillColor: COLOR.ink, textColor: 255 },
      footStyles: { fillColor: COLOR.bgSoft, textColor: COLOR.ink, fontStyle: 'bold' },
      // Every column but the first holds a number, and the table has grown
      // from five columns to seven, so the alignment is derived from the
      // actual header rather than listed by hand (set above, together with a
      // minimum width that keeps "November 2025 *" on one line).
      // columnStyles' halign is only honored for the "body" section in this
      // jsPDF-AutoTable build, so the header labels and the TOTAL row fall
      // back to left-aligned while the values above them are right-aligned.
      // didParseCell fires for every section, so aligning here covers head,
      // body and foot alike and keeps each numeric column flush right.
      didParseCell: (hookData) => {
        if (hookData.column.index >= 1) {
          hookData.cell.styles.halign = 'right';
        }
      },
    });

    if (data.tableNote) {
      doc.setFontSize(7.5);
      doc.setFont(undefined, 'normal');
      doc.setTextColor.apply(doc, COLOR.muted);
      doc.text(doc.splitTextToSize(data.tableNote, pageWidth - marginX * 2), marginX, doc.lastAutoTable.finalY + 5);
    }

    pdfCorrections(doc, data, doc.lastAutoTable.finalY + 12, marginX, tableMargin);

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
