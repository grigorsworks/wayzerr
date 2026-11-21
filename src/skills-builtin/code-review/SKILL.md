---
name: code-review
description: Review code or a change for bugs, risks and clarity, and report findings ranked by severity.
---

# Code review
Read the whole change, then the code around it. Look for: wrong conditions, missing error handling, off-by-one, unchecked input, security holes (injection, secrets, auth), race conditions, resource leaks, broken callers, missing tests.
Report as a list, most serious first: file and line, what is wrong, a concrete failing example, a suggested fix. Separate real bugs from style opinions, and say nothing when nothing is wrong. Do not change code unless asked.
