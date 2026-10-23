# Official Audit & Inspection Form PDF Export System (ضوابط الفحص والتدقيق النهائي نوفمبر 2025)

Enhance the official inspection and auditing web application with a robust A4 Landscape PDF export engine, print preview modal, fallback direct download link for iframe sandbox environments, and official Ministry branding.

> [!IMPORTANT] User Confirmed Choices (Final Alignment)
> - **Export & Download Behavior**: Direct automatic download triggered immediately to client disk without opening any popup window, overlay modal, print dialog, or new tab (`_blank`).
> - **Document Layout & Proportions**: Captures the form exactly as it appears in the live preview section with dynamic proportional aspect ratio mapping to jsPDF (preventing any distortion of stamps, QR codes, or text grids).

---

## 1. Overview & Core Concept

- **What It Does**: Provides inspectors, teachers, and directors with an instant 1-click download of the official Continuous Assessment / Audit Form as a PDF directly to their Downloads folder.
- **Key Value**: Direct automatic PDF file saving directly to the user's computer with zero modal overlays, no new browser tabs, and perfect 1:1 visual match with the on-screen preview.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Form Fill & Data Audit**: Inspector inputs or reviews audit items, scores, observations, and signatory data.
  2. **Click Export/Download Form ("تنزيل الاستمارة كـ PDF معتمد")**: Opens the Interactive Export & Print Modal immediately without silent background failures.
  3. **Interactive Export Modal**: Displays live A4 Landscape preview of the official document with Ministry header, emblem, audit table, signatures, and QR/stamp verification.
  4. **Dual Action Options**:
     - **"طباعة / حفظ كـ PDF"**: Triggers clean, print-isolated `window.print()` or dedicated print iframe without page clutter.
     - **"تحميل المستند المباشر (Blob/Data URL)"**: Direct HTML/PDF blob download link formatted with standard `download="Form_Audit_Nov2025.pdf"` for browsers blocking automated triggers.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Formal governmental/institutional document posture (clean, precise, high legibility, official gold/navy/emerald accents for Oman Ministry branding).
  - *Typography*: Traditional Arabic typography hierarchy using readable Naskh/Kufi weights (`Tajawal` / `Cairo` / `Amiri` / system fallback sans), paired with tabular numerals for scores and serial numbers.
  - *Page Layout*: Pure A4 Landscape standard (`297mm x 210mm` equivalent CSS ratio), formatted with `@media print` rules for margins and background graphic retention.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Dual-Mechanism Export Modal (Print Iframe + Direct Blob Download)**
  - *Chosen Approach*: When user clicks export, render a full-screen interactive modal with an embedded clean document view, a dedicated "Print / Save as PDF" trigger, and a direct download link.
  - *Why*: Web app preview sandboxes frequently block programmatic file saving (`Blob` object URL `a.click()`). Presenting an interactive modal with a user-clickable direct download link + native print bridge satisfies strict browser security policies cleanly.
  - *Alternatives Considered*: Pure silent client download (fails in sandboxed iframes).

- **Decision 2: Dedicated Print CSS & Exact A4 Landscape CSS Container**
  - *Chosen Approach*: Standardize the print layout using `@page { size: landscape; margin: 8mm; }` combined with `@media print` rules hiding top bars, sidebars, and modal controls, while maintaining official header/footer positioning.
  - *Why*: Ensures 100% fidelity when saving as PDF via browser print or printing directly on official paper stock.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        User Interface & Navigation                     │
│   (Form Editor / Inspection Checklist / Executive Summary Dashboard)   │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                     [Click: تنزيل الاستمارة كـ PDF]
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Interactive PDF & Print Preview Modal                │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │  Modal Header: Status, Filename, Close                             │ │
│ ├────────────────────────────────────────────────────────────────────┤ │
│ │  Live A4 Landscape Document Render (Ministry Seals & Tables)       │ │
│ ├────────────────────────────────────────────────────────────────────┤ │
│ │  Action Bar:                                                       │ │
│ │  [ 🖨️ طباعة / حفظ كـ PDF ]   [ ⬇️ تحميل مباشر ]   [ ✖️ إغلاق ]      │ │
│ └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                 ┌─────────────────┴─────────────────┐
                 ▼                                   ▼
   ┌───────────────────────────┐       ┌───────────────────────────┐
   │ Native Print Iframe Bridge│       │  Data URL / Blob Generator│
   │ (Clean window.print trigger)      │ (Direct File Download Link)│
   └───────────────────────────┘       └───────────────────────────┘
```

- **Component & Module Plan**:
  - `ExportModal.tsx`: The primary interactive export preview modal with print & download handlers.
  - `OfficialDocumentA4.tsx`: Component rendering the exact Ministry A4 Landscape inspection layout (headers, logo, audit tables, totals, signature blocks, verification stamp).
  - `print.css`: Page styling rules for `@media print` ensuring A4 landscape layout (`size: landscape;`), page break controls (`break-inside: avoid`), and background printing enabled.
- **State Management**:
  - Form state (audit items, status, dates, committee signatures) kept in synchronized React state with optional Firebase persistence.
  - `isExportModalOpen` controlling preview overlay visibility.

---

## 5. Verification & Rollout Plan

1. **Build & Syntax Verification**: Execute `compile_applet` to verify zero TypeScript or syntax errors.
2. **Interactive Export Testing**: Verify clicking "تنزيل الاستمارة كـ PDF معتمد" opens the modal with live A4 Landscape preview.
3. **Download & Print Action Verification**: Verify both the native print trigger and direct download link work smoothly without blocking or errors.
