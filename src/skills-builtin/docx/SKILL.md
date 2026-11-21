---
name: docx
description: Create, read and edit Word documents (.docx): reports, letters, CVs, contracts, memos. Use when the user wants a Word file or hands you one.
---

# Word documents (.docx)
1. Work on your computer (computer_run). Install once: `pip install python-docx` (or `sudo apt-get install -y pandoc` for Markdown to docx).
2. New document: write the content first (headings, short paragraphs, lists, a table only for real tabular data), then build it with python-docx: `Document()`, `add_heading`, `add_paragraph`, `add_table`, `add_picture`, set styles once (font, size 11, spacing) instead of per paragraph.
3. Editing an existing file: open it with python-docx, change only what was asked, keep styles; never rebuild the whole file.
4. Save into the shared Wayzerr Files folder so the user can open it. Name it clearly (`Report-2026-11.docx`).
5. Check: reopen the file, count paragraphs, make sure nothing is empty or cut off. Tell the user the file name and where it is.
