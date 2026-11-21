---
name: canvas-design
description: Make posters, covers, social images and other static visual designs as PNG or PDF with code.
---

# Static visual design
Pick a size (1080x1080, 1080x1920, A4), a grid and one focal point. Compose in HTML/SVG with real fonts, then render: `chromium --headless --screenshot` or python `cairosvg` / `weasyprint`. Big type, few elements, strong contrast, margins at least 6%. Look at the render, fix, and export PNG plus the source file.
