#!/usr/bin/env python3
"""Build the website homepage as ONE self-contained file.

The Cloudflare Worker serves the homepage from R2 `pages/home.html` and cannot serve extra files next to it,
so the bot style sheet (src/site/bots.css) and the bot code (src/site/bots.js) are put inline.
Output: dist/site-publish/home.html   (upload with: wrangler r2 object put wayzerr-updates/pages/home.html ... --remote)
"""
import os

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
site = os.path.join(root, 'src', 'site')
read = lambda n: open(os.path.join(site, n), encoding='utf-8').read()

page = read('index.html')
css_tag = '<link rel="stylesheet" href="/bots.css">'
js_tag = '<script src="/bots.js"></script>'
assert page.count(css_tag) == 1 and page.count(js_tag) == 1, 'bots.css / bots.js tags not found exactly once'
js = read('bots.js')
assert '</script' not in js.lower()
page = page.replace(css_tag, '<style id="wz-bots">\n' + read('bots.css') + '</style>')
page = page.replace(js_tag, '<script id="wz-bots-js">\n' + js + '\n</script>')

out_dir = os.path.join(root, 'dist', 'site-publish')
os.makedirs(out_dir, exist_ok=True)
out = os.path.join(out_dir, 'home.html')
open(out, 'w', encoding='utf-8').write(page)
print('wrote', out, len(page.encode('utf-8')), 'bytes')
