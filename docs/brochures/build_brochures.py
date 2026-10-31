from pathlib import Path
import json, math, re, os
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor, Color, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from PIL import Image
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
WORK = Path(os.environ.get('BROCHURE_WORK_DIR', str(ROOT / '.runtime/brochures-rebuild'))).resolve()
OUT = WORK / 'pdf'
OUT.mkdir(parents=True, exist_ok=True)
FONT_REGULAR = Path(os.environ.get('BROCHURE_FONT_REGULAR', 'C:/Windows/Fonts/msyh.ttc'))
FONT_BOLD = Path(os.environ.get('BROCHURE_FONT_BOLD', 'C:/Windows/Fonts/msyhbd.ttc'))
for font_path in (FONT_REGULAR, FONT_BOLD):
    if not font_path.is_file():
        raise FileNotFoundError('Set BROCHURE_FONT_REGULAR and BROCHURE_FONT_BOLD to licensed CJK TrueType fonts; fonts are not bundled.')
pdfmetrics.registerFont(TTFont('YaHei', str(FONT_REGULAR), subfontIndex=0))
pdfmetrics.registerFont(TTFont('YaHeiB', str(FONT_BOLD), subfontIndex=0))
pdfmetrics.registerFontFamily('YaHei', normal='YaHei', bold='YaHeiB', italic='YaHei', boldItalic='YaHeiB')
W, H = 841.89, 595.28
NAVY='#202C48'; PURPLE='#7362C9'; MUTED='#626D83'; BG='#FAF9F6'; LINE='#E0E3ED'
LAV='#F0ECFB'; MINT='#EAF5F0'; TEAL='#287566'; ORANGE='#AD6034'; PEACH='#FFF0DF'
ASSET = ROOT/'web/public/generated'
HORSE=ASSET/'pair-ip-v2/horse-plan.png'; PANDA=ASSET/'pair-ip-v2/panda-check.png'
WAVE=ASSET/'pair-ip-v2/panda-wave.png'
SCREENSHOTS = Path(__file__).resolve().parent / 'assets'
IDE=SCREENSHOTS/'final-output-1366.png'
CHECK=SCREENSHOTS/'final-check-1440.png'
CHAT=SCREENSHOTS/'final-p3-result.png'
ASSESS=SCREENSHOTS/'records-1366.png'
GROW=SCREENSHOTS/'qa-growth.png'
DATA=SCREENSHOTS/'01-overview-1440-final.png'
audit=[]

