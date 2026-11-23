#!/usr/bin/env python3
# Bati index.html apati src/app.html (stil + antèt yo antre ladan l).
import os, re, urllib.parse
R = os.path.dirname(os.path.abspath(__file__))
rd = lambda p: open(os.path.join(R, p), encoding='utf-8').read()
ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#0F6E56"/><ellipse cx="20" cy="17" rx="9.5" ry="12.5" fill="#1D9E75"/><ellipse cx="20" cy="16.5" rx="6.4" ry="8.6" fill="#EF9F27"/><ellipse cx="20" cy="16" rx="3.4" ry="4.6" fill="#0C447C"/></svg>'
t = rd('src/app.html')
for k, v in {'__CSS__': rd('src/style.css.html'), '__HEADER__': rd('src/header.html'), '__ICON__': urllib.parse.quote(ICON)}.items():
    t = t.replace(k, v)
left = re.findall(r'__[A-Z]+__', t)
assert not left, left
open(os.path.join(R, 'index.html'), 'w', encoding='utf-8').write(t)
print('ok', len(t))
