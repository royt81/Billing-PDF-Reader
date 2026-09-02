# AI Document Reader — Concept

**Status:** Draft v1 · 2026-07-17 · no code yet, design only
**Successor / generalization of:** Billing-PDF-Reader (regex-based, Rabot-only)

## 1. Goal

A work tool that accepts energy-market documents from **any** company — invoices (Rechnungen/Abrechnungen), contract confirmations (Vertragsbestätigungen), An-/Abmeldebestätigungen, Netzbetreiber and MSB letters, meter-reading notices — and extracts a fixed set of fields into a review table with Excel export.

Unlike the current Rabot parser, no per-supplier regex templates: an AI model reads the document and returns structured data. Volume: dozens to low hundreds of documents per month, operated by a person who reviews results before using them.

## 2. Inputs

All of these must work:

| Input | Handling |
|---|---|
| Digital PDF (text layer) | Extract text directly — cheapest, most accurate |
| Scanned PDF (image-only) | Render pages to images → vision model (or OCR) |
| PNG / JPG / photo | Straight to vision model |
| Multi-page documents | Process all pages; relevant fields are often on page 1, meter readings deeper in |

Detection rule: try text extraction first; if a page yields little/no text, treat it as an image. Photos need no pre-processing if a vision-capable model is used — that's a major argument for one (see §4).

## 3. Extraction schema

One JSON object per document. **Rule: `null` over guess.** Every field carries a confidence (`high` / `low`); `low` fields get flagged for human review.

```jsonc
{
  "document": {
    "type": "invoice | contract_confirmation | registration | meter_reading_notice | msb_letter | other",
    "issuer": "company that sent the document",
    "issue_date": "YYYY-MM-DD",
    "reference_number": "invoice no. / Vorgangsnummer, if any"
  },
  "customer": {
    "name": "person or company",
    "customer_number": "Kundennummer at the issuer, if present"
  },
  "delivery_address": {            // Lieferstelle/Verbrauchsstelle — NOT the billing address
    "street": "", "house_number": "", "zip": "", "city": ""
  },
  "billing_address_differs": false, // flag + capture separately if so
  "market_ids": {
    "malo": "11-digit Marktlokations-ID",
    "melo": "33-char Messlokations-ID (optional, capture if present)",
    "meter_number": "Zählernummer"
  },
  "meter_readings": [              // ALL readings found in the document
    {
      "date": "YYYY-MM-DD",
      "value": 12345.6,
      "unit": "kWh",
      "register": "1.8.0",         // OBIS code or HT/NT/ET label as printed
      "reading_type": "customer | remote | estimated | provider_read | unknown"
    }
  ],
  "market_partners": {
    "grid_provider": "Netzbetreiber name",
    "grid_provider_code": "13-digit BDEW Codenummer, if printed",
    "msb": "Messstellenbetreiber name",
    "msb_code": "BDEW code, if printed"
  },
  "meta": {
    "source_file": "", "pages": 0,
    "confidence": { "per-field": "high|low" },
    "warnings": ["validation failures, ambiguities"]
  }
}
```

Schema notes:

- **Address:** documents often show two addresses (Rechnungsadresse vs Lieferstelle). The tool must extract the *delivery* address as primary — this is the common failure mode of naive extraction.
- **Meter readings:** an Abrechnung typically contains start + end readings, possibly per register (HT/NT). Capture *all*, as an array — never just one.
- **Netzbetreiber vs MSB vs Lieferant:** three different roles that documents mention inconsistently. The model must be prompted with definitions so it doesn't put the supplier's name into `grid_provider`.

## 4. Backend options

| | A: Cloud LLM (vision) | B: Local model | C: Hybrid rules + AI |
|---|---|---|---|
| How | Send page images/PDF to e.g. Claude API with a JSON schema | Ollama + open vision model (e.g. Qwen-VL class) on a work machine | Deterministic templates for known senders; AI only for unknown layouts |
| Accuracy | Best, incl. bad scans and photos | Noticeably weaker, esp. photos/tables | Best-of-both where templates exist |
| Cost | ~1–5 ct/document → a few €/month at this volume | Hardware + electricity only | Lowest API cost |
| Privacy | Data leaves machine — needs DPA (AVV), no-training terms; EU processing available via cloud providers | Everything stays local | Most docs never hit the API once templates accumulate |
| Effort to build | Low | Medium (setup, model eval) | High (template engine + AI path + routing) |
| Maintenance | Low | Medium | High |