class Book:
    def __init__(self,name,kind):
        self.name=name; self.kind=kind; self.path=OUT/name
        self.c=canvas.Canvas(str(self.path),pagesize=(W,H),pageCompression=1)
        self.c.setTitle('结对编程智能体 | '+kind)
        self.c.setAuthor('结对编程智能体项目组')
        self.c.setSubject('产品方案与功能体验介绍 · 2026年10月版')
        self.n=0; self.words=[]; self.bound=[]
    def rect(self,x,y,w,h,fill=white,r=14,stroke=None):
        self.c.setFillColor(HexColor(fill) if isinstance(fill,str) else fill)
        self.c.setStrokeColor(HexColor(stroke or fill) if isinstance(stroke or fill,str) else fill)
        self.c.roundRect(x,H-y-h,w,h,r,fill=1,stroke=bool(stroke))
    def line(self,x1,y1,x2,y2,color=LINE,width=1,dash=None):
        self.c.saveState(); self.c.setStrokeColor(HexColor(color)); self.c.setLineWidth(width)
        if dash: self.c.setDash(*dash)
        self.c.line(x1,H-y1,x2,H-y2); self.c.restoreState()
    def circle(self,x,y,r,color):
        self.c.setFillColor(HexColor(color)); self.c.circle(x,H-y,r,fill=1,stroke=0)
    def text(self,s,x,y,w,size=12,color=NAVY,bold=False,leading=None):
        st=ParagraphStyle('x',fontName='YaHeiB' if bold else 'YaHei',fontSize=size,
            leading=leading or size*1.5,textColor=HexColor(color),wordWrap='CJK',spaceAfter=0)
        p=Paragraph(s,st); _,h=p.wrap(w,800)
        p.drawOn(self.c,x,H-y-h)
        self.words.append(re.sub('<[^>]+>','',s))
        self.bound.append((self.n,x,y,w,h,s[:32]))
        if y+h>557 and y<553: raise ValueError(f'overflow page {self.n}: {s[:40]} {y+h}')
        return h
    def label(self,s,x,y,fill=LAV,color=PURPLE,size=9):
        width=pdfmetrics.stringWidth(s,'YaHei',size)+18
        self.rect(x,y,width,23,fill,r=11)
        self.text(escape(s),x+9,y+4,width-12,size,color)
        return width
    def img(self,path,x,y,w,h,clip=None):
        iw,ih=Image.open(path).size
        if clip:
            cx,cy,cw,ch=clip; ratio=min(w/cw,h/ch); dw=cw*ratio; dh=ch*ratio
            xx=x+(w-dw)/2; yy=y+(h-dh)/2
            self.c.saveState(); p=self.c.beginPath(); p.rect(xx,H-yy-dh,dw,dh); self.c.clipPath(p,stroke=0)
            self.c.drawImage(str(path),xx-cx*ratio,H-yy-(ih-cy)*ratio,width=iw*ratio,height=ih*ratio,mask='auto')
            self.c.restoreState()
        else:
            ratio=min(w/iw,h/ih); dw=iw*ratio; dh=ih*ratio
            self.c.drawImage(str(path),x+(w-dw)/2,H-y-(h+dh)/2,width=dw,height=dh,mask='auto')
    def page(self,title=None,section=None,sub=None):
        if self.n: self.c.showPage()
        self.n+=1; self.rect(0,0,W,H,BG,r=0)
        self.words.append(f'\n--- {self.kind} 第{self.n}页 ---')
        self.c.bookmarkPage(f'p{self.n}')
        self.c.addOutlineEntry(title or self.kind,f'p{self.n}',level=0)
        self.text('结对编程智能体',36,18,260,9,MUTED,bold=True)
        self.text(section or self.kind,594,18,210,9,MUTED)
        self.line(36,42,W-36,42)
        self.line(36,558,W-36,558)
        self.text('产品方案与功能体验介绍  /  2026.10',36,568,440,8,MUTED)
        self.text(f'{self.kind}   {self.n:02d}',665,568,140,8,MUTED)
        if title: self.text(title,36,61,770,29,bold=True,leading=39)
        if sub: self.text(sub,38,110,760,11,MUTED)
    def note(self,s,y=524,fill=LAV):
        self.rect(36,y,770,28,fill,r=8)
        self.text(s,47,y+6,748,9,MUTED,leading=13)
    def feature(self,x,y,w,title,body,icon=None,fill=white,tag=None):
        self.rect(x,y,w,153,fill,r=15,stroke=LINE)
        tx=x+18
        if icon:
            self.img(ASSET/'student-growth'/icon,x+14,y+13,41,41); tx=x+65
        self.text(title,tx,y+21,w-(tx-x)-14,16,bold=True)
        self.text(body,x+18,y+68,w-36,11.5,MUTED,leading=18)
        if tag: self.label(tag,x+18,y+122,size=8)
    def numbered(self,n,x,y,title,body,w=230):
        self.circle(x+13,y+14,13,PURPLE); self.text(str(n),x+8,y+4,18,11,'#FFFFFF',True)
        self.text(title,x+39,y,w-40,15,bold=True)
        self.text(body,x+39,y+30,w-42,11,MUTED,leading=18)
    def arrow(self,x,y,length=30,color=PURPLE):
        self.line(x,y,x+length,y,color,1.6)
        self.line(x+length-5,y-4,x+length,y,color,1.6)
        self.line(x+length-5,y+4,x+length,y,color,1.6)
    def finish(self):
        self.c.save()
        (WORK/(self.path.stem+'.txt')).write_text('\n'.join(self.words),encoding='utf-8')
        audit.append({'file':str(self.path),'pages':self.n,'bounds':len(self.bound)})

