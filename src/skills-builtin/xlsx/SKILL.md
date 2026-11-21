---
name: xlsx
description: Create, clean and analyse spreadsheets (.xlsx, .csv): budgets, trackers, data cleanup, formulas, charts.
---

# Spreadsheets
- Use python `openpyxl` for .xlsx (formulas stay live: write `=SUM(B2:B20)` as a string) and `pandas` to clean or analyse data (`read_csv`, `groupby`, `to_excel`).
- Layout: header row bold and frozen, one table per sheet, units in headers, no merged cells in data, widths set so nothing shows ####.
- Never hard-code a result that a formula can compute. Put assumptions in their own labelled cells.
- Check: reopen, recalculate with `libreoffice --headless --convert-to xlsx`, scan for errors (#REF!, #DIV/0!).
- Save to the shared Files folder; tell the user the sheet names and what each holds.
