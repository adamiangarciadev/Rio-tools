from pathlib import Path
import fitz
from fontTools.ttLib import TTFont
out=Path('assets/identity');out.mkdir(exist_ok=True)
doc=fitz.open('01_Identidad/01_Logotipo/rio-identidad.pdf')
for name,index in [('rio-logo-coral',6),('rio-logo-violet',7),('rio-logo-mint',8),('rio-symbol-coral',9),('rio-symbol-violet',10),('rio-symbol-mint',11),('rio-logo-white',0),('rio-symbol-white',3)]:
 page=doc[index];paths=[d for d in page.get_drawings() if d.get('fill') and d['rect'].get_area()<page.rect.get_area()*.8]
 bounds=fitz.Rect(paths[0]['rect'])
 for d in paths[1:]:bounds|=d['rect']
 bounds=fitz.Rect(bounds.x0-5,bounds.y0-5,bounds.x1+5,bounds.y1+5)
 page.set_cropbox(bounds)
 (out/(name+'.svg')).write_text(page.get_svg_image(),encoding='utf-8')
for name,source in [('gotham-book','Gotham/Gotham-Book.otf'),('gotham-medium','Gotham/Gotham-Medium.otf'),('gotham-bold','Gotham/Gotham-Bold.otf'),('gotham-rounded-medium','GothamRnd/GothamRnd-Medium.otf')]:
 font=TTFont('01_Identidad/00_Tipografias/'+source);font.flavor='woff2';font.save(out/(name+'.woff2'))
 print(name,(out/(name+'.woff2')).stat().st_size)
# Favicon uses the supplied symbol; never typeset a replacement logo.
Path('assets/rio-mark.svg').write_text((out/'rio-symbol-coral.svg').read_text(encoding='utf-8'),encoding='utf-8')
