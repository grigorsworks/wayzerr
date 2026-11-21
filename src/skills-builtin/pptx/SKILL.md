---
name: pptx
description: Make and edit PowerPoint presentations (.pptx): pitch decks, lessons, reports. Use when the user wants slides.
---

# Slides (.pptx)
1. Ask nothing the request already answers. Plan the story first: one idea per slide, 6 to 12 slides, title, the point, the proof, the next step.
2. Build with python `python-pptx` (`pip install python-pptx`): use the blank layout, one font pair, one accent colour, big text (title 36+, body 20+), at most 5 short lines per slide, images only when they help.
3. Put numbers in simple charts (`chart_data`), not tables of figures.
4. Add short speaker notes when it is a talk.
5. Save to the shared Files folder, then render a few slides to images (`libreoffice --headless --convert-to pdf`, `pdftoppm -png`) and look at them for overflow and overlap before saying it is done.