def cover(b,detailed=False):
    b.page(section='学校 / 教师 / 教研团队')
    b.rect(447,64,358,438,LAV,r=32)
    b.circle(629,276,148,'#E1DBF8'); b.circle(750,138,25,'#D8ECE6')
    b.img(HORSE,450,144,210,313); b.img(WAVE,621,216,169,228)
    b.label('面向初中信息科技课堂',38,77)
    b.text('让思路被说清，<br/>让学习有依据。',36,131,431,33,bold=True,leading=48)
    b.text('结对编程智能体',39,257,410,23,PURPLE,True)
    b.text('产品介绍册' if detailed else '产品宣传册',40,297,370,15,MUTED)
    b.text('把任务、编程实践与教师支持\n组织在同一个学习空间。'.replace('\n','<br/>'),40,345,350,15,leading=25)
    b.text('功能全景 · 角色分工 · 课堂路径 · 试点边界' if detailed else '看见任务 · 说出思路 · 动手验证',40,425,394,10.5,MUTED)
    b.label('树小骥 · 导航员',478,460,white,PURPLE)
    b.label('熊猫泡泡 · 领航员',643,460,white,TEAL)
    b.note('当前为产品方案与功能体验版；部分页面为演示，真实 AI 与教学反馈闭环仍待整体验收。')

def promo():
    b=Book('结对编程智能体-产品宣传册.pdf','产品宣传册')
    cover(b)
    b.page('不只写出代码，更要讲清为什么。','01 / 教学价值','围绕真实问题组织学习，让过程、作品和解释各有位置。')
    for x,ico,t,body in [(36,'learning-home.png','学生知道下一步','从任务出发，先分析输入与输出，再把想法变成可以运行的作品。'),(298,'teacher-feedback.png','教师有观察入口','集中组织资源与任务，进入课堂和观察页面，关注需要进一步了解的过程。'),(560,'my-data.png','讨论有具体材料','围绕作品版本、设计稿和学生解释展开反馈，不把“运行成功”当作“已经理解”。')]:
        b.feature(x,160,246,t,body,ico,fill=white)
    b.text('希望贯通的教学路径',38,349,600,19,bold=True)
    nodes=[('任务','明确目标'),('实践','形成作品'),('证据','保留原件'),('反馈','教师判断'),('再做','重新验证')]
    for i,(t,s) in enumerate(nodes):
        x=36+i*158; b.rect(x,391,139,90,LAV if i<2 else '#F5F3EE',r=13)
        b.text(t,x+17,405,108,18,bold=True); b.text(s,x+17,441,108,11,MUTED)
        if i<4: b.arrow(x+141,435,14)
    b.note('以上为目标路径：当前任务与工坊已有实现；单任务证据、教师复核及真实画像尚未形成完整闭环。')
    b.page('一张工作台，承接一次编程实践。','02 / 编程工坊','任务、编辑区和过程记录并排呈现，减少在多个工具之间切换寻找。')
    b.rect(36,148,551,339,'#E9ECF6',r=12); b.img(IDE,42,154,539,326)
    b.numbered(1,609,166,'任务有阶段','从分析、建模走向编码、检查与反思。',193)
    b.numbered(2,609,274,'作品有版本','编写和运行程序，查看输出与保存状态。',193)
    b.numbered(3,609,384,'结果要核对','未报错不是正确，仍要比对输入与预期。',193)
    b.note('编程工坊界面示例，使用测试账号与示例作品，不含真实学生资料。截图中的输出不代表任务已完成。')
    b.page('两个伙伴，两种思考视角。','03 / 结对支持','角色用于引导学习，不替代学生动手，也不替代教师作出教学判断。')
    b.rect(36,151,374,326,PEACH,r=24); b.rect(431,151,374,326,MINT,r=24)
    b.img(HORSE,40,182,173,255); b.img(PANDA,432,179,181,259)
    b.text('树小骥',215,179,174,23,bold=True); b.label('导航员 · 梳理思路',216,220,white,ORANGE)
    b.text('先把问题想清楚',216,263,175,15,bold=True)
    b.text('目标是什么？<br/>输入和输出是什么？<br/>准备分几步完成？',216,300,175,12,MUTED,leading=23)
    b.text('熊猫泡泡',615,179,174,23,bold=True); b.label('领航员 · 检查依据',616,220,white,TEAL)
    b.text('再把依据找出来',616,263,175,15,bold=True)
    b.text('边界情况考虑了吗？<br/>哪份原件支持想法？<br/>改动之后如何再试？',616,300,175,12,MUTED,leading=23)
    b.note('已有角色界面和基础提示；AI 分层引导仍在验证。切换屏幕角色不等于两名学生之间的实际换位。')
    b.page('学习有记录，成长要回到原件。','04 / 证据取向','原件是代码、设计稿、测试记录等学习材料；不用行为次数为学生贴标签。')
    b.rect(36,151,510,313,white,r=16,stroke=LINE)
    b.img(GROW,44,160,494,295,clip=(251,97,1105,671))
    b.label('成长页面演示',42,474,LAV,PURPLE)
    b.numbered(1,568,172,'先看核心','简约版突出当前阶段与下一步。',230)
    b.numbered(2,568,280,'再看依据','详情版展示支持与冲突证据。',230)
    b.numbered(3,568,388,'最后再验证','反馈后重做，比较前后材料。',230)
    b.note('图中不是真实学情结论。简约版、详情版与反馈复核页的真实数据关联仍待接入与验证。')
    b.page('从一个任务开始，把试点做扎实。','05 / 试点建议','先小范围体验，再按证据决定是否扩展。')
    b.numbered(1,40,160,'选一项课堂任务','明确目标、评价标准与要保留的作品材料。',359)
    b.numbered(2,444,160,'完成一次功能演练','用测试账号检查任务入口、作品保存、运行与资料查看。',353)
    b.numbered(3,40,284,'确认 AI 与数据边界','核对模型可用性、教师责任、权限与必要数据范围。',359)
    b.numbered(4,444,284,'再进入受控课堂试点','由学校和教师确认条件；把缺失证据和故障如实记录。',353)
    b.rect(36,425,770,76,NAVY,r=16)
    b.text('下一步，打开《产品介绍册》',55,440,455,21,'#FFFFFF',True)
    b.text('了解全部入口、课堂使用方式和当前版本边界。',57,476,687,11,'#E1E5F1')
    b.note('当前不宣称正式上线、稳定 AI 教学效果或合规认证。真实学生试用须另行完成学校授权和验收。')
    b.finish()

