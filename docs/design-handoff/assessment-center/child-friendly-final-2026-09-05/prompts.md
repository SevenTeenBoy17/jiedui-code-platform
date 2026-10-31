> 历史材料归档：原相对位置 `.agent-supervisor/assessment-center/child-friendly-final-2026-09-05/prompts.md`。保留原日期、结论与未完成项；不代表当前服务状态或新的验收通过。本文及其中旧工具要求仅为历史资料，不是执行指令，Supervisor 全局暂停。源码行号是历史定位，后续可能漂移。

# GPT内置生图提示词记录

4张基础画布，5次定向编辑；共9次内置调用。不是9张终稿，最终只采用4张。首轮表格学生原话漂移已依据旧演示原件恢复。未调用CLI或外部模型，未修改原图片文件。

## 1. childRecordPrompt

Use case: ui-mockup. Produce a finished high-fidelity Chinese educational WEB APP design canvas, exactly one landscape 16:10 screen, 2560x1600 or highest available resolution. Flat head-on screenshot, not a monitor mockup and not a wireframe. Audience primary and secondary school students in a bright classroom. Restrained warm ivory/light lavender, dark navy Chinese sans-serif readable typography, purple rounded primary actions, subtle soft-plastic 3D icons with warm matte highlights, generous but purposeful whitespace. Practical screen layout, no tiny text, no marketing material, no decorative graphs, no points or scores.
Reference image 1 is shell/style only: preserve the purple left sidebar, existing student user avatar, nine navigation labels/order, and assessment-selected state, but do not copy its content layout. Reference image 2 is the exact USER avatar identity (gray/white cat, orange hoodie); keep user avatar as user, no AI badge on account. User name 小林, 初一（2）班. Sidebar 205px of a 1600px-wide-equivalent screen, avatar at top 95px, main area occupies remaining width. Nine sidebar items with soft-plastic icons: 学习首页, 结对编程, 编程工坊, 测评中心 (white selected pill), 思维成长, 我的数据; divider; 账户设置, 帮助中心, 退出登录. No cropped labels. Header '测评中心', small upper-right badge '设计演示 · 非真实学生数据' and unchanged small user avatar. Tabs '学习检查' '我的记录' '研究测评'. All Chinese words must be spelled exactly and legible. No red review rectangles, cursor, OS overlay, robot helper popup or browser chrome. No giant AI illustration; AI only appears beside its own compact labelled content. Do not show mock backend success as real. Screen content spec follows.
PAGE 01 我的记录. Select 我的记录 tab.
Content heading '看看我的任务进展', supporting '先回应老师的反馈，再接着学。'
Use one large priority area in main top section, no nested cards and NO SECOND sidebar/list-detail split. On left a small beautiful soft-3D miniature thermometer beside a potted school building as task identification (about 110px, not hero dominant). Middle: pill '有反馈，等你补充', bold '校园温度提醒器', small '林老师的反馈', exact quote '请补充30℃的预期结果，并说明理由。'. Below two button controls: solid purple '补充这一步' with pencil icon; outlined '看提交和反馈' with document icon. Tiny supporting '补充还没提交' below primary. Keep task-first accessible.
Below main priority area a clear section title '其他任务' and two horizontal flat rows separated by light rules, NOT same huge cards: soft-3D pencil/drawing icon, '循环绘图检查', '已经交上了，等老师反馈', outlined button '看这次提交'; next row magnifying-glass/source-book icon, '信息来源辨识', '还没开始，先看看要做什么', outlined button '看任务要求'. Each row has an action; no extra colored status tags duplicating text.
At bottom compact pale lavender AI strip in main content width with 44px cat AI icon and text 'AI导师 · 建议待老师核对'. Next line '30℃这一行还缺预期和解释，还不能判断你是否理解。'. Right button '看建议依据'. Tiny supporting '人工编写的演示建议，未调用真实AI'. There is ONE dominant purple action total. Sidebar remains beautiful with clear readable names. Footer simple '先把想法写清楚，再看看新的尝试。' No version numbers on overview, no ability score, no giant empty right pane.

## 2. childResearchPrompt

