# Regenerates the phone app's light theme (the <style id="light"> block) from its dark styles.
import re, subprocess, sys
p = 'src/mobile/index.html'; s = open(p).read()
s = re.sub(r'\n<style id="light">.*?</style>', '', s, flags=re.S)
css = re.search(r'<style>(.*?)</style>', s, re.S).group(1)
open('/tmp/m-dark.css', 'w').write(css)
subprocess.run(['node', 'scripts/make-light.js', '/tmp/m-dark.css', '/tmp/m-light.css', 'scripts/light-vars-mobile.css'], check=True)
light = open('/tmp/m-light.css').read()
s = s.replace('</style>', '</style>\n<style id="light">' + light + '</style>', 1)
open(p, 'w').write(s)