**Recommendation: start with A**, designed so the extraction step is a swappable module. Rationale: at moderate volume, API cost is negligible; a vision LLM eliminates the entire OCR/pre-processing problem for scans and photos; and accuracy is the make-or-break property of this tool. Option C is the natural *evolution*, not the starting point — once real documents flow, the frequent senders reveal themselves and you can add templates where they pay off. Option B only becomes attractive if GDPR review rules out any external processing (§7).

## 5. Pipeline

```
files in (PDF/PNG/JPG…) 
  → normalize (text layer? else page images, max ~150 DPI)
  → extract   (LLM call: schema + role definitions + few-shot examples, strict JSON out)
  → validate  (deterministic checks, no AI — see §6)
  → review    (table UI, low-confidence fields highlighted, doc preview side-by-side)
  → export    (xlsx / CSV, one row per document + a readings sheet)
```

The review step is not optional at work-tool quality expectations: the AI proposes, the human confirms. The UI concept from Billing-PDF-Reader (dropzone → table → export) carries over almost unchanged; new is per-field confidence highlighting and click-through from a value to the document page it came from.

## 6. Validation layer (deterministic, post-AI)

Cheap checks that catch most hallucinations:

- **MaLo:** exactly 11 digits, first digit 1–9, check-digit verification.
- **Dates:** parseable, issue_date not in the future, reading dates within a plausible window.
- **ZIP:** 5 digits (DE).
- **Meter readings:** numeric, end ≥ start for same register; unit is a known energy unit.
- **BDEW codes:** 13 digits if present.
- **Cross-check:** if the same MaLo/meter number was seen in earlier documents, compare names/addresses and warn on mismatch (catches both AI errors and genuinely interesting discrepancies between companies' records — arguably the tool's real value).

Any failure → `warnings[]` + low confidence → highlighted in review.

## 7. GDPR (this is a work tool on customer data)

- Cloud option requires: a Data Processing Agreement (AVV) with the API provider, contractual no-training-on-inputs, ideally EU-region processing. Anthropic, OpenAI, and Azure OpenAI all offer DPAs; Azure and some others offer EU data residency.
- Minimize retention: process, extract, don't store documents at the provider (zero-retention options exist).
- The tool itself should store documents/extracts only as long as needed; the Excel export is the product.
- If the works-council/DPO review says "nothing external": fall back to Option B, accepting lower accuracy.

**Open question for Roy:** does your company already have an approved AI/API provider? That likely decides Option A vs B outright.

## 8. Evaluation before trusting it

Before rollout: collect **20–50 real documents** across as many different senders as possible, hand-label the fields (gold set), run the pipeline, measure per-field accuracy. This gold set then becomes the regression test for every prompt or model change. Without this, "it looked right on three PDFs" is all you have.

Target: ≥95% on high-confidence fields; low-confidence flags catch the rest in review.

## 9. Roadmap

1. **MVP:** drop files → LLM extraction → JSON → table → xlsx export. Single HTML page + small backend proxy for the API key (the key cannot live in a public client like the current GitHub-Pages tool — this is the one architectural break from Billing-PDF-Reader).
2. **Review UX + validation:** confidence highlighting, doc preview, validation warnings, cross-document consistency checks.
3. **Hybrid optimization:** template cache for frequent senders, API-cost reduction, optional local-model path.

## 10. Open questions

1. Approved AI provider / DPO stance? (→ §7, decides backend)
2. Should extracted data also cross-check against existing records (e.g. Balance-CSV / Logger data), or is standalone extraction enough for v1?
3. Electricity only, or also gas (different units, G-numbers)?
4. One combined tool with Billing-PDF-Reader eventually, or separate?