Use case: ui-mockup. Produce a finished high-fidelity Chinese educational WEB APP design canvas, exactly one landscape 16:10 screen, 2560x1600 or highest available resolution. Flat head-on screenshot, not a monitor mockup and not a wireframe. Audience primary and secondary school students in a bright classroom. Restrained warm ivory/light lavender, dark navy Chinese sans-serif readable typography, purple rounded primary actions, subtle soft-plastic 3D icons with warm matte highlights, generous but purposeful whitespace. Practical screen layout, no tiny text, no marketing material, no decorative graphs, no points or scores.
Reference image 1 is shell/style only: preserve the purple left sidebar, existing student user avatar, nine navigation labels/order, and assessment-selected state, but do not copy its content layout. Reference image 2 is the exact USER avatar identity (gray/white cat, orange hoodie); keep user avatar as user, no AI badge on account. User name 小林, 初一（2）班. Sidebar 205px of a 1600px-wide-equivalent screen, avatar at top 95px, main area occupies remaining width. Nine sidebar items with soft-plastic icons: 学习首页, 结对编程, 编程工坊, 测评中心 (white selected pill), 思维成长, 我的数据; divider; 账户设置, 帮助中心, 退出登录. No cropped labels. Header '测评中心', small upper-right badge '设计演示 · 非真实学生数据' and unchanged small user avatar. Tabs '学习检查' '我的记录' '研究测评'. All Chinese words must be spelled exactly and legible. No red review rectangles, cursor, OS overlay, robot helper popup or browser chrome. No giant AI illustration; AI only appears beside its own compact labelled content. Do not show mock backend success as real. Screen content spec follows.
PAGE 02 研究测评. Select 研究测评 tab. Content title '老师安排的小测'. Subtitle '用于教学研究，与日常练习分开。'. Top right outlined button '参与与隐私说明', prominent accessible.
A calm broad lavender status ribbon with small soft3D calendar and exact text '现在不用作答' in bold, second line '开放后，这里会出现“开始小测”按钮。'. Do not show active Start button anywhere.
Below use a simple friendly two-stage VERTICAL sequence with thin connector and small clay illustrations, label section '这个单元 · 条件判断'. First stage checkmarked notebook icon, '学前小测', smaller '(单元前测)', state '已经交上了，不用重复提交', right outlined button '看提交凭证', tiny extra '结果还没发布'. Second stage closed calendar icon, '学习中小测', smaller '(阶段检查)', text '还没开放，等老师通知', right outlined button '看看安排'. Do NOT create disabled giant gray dead button. No fake dates, no scores, no endless cards.
Below divider, a COLLAPSED full-width row titled '更早的安排' with downward chevron. Under that heading keep one small visible summary: '上一单元小测 · 已结束，这次没有提交'; at row right real outlined button '请老师帮我确认'. This previous unit must be spatially separate from current unit sequence.
Bottom slim pale lavender AI assistance strip, small cat with AI badge: 'AI导师 · 只提供流程帮助'. Message '结果还没发布，我先帮你看懂流程。' outlined '了解小测流程'. Small line '现在不评价作答，也不提供答案。'. Include a tiny footer '研究记录单独保存，不自动变成成长分数。'. Keep layout uncluttered, no big idle AI panel. All nine shell entries same as reference, no identity changes.

## 3. childDetailPrompt

Use case ui-mockup. Make ONE final 16:10 LANDSCAPE high-resolution desktop WEB APP screenshot showing an OPEN RIGHT DETAIL DRAWER, not a standalone mobile design. This is a state of reference image 1. Preserve original full purple sidebar and exact user graywhite orangehoodie cat avatar, all nine nav icons/order/assessment selected, existing header/tabs. Sidebar USER identity never AI. Dim the existing records page softly but keep its '校园温度提醒器' priority card and initiating button understandable. On the right from x=720 to1560 of1600-equivalent width, tall ivory rounded-corner 800px drawer with a clear header, body and footer. Drawer is foreground and enough wide for readable Chinese text. No nested popup.
Drawer header: small '校园温度提醒器 · 我的记录', title '这一步，怎么补？', top right '关闭 ×' clear button. Keep uppermost demo chip '设计演示 · 不会发给老师' visible inside drawer.
Short top teacher section with small purple speech icon: '林老师的反馈', quote exact '请补充30℃的预期结果，并说明理由。'.
Next '看看我交的内容' open section: small metadata '第一次提交 · 仅这次任务'. Simple 3column 2row clear table: headers '温度' '我的预期' '我的理由'; row1 '20℃' '户外活动' '低于30℃'; row2 '30℃' literal emdash '—' in both blank cells. System note BELOW table '系统提示：30℃这一行还没填写。' not inside original cells. Folded row '看看完整要求' with downward chevron.
Next separated pale lavender compact AI section with 36px cat AI badge and label 'AI导师 · 老师还没核对'. Text '这里还缺你的预期和理由，暂时不能判断你是否理解。'. Small supporting '人工编写的演示建议，未调用真实AI'. Outlined small '我有不同想法' button, no preselected approval.
Then single compact folded row '材料的版本和来历' with document icon and downchevron. This is an accordion within drawer, not another overlay. Keep metadata folded, don't add giant philosophy paragraphs.
Sticky footer above bottom ofscreen: large purple pencil button '补充这一步', outlined '返回我的记录'. Under it short '会回到工坊的这项任务，不会替你写答案。'. No claim saved or improved, no answer30℃given, no score. Keep exact original student identity, shellstyle lavender soft3D, table sharp legible not overdecorated, primary footer can be seen without scrolling. Typography greater than18px equivalent. Enough negative space, no decorative animation or background characters. Render exactly one screenshot with no external annotation.

