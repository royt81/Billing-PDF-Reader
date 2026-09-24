# Billing PDF Reader

Drop one or more Rabot Energy "Abrechnung" PDFs to extract consumption, costs,
Abschlag and Guthaben/Nachzahlung, with combined totals across files, a monthly
breakdown with period filtering, Excel export, and a printable PDF report.
Formerly bundled with the Logger Helper extension; now a standalone web tool.

## Files

| File | Purpose |
| --- | --- |
| `index.html` + `billing-pdf-reader.js` | The main tool: PDF parsing (pdf.js), overview, monthly breakdown, Excel export. |
| `billing-report.html` + `billing-report.js` | Pop-out report page; builds a real PDF via jsPDF + jspdf-autotable. Data is handed over through localStorage (same origin). |
| `pdf.min.js` / `pdf.worker.min.js` | pdf.js 3.11.174, for text extraction. |
| `jspdf.umd.min.js` / `jspdf.plugin.autotable.min.js` | jsPDF 4.2.1 + AutoTable 5.0.8, for the PDF report. |
| `xlsx.full.min.js` | SheetJS Community 0.20.3, for the Excel export. |

## Billing corrections (Abrechnungskorrektur)

Upload the correction together with the original bill (in any order). The tool:

- replaces consumption, prices and costs of the corrected months with the corrected figures, but keeps the Abschläge from the original bill (the correction prints none for those months);
- keeps the original bill in the overview, marked "ersetzt durch …", without counting its replaced consumption/costs twice;
- adds an "Abrechnungskorrektur" section (on the page, in the PDF report and as an Excel sheet) with a month-by-month comparison of original vs. corrected figures and the settlement: original bill → correction → offset of the correction's credit against the amount still open from the original bill.

If the original bill is not uploaded, its costs are taken from the correction and a warning asks for the original (paid Abschläge and the open amount are otherwise unknown).

## Hosting (GitHub Pages)

1. GitHub repo → Settings → Pages → Source: *Deploy from a branch*, branch `main`, folder `/ (root)`.
2. The tool is then served at `https://<user>.github.io/Billing-PDF-Reader/`.
3. Add that URL to the Logger via the Tools sidebar (edit → *+ Add tool*) or through the Logger Settings Tool JSON.

> Note: this tool is built for our company's invoice templates ("Abrechnung im
> Detail" / "Abrechnung Stromlieferung") and will not parse PDFs from other
> providers.
