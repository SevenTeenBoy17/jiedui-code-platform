from pathlib import Path
import hashlib, json, os
import pdfplumber
from pypdf import PdfReader

root=Path(__file__).resolve().parents[2]
work=Path(os.environ.get('BROCHURE_WORK_DIR', str(root/'.runtime/brochures-rebuild'))).resolve()
results=[]
for kind,pages in [('产品宣传册',6),('产品介绍册',12)]:
    path=work/'pdf'/f'结对编程智能体-{kind}.pdf'
    reader=PdfReader(path)
    assert len(reader.pages)==pages
    assert len(reader.outline)==pages
    cjk_fonts=[]
    for page in reader.pages:
        for value in page['/Resources']['/Font'].get_object().values():
            f=value.get_object()
            if '/FontDescriptor' in f:
                d=f['/FontDescriptor'].get_object()
                cjk_fonts.append({'name':str(f.get('/BaseFont')),'embedded':'/FontFile2' in d,'unicode':'/ToUnicode' in f})
    assert all(x['embedded'] and x['unicode'] for x in cjk_fonts)
    assert cjk_fonts
    bad=[]
    with pdfplumber.open(path) as pdf:
        for i,page in enumerate(pdf.pages,1):
            for ch in page.chars:
                if ch['x0']<20 or ch['x1']>page.width-20 or ch['top']<8 or ch['bottom']>page.height-8:
                    bad.append({'page':i,'char':ch['text']})
    assert not bad,bad
    text='\n'.join(p.extract_text() or '' for p in reader.pages)
    for term in ['树小骥','熊猫泡泡','演示','教师']:
        assert term in text
    links=sum(len(p.get('/Annots',[])) for p in reader.pages)
    if pages==12:
        assert len(reader.pages[1].get('/Annots',[]))==9
        assert len(reader.pages[-1].get('/Annots',[]))==6
    results.append({'file':str(path),'pages':pages,'outlineEntries':len(reader.outline),'links':links,
        'cjkEmbedded':True,'selectableText':True,'outOfPageText':bad,'bytes':path.stat().st_size,
        'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
target=work/'final-validation.json'
target.write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print('PASS: 18 pages; embedded CJK fonts; searchable text; page outlines; 15 links; no out-of-page text.')
