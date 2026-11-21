---
name: slack-gif-creator
description: Make short animated GIFs (reactions, emoji, loops) with code.
---

# Animated GIFs
Draw frames with python `Pillow` (small: 128x128 for emoji, 480 wide otherwise), 10 to 24 frames, 60 to 100 ms each, loop forever, limited palette. Simple motion: bounce, shake, pulse, spin. Save with `frames[0].save('x.gif', save_all=True, append_images=frames[1:], duration=80, loop=0, optimize=True)`; keep it under 1 MB. Open it to check.
