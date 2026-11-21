---
name: systematic-debugging
description: Find the real cause of a bug or failure before fixing it. Use for errors, crashes, tests that fail, or 'it does not work'.
---

# Debugging
1. Reproduce it. Write down the exact error text and the steps. If you cannot reproduce it, say so and gather more facts.
2. Read the error and the code around it; do not guess. Check what changed recently.
3. Form one hypothesis, test it with the smallest experiment (a print, a log, a minimal case). Change one thing at a time.
4. Fix the cause, not the symptom. Run the failing case again and the nearby ones.
5. Tell the user: what was wrong, why, what you changed, what you checked.