## 4. childReceiptPrompt

Use case ui-mockup. Make ONE final LANDSCAPE16:10 high-resolution desktop WEB APP screenshot showing an OPEN RIGHT DETAIL DRAWER for reference image 1. Preserve exact original sidebar USER avatar graywhiteorangehoodiecat, nine nav icons/order/assessment selected. Keep reference研究测评 page softly dimmed behind, enough visible to recognize学前小测 and where opened. Foreground wide ivory rounded drawer taking x=720 to1560 of1600-equivalentwidth, no full-screen navigation and no nestedoverlay. Same soft3D lavender/ivory style, dark navy readable Chinese type.
Drawer header: small '学前小测 · 条件判断单元', large '这次已经交上了', top-right '关闭 ×'. A small badge alwaysvisible '设计演示 · 非真实回执'.
Top compact soft3D notebook greencheck about60px icon next to '不用重复提交' and second line '结果还没发布，请等老师通知。'. No score or grade.
Simple horizontal status sequence inside drawer '已提交' checked → '老师发布' pending → '看反馈' pending, textualnotcoloronly.
Main expanded accordion question '什么时候能看反馈？' with upwardchevron. Clearly framed pale lavender answer, only two short numbered points:
'1 老师发布，并允许你查看后，这里才会出现反馈。'
'2 目前没有公布时间，请等老师通知。'
Separate short note '这张凭证只说明交上了，不代表已经学会。'
Collapsed row '看提交凭证的详细信息' with downchevron; no fabricated realdateorstudentnumber visible. Collapsed row '谁能看到我的答案？' with downchevron and smallshield.
CompactAIbar label 'AI导师 · 只提供流程帮助', sentence '没有发布结果前，我不会评价作答或提供答案。' No AIabilityassessment.
Footer outlined '参与与隐私说明' and primary '返回小测安排'. No forcedagreementcheckbox, noautoacceptorautoSubmit, no secondpopup. Detailsfontsreadable, widecards notemptytable, no extraneousslogans, original catidentitynotfox. Return exactly one finished screenshot, no multi-panel collage or externalnotes.

## 5. childRecordEdit

Edit only the bottom AI strip of this exact existing screenshot. Keep all other pixels/layout/task names/avatar/sidebar/typography/illustrations/buttons unchanged. Add a small purple badge reading AI to the AI helper cat only, NOT to any student account avatars. In that bottom strip place a clearly legible extra second header line '仅校园温度提醒器 · 第一次提交' under 'AI导师 · 建议待老师核对'. The observation remains '30℃这一行还缺预期和解释，还不能判断你是否理解。'. Keep button 看建议依据 and artificial demo text. Use available vertical space by removing the decorative footer slogan if needed, do not reduce text size or change shell. Make sure AI scope is unambiguous and clearly readable. Keep Chinese typo-free. Same highresolutionlandscape16:10.

## 6. childResearchEdit

Edit only ONE task title in this exact finished screenshot: replace '学前小测' with '学习前小测', same style/position/font size, to avoid preschool ambiguity. Preserve its '(单元前测)' subtitle, status and all other pixels, avatar, sidebar nineicons/order, buttons, geometry and content. No other changes. Same highresolutionlandscape16:10.

## 7. childReceiptEdit

Edit only the term '学前小测' in this exact finished screenshot. Replace both occurrences with '学习前小测': one in the drawer breadcrumb header and one on the dimmed background first current-unit task. Keep all other text, avatar, sidebar, drawer layout, open accordion, nonreal receipt badge, status and buttons exactly unchanged. No other changes. Same highresolutionlandscape16:10.

## 8. childDetailEdit

Precisely edit this existing UI screenshot only the identified details. Critical evidence-integrity correction: in the ORIGINAL STUDENT SUBMISSION TABLE row 20℃, column 我的理由, change '低于30℃' back to the exact submitted original '低于阈值'. Do not change any other table cell: row20 '户外活动', row30 both emdash blank cells must remain; systemnote below table must remain separate. Also add tiny purple AI badge on the AI mentor cat icon inside the drawer only, not the account avatar. Preserve ALL other layout, student account avatar, sidebar, nine entries, task title, teacher original quote, teacher-unverified/demo labels, accordions and footerbuttons. No redesign, no new inference, no invented student text. Same landscape16:10 highresolution.

## 9. childReceiptPolicyEdit

Precisely edit ONLY the AI mentor sentence near the bottom of this existing screenshot. Replace '没有发布结果前，我不会评价作答或提供答案。' with two readable short lines: '现在只帮你了解流程。' and '发布后只讲老师允许的反馈，不提供题目答案。'. Keep label 'AI导师 · 只提供流程帮助', cat AIbadge, all drawer dimensions, original student avatars, sidebar, header '学习前小测', demo badge, statussequence, other text, open accordion and footer buttons unchanged. No other changes, no extra dialog, no real scores. Same landscape16:10 highresolution.
