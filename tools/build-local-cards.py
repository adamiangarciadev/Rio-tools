from pathlib import Path
import csv,re,fitz,qrcode,sys
from fontTools.ttLib import TTFont
mm=72/25.4;out=Path('apps/archivos-administrativos/tarjetas');out.mkdir(parents=True,exist_ok=True);tmp=Path('tmp/pdfs');tmp.mkdir(parents=True,exist_ok=True)
for weight in ['book','bold']:
 f=TTFont('assets/identity/gotham-'+weight+'.woff2');f.flavor=None;f.save(tmp/('gotham-'+weight+'.otf'))
svg=fitz.open('assets/identity/rio-logo-coral.svg');vector=fitz.open('pdf',svg.convert_to_pdf());vector.save(tmp/'rio-logo-vector.pdf')
slug=sys.argv[1]
keys={'avellaneda':'AVELLANEDA','nazca':'NAZCA','quilmes':'QUILMES','corrientes':'CORRIENTES','lamarca':'LAMARCA','sarmiento':'SARMIENTO','pueyrredon':'PUEYRREDON','castelli':'CASTELLI','web':'AVELLANEDA (WEB)'}

records=list(csv.DictReader(Path('apps/envios/locales.csv').read_text(encoding='utf-8-sig').splitlines()))
order=[keys[slug]]*10
by={r['SUCURSAL']:r for r in records}
font=fitz.Font(fontfile=str(tmp/'gotham-bold.otf'));book=fitz.Font(fontfile=str(tmp/'gotham-book.otf'))
doc=fitz.open();p=doc.new_page(width=210*mm,height=297*mm)
for weight in ['book','bold']:p.insert_font(fontname='Gotham'+weight,fontfile=str(tmp/('gotham-'+weight+'.otf')))
ink=(48/255,43/255,42/255);muted=(.38,.35,.34)
p.insert_text((15*mm,13*mm),'TARJETAS DE LOCALES',fontname='Gothambold',fontsize=10,color=ink)
p.insert_text((15*mm,19*mm),'10 tarjetas del mismo local · Dirección, teléfono y WhatsApp',fontname='Gothambook',fontsize=8,color=muted)
logo=fitz.open(tmp/'rio-logo-vector.pdf');codes=[]
for i,key in enumerate(order):
 r=by[key];x=(15+(i%2)*90)*mm;y=(27+(i//2)*48)*mm
 name={'PUEYRREDON':'PUEYRREDÓN','AVELLANEDA (WEB)':'WEB'}.get(key,key)
 p.show_pdf_page(fitz.Rect(x+6*mm,y+3*mm,x+30*mm,y+19.2*mm),logo,0)
 size=14
 while font.text_length(name,fontsize=size)>49*mm:size-=.25
 p.insert_text((x+35*mm,y+12*mm),name,fontname='Gothambold',fontsize=size,color=ink)
 p.draw_line((x+6*mm,y+21*mm),(x+84*mm,y+21*mm),color=(.89,.85,.83),width=.6)
 street=r['DIRECCION'].title().replace('Av ','Av. ')+ ' '+r['ALTURA']
 local='CABA' if r['LOCALIDAD']=='CABA' else r['LOCALIDAD']+', Buenos Aires'
 def line(text,yy,size=9):
  while book.text_length(text,fontsize=size)>55*mm:size-=.25
  p.insert_text((x+6*mm,y+yy*mm),text,fontname='Gothambook',fontsize=size,color=ink)
 line(street,28);line(local,33,8);line(r['TELEFONO'],41,10)
 phone='549'+re.sub(r'\D','',r['TELEFONO']);url='https://wa.me/'+phone
 qr=qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M,box_size=1,border=4);qr.add_data(url);qr.make(fit=True)
 matrix=qr.get_matrix();side=21*mm;unit=side/len(matrix);qx=x+64*mm;qy=y+22*mm
 shape=p.new_shape()
 for row,values in enumerate(matrix):
  for col,black in enumerate(values):
   if black:shape.draw_rect(fitz.Rect(qx+col*unit,qy+row*unit,qx+(col+1)*unit,qy+(row+1)*unit))
 shape.finish(color=None,fill=(0,0,0));shape.commit()
 p.insert_text((x+67*mm,y+45.5*mm),'WhatsApp',fontname='Gothambook',fontsize=6.5,color=ink)
 p.insert_link({'kind':fitz.LINK_URI,'from':fitz.Rect(qx,qy,qx+side,qy+side),'uri':url})
 codes.append((i,url))
# Cut lines only around actual cards.
segments=set()
for i in range(len(order)):
 xx=15+(i%2)*90;yy=27+(i//2)*48
 for seg in [(xx,yy,xx+90,yy),(xx,yy+48,xx+90,yy+48),(xx,yy,xx,yy+48),(xx+90,yy,xx+90,yy+48)]:segments.add(seg)
for a,b,c,d in segments:p.draw_line((a*mm,b*mm),(c*mm,d*mm),color=(.58,.55,.53),width=.55,dashes='[2 2] 0')
p.insert_text((15*mm,278*mm),'A4 · Imprimir al 100% / tamaño real · Recortar por la línea punteada',fontname='Gothambook',fontsize=8,color=muted)
p.insert_text((15*mm,284*mm),'Tarjetas de 90 × 48 mm · QR directo a WhatsApp · Sin ajustar a página',fontname='Gothambook',fontsize=7,color=muted)
doc.set_metadata({'title':'RÍO · Tarjetas A4 · '+keys[slug],'author':'RÍO'})
path=out/('rio-tarjetas-'+slug+'-a4.pdf');doc.save(path,garbage=4,deflate=True)
check=fitz.open(path)
assert len(check[0].get_links())==10
name={'PUEYRREDON':'PUEYRREDÓN','AVELLANEDA (WEB)':'WEB'}.get(keys[slug],keys[slug])
labels=[span['text'] for block in check[0].get_text('dict')['blocks'] if 'lines' in block for line in block['lines'] for span in line['spans'] if span['font']=='Gotham-Bold']
assert labels.count(name)==10,(slug,labels)
if slug=='corrientes':
 Path('output/pdf').mkdir(parents=True,exist_ok=True)
 p.get_pixmap(matrix=fitz.Matrix(1.5,1.5),alpha=False).save(Path('output/pdf/rio-tarjetas-corrientes-a4.png'))
print(slug+': A4, 10 tarjetas, 10 enlaces WhatsApp comprobados.')
