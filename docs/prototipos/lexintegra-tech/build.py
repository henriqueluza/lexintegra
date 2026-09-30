"""Gera um HTML portátil com fontes e logo locais incorporadas."""
from pathlib import Path
from base64 import b64encode
root = Path(__file__).resolve().parents[3]
folder = Path(__file__).resolve().parent
fonts = [
 ('IBM Plex Sans', '400', '@fontsource+ibm-plex-sans@*/node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2'),
 ('IBM Plex Sans', '500', '@fontsource+ibm-plex-sans@*/node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2'),
 ('IBM Plex Sans', '600', '@fontsource+ibm-plex-sans@*/node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2'),
 ('Archivo', '100 900', '@fontsource-variable+archivo@*/node_modules/@fontsource-variable/archivo/files/archivo-latin-wght-normal.woff2'),
 ('Source Serif 4', '200 900', '@fontsource-variable+source-serif-4@*/node_modules/@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2')
]
css = ''
for name, weight, pattern in fonts:
    path = next((root / 'node_modules/.pnpm').glob(pattern))
    data = b64encode(path.read_bytes()).decode()
    css += f'@font-face{{font-family:"{name}";font-style:normal;font-weight:{weight};font-display:swap;src:url(data:font/woff2;base64,{data}) format("woff2");}}\n'
logo = b64encode((root / 'apps/web/public/imagens/logo-lexintegra.png').read_bytes()).decode()
script = (folder / 'app.js').read_text().replace('__LOGO__', 'data:image/png;base64,' + logo)
html = (folder / 'template.html').read_text().replace('/* FONTES */', css).replace('/* ESTILOS */', (folder / 'style.css').read_text()).replace('/* SCRIPT */', script)
output = folder / 'index.html'
output.write_text(html)
print(f'{output}: {output.stat().st_size:,} bytes')
