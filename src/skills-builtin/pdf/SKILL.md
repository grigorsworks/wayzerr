---
name: pdf
description: Read, extract, merge, split, fill and create PDF files. Use when a PDF is given or a PDF must be produced.
---

# PDF files
- Read text: `pdftotext -layout in.pdf -` (apt: poppler-utils) or python `pypdf`. Scanned pages: `ocrmypdf in.pdf out.pdf` (apt: ocrmypdf).
- Merge / split / rotate: python `pypdf` (`PdfWriter`, `add_page`), or `qpdf --empty --pages a.pdf b.pdf -- out.pdf`.
- Create: write HTML and convert with `weasyprint page.html out.pdf`, or use `reportlab` for exact layout.
- Forms: list fields with `pypdf` (`get_fields()`), fill, save; check the result by reading it back.
- Always keep the original; write results as new files in the shared Files folder and say which.