def intro():
    b=Book('结对编程智能体-产品介绍册.pdf','产品介绍册')
    cover(b,True)
    b.page('先找到你的入口，再看完整的学习路径。','01 / 阅读导航','本册面向学校管理者、信息科技教师与教研团队；以初中横屏电脑课堂为主要场景。')
    entries=[('03','学生工作台','六个入口如何分工'),('04','编程工坊','任务、代码与过程记录'),('05','结对支持','双角色与帮助边界'),('06','AI 交互样例','版本依据和输出核对'),('07','测评中心','检查、记录和研究测评'),('08','思维成长','简约、详情和反馈复核'),('09','我的数据','资料分类与作品原件'),('10','教师工作空间','教学组织和教研入口'),('11','课堂使用示例','把评价放进学习过程')]
    for i,(n,t,s) in enumerate(entries):
        x=36+(i%3)*261; y=158+(i//3)*101
        b.rect(x,y,247,86,white,r=12,stroke=LINE)
        b.text(n,x+14,y+13,32,19,PURPLE,True); b.text(t,x+55,y+15,181,14,bold=True)
        b.text(s,x+55,y+45,179,10,MUTED)
        b.c.linkRect('',f'p{int(n)}',(x,H-y-86,x+247,H-y),relative=0,thickness=0)
    b.text('12  当前版本、试点清单与参考资料',38,476,740,13,bold=True)
    b.note('阅读提示：“已有入口”不等于“已全部打通”；演示页面、历史样例与待验证能力会在同页标明。')
    b.page('学生端：六个入口，各有清晰用途。','02 / 功能全景','稳定的侧栏顺序，让“去哪里”和“做什么”更容易对应起来。')
    items=[('学习首页','看老师安排，找到自己的作品和开始位置。','learning-home.png',None),('结对编程','说出困惑，与两个思考伙伴梳理或检查。','pair-programming.png','AI 能力持续验证'),('编程工坊','分析、建模、编码、运行，再解释自己的改动。','coding-workshop.png',None),('测评中心','学习检查、个人记录与研究测评分开查看。','assessment-center.png','部分为流程演示'),('思维成长','看当前判断、证据来源与下一步行动。','thinking-growth.png','前端演示'),('我的数据','分类查看资料，寻找作品和原件管理入口。','my-data.png','区分真实 / 演示')]
    for i,(t,s,ico,tag) in enumerate(items): b.feature(36+(i%3)*261,153+(i//3)*170,247,t,s,ico,tag=tag)
    b.note('图形化、Python、C++ 等入口服务于不同学习任务；不把语言数量等同教学效果或全场景验收。')
    b.page('编程工坊：让学生边做，边说明。','03 / 实践工作区','看任务阶段、改当前作品、查看过程记录，在同一空间里完成一次尝试。')
    b.img(CHECK,67,144,708,375)
    b.label('任务阶段',40,164,PEACH,ORANGE); b.label('运行与线索',349,138,LAV,PURPLE); b.label('过程记录',706,164,MINT,TEAL)
    b.note('隔离合成界面示例。“运行并检查”目前为运行与文本线索，不做逐用例比对；分析和反思有本机保存边界。')
    b.page('结对支持：先启发，再给适量帮助。','04 / 角色与规则','角色分工已进入界面；四档帮助强度属于规则设计，不是已验证的自动因材施教。')
    b.rect(36,148,274,360,LAV,r=20)
    b.img(HORSE,45,164,115,151); b.img(PANDA,168,163,121,151)
    b.text('树小骥 · 导航员',54,323,230,14,bold=True)
    b.text('帮助明确目标、输入输出与行动步骤。',54,351,230,11,MUTED)
    b.text('熊猫泡泡 · 领航员',54,400,230,14,bold=True)
    b.text('帮助检查边界、寻找依据与解释改进。',54,428,230,11,MUTED)
    levels=[('0','提问启发','用少量问题提醒思考，不给实现细节。'),('1','方向提示','指出可考虑的方向，接着追问理由。'),('2','步骤支架','给伪代码或步骤清单，不写真实代码。'),('3','局部示例','只给不超过 3 行的局部用法示例，要求解释并自行补全。')]
    for i,(n,t,s) in enumerate(levels):
        y=151+i*86; b.circle(351,y+19,17,PURPLE); b.text(n,345,y+7,21,15,'#FFFFFF',True)
        b.text(t,384,y,409,16,bold=True); b.text(s,384,y+29,406,11,MUTED,leading=17)
    b.note('会话规则决定可用档位，并非两种角色都逐档放开；在只允许提问启发的模式下，不提供可直接运行的代码。')
    b.page('AI 回复要有上下文，也要保留核对。','05 / 有边界的交互','历史测试样例：围绕已保存版本进行局部解释，不替学生完成整题。')
    b.img(CHAT,36,148,550,362)
    b.numbered(1,607,163,'知道在讨论什么','任务、角色、保存版本与会话规则可见。',197)
    b.numbered(2,607,279,'帮助后仍需思考','局部示例之后，请学生说明作用。',197)
    b.numbered(3,607,393,'模型不是结论','回复仍需核对，不能直接作为能力证明。',197)
    b.note('此图为历史测试任务中的真实 AI 回复，未使用真实学生数据；不代表当前服务已恢复或全部场景验证通过。')
    b.page('测评中心：把“现在做什么”放在前面。','06 / 学习检查与测评','用任务、反馈和明确按钮组织信息；较详细的提交、标准与说明按需展开。')
    b.img(ASSESS,36,160,490,325,clip=(251,97,1105,671))
    b.numbered(1,552,157,'学习检查','围绕目标看标准、补材料，再继续任务。',250)
    b.numbered(2,552,277,'我的记录','查看一次任务的提交、反馈和下一步。',250)
    b.numbered(3,552,397,'研究测评','按老师安排进入独立测评，独立完成作答。',250)
    b.note('图为历史流程演示，含人工编写的反馈。学习检查与个人记录真实数据待接入；研究测评另有实际入口。')
    b.page('思维成长：同一份依据，两种阅读方式。','07 / 开放的成长展示','简约版看行动，详情版看理由；教师反馈复核单独呈现。')
    b.img(GROW,36,151,497,314,clip=(251,97,1105,671))
    b.rect(553,151,253,97,LAV,r=14); b.text('A  简约版',569,162,216,17,bold=True); b.text('成长地图 + 当前阶段 + 下一步。',569,198,216,11,MUTED)
    b.rect(553,260,253,97,MINT,r=14); b.text('B  详情版',569,271,216,17,bold=True); b.text('能力主张 + 支持与冲突原件。',569,308,216,11,MUTED)
    b.rect(553,369,253,97,PEACH,r=14); b.text('C  反馈复核',569,380,216,17,bold=True); b.text('回应反馈 + 重做材料 + 前后比较。',569,417,216,11,MUTED)
    b.text('判断可以被解释、被更正；任务级与单元级始终分开。',38,486,750,12,bold=True)
    b.note('成长页面均为前端演示；真实画像和复核闭环待接入。当前部分回应仅保留在标签页，不代表教师已收到。')
    b.page('我的数据：从一件作品，找到留下的材料。','08 / 作品与资料','先看分类和作品概览，再按需要进入原件；记录数量不是成绩。')
    b.img(DATA,36,151,503,301,clip=(251,98,1179,669))
    b.numbered(1,562,153,'资料分组可见','分组查看学习过程、作品设计和反馈依据。',240)
    b.numbered(2,562,270,'作品连接原件','由作品标题与版本，进入相关代码或材料。',240)
    b.numbered(3,562,386,'管理动作有区别','查阅、下载、撤回同意和删除申请不是同一件事。',240)
    b.text('原件 → 版本 → 适用范围 → 判断理由',38,483,755,15,PURPLE,True)
    b.note('图为明确标注的设计预览，112 条、4 件作品等均为演示数字，不代表真实学生或平台运营规模。')
    b.page('教师端：围绕课前、课中和课后组织工作。','09 / 教学与教研','教学空间和教研空间分别承接日常课堂与研究工作。以下为功能结构示意，不是运行截图。')
    stages=[('课前','准备一项可观察的任务','班级 / 资源 / 任务','明确目标、评价标准、材料和允许的帮助。'),('课中','查看，再决定如何支持','今日 / 课堂 / 观察','结合过程信号与具体材料，决定如何支持。'),('课后','整理依据，复盘教学','学情 / 报告 / 导出','区别缺失、暂定和已确认；不要把行为量当能力分。')]
    for i,(k,t,ent,body) in enumerate(stages):
        x=36+i*261; b.rect(x,152,247,241,[LAV,MINT,PEACH][i],r=20)
        b.label(k,x+18,171,white,[PURPLE,TEAL,ORANGE][i])
        b.text(t,x+18,216,211,18,bold=True,leading=27)
        b.text(ent,x+18,285,211,11,bold=True); b.text(body,x+18,318,211,11,MUTED,leading=19)
    b.rect(36,414,770,86,white,r=16,stroke=LINE)
    b.text('教研空间',54,429,163,18,bold=True)
    b.text('课题 · 分析 · 画像 · 课例 · 量表 · 报告 · 导出',233,432,555,13,PURPLE,True)
    b.text('组织研究材料与测评流程；工具提供了入口，不等于已经证明教学效果。',233,466,555,11,MUTED)
    b.note('教师入口已有实现；从真实证据到教师反馈复核、再到真实画像的跨端完整流程仍待验证。')
    b.page('以“校园温度提醒器”为例，贯穿一次学习。','10 / 课堂使用建议','以下为教学设计示例，不是已完成的真实课堂实验或自动化闭环。')
    rows=[('01','明确问题','约定温度输入范围、活动建议与异常处理。','留下：任务目标与规则说明'),('02','先预测，再编程','学生写正常、边界、异常输入的预期结果。','留下：分析表、伪代码、作品版本'),('03','运行并解释','运行程序，人工比对预期与实际；说明改动原因。','留下：输入、输出、修改说明'),('04','教师反馈后再做','针对同一标准提出建议，用新输入或变式题复核。','留下：反馈、再做材料与复核理由')]
    for i,(n,t,body,ev) in enumerate(rows):
        y=150+i*85; b.rect(36,y,770,74,white,r=13,stroke=LINE)
        b.text(n,51,y+16,43,21,PURPLE,True); b.text(t,106,y+10,157,15,bold=True)
        b.text(body,273,y+10,509,11.5,MUTED,leading=18)
        b.text(ev,273,y+44,509,10,TEAL)
        if i<3: b.line(70,y+74,70,y+85,PURPLE,1.5)
    b.note('当前工坊不自动完成逐用例比对；教师反馈送达、低支架再做与效果复核需在后续真实闭环中验收。')
    b.page('了解当前边界，再决定怎样试用。','11 / 版本说明与准备清单','内容核对日期：2026 年 10 月 13 日。本册介绍产品，不构成上线、安全或教学效果认证。')
    b.rect(36,150,374,241,white,r=17,stroke=LINE)
    b.text('当前可了解与演练',53,164,338,18,bold=True)
    b.text('• 学生六入口与教师教学 / 教研导航<br/>• 工坊编写、运行、输出与版本保存<br/>• 双角色界面与本地引导<br/>• 独立测评、资料分类和管理入口',54,209,337,11.5,leading=27)
    b.text('仍待真实闭环验收',54,331,337,15,PURPLE,True)
    b.text('AI 稳定性、单任务证据、教师反馈复核、真实画像。',54,357,337,10.5,MUTED)
    b.rect(431,150,374,241,LAV,r=17)
    b.text('学校试点前，确认这五件事',448,164,339,18,bold=True)
    b.text('1  明确试点任务、教师责任和退出条件。<br/>2  用合成账号演练，不先导入真实学生资料。<br/>3  核对模型、浏览器与运行环境可用性。<br/>4  审查数据范围、角色权限和同意流程。<br/>5  核对评价原件和异常恢复，再扩展使用。',449,209,334,11.5,leading=29)
    b.text('编排参考',38,408,740,13,bold=True)
    sources=[('Apple · Everyone Can Code','https://www.apple.com/education/docs/everyone-can-code-curriculum-guide.pdf'),('Google · Education Standard','https://services.google.com/fh/files/misc/education_standard_onepager.pdf'),('Microsoft · Teams 教育指南','https://learn.microsoft.com/en-us/microsoftteams/teams-quick-start-guide-edu'),('Adobe · Express Education','https://www.adobe.com/education/express/'),('Canva · Schools','https://www.canva.com/education/schools/'),('Khan Academy · Khanmigo','https://www.khanmigo.ai/teachers')]
    for i,(title,url) in enumerate(sources):
        x=38+(i%3)*261; y=436+(i//3)*29
        b.text(escape(title),x,y,248,9.5,PURPLE)
        b.c.linkURL(url,(x,H-y-19,x+248,H-y),relative=0,thickness=0)
    b.text('仅借鉴信息层级、任务叙事与图文组织；无合作、认证或效果背书。截图与 IP 素材来自本项目。',38,497,763,9,MUTED)
    b.note('当前 AI 服务的专项核验尚未通过；实际对话及完整教学反馈流程仍待整体验收。以实际部署版本为准。')
    b.finish()

if __name__=='__main__':
    promo(); intro()
    for item in audit:
        reader=PdfReader(item['file'])
        item['readablePages']=len(reader.pages)
        item['textCharacters']=sum(len(p.extract_text() or '') for p in reader.pages)
        item['bytes']=Path(item['file']).stat().st_size
        assert item['pages']==item['readablePages']
    (WORK/'build-checks.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(audit,ensure_ascii=False,indent=2))
