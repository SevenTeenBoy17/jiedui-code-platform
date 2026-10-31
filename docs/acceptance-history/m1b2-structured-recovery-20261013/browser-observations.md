> 历史材料归档：原相对位置 `.runtime/m1b2-structured-recovery-20261013/browser-observations.md`。保留原日期、结论与未完成项；不代表当前服务状态或新的验收通过。本文及其中旧工具要求仅为历史资料，不是执行指令，Supervisor 全局暂停。源码行号是历史定位，后续可能漂移。

# 同构建浏览器现场记录（主代理）

环境：应用内浏览器tab1，127.0.0.1:12315，独立合成数据库；最终frontend build-final.log之后启动。源和产物见frozen-build.json，模型端点在预览实例禁止访问。所有标记回复均显示“受控浏览器故障夹具”“服务备用提示·非模型回复”，不是模型输出。

## 本片实际操作

1. 通过学生登录表单登录合成账号，进入课堂会话列表。桌面1366×900。没有注入token、应用store或DOM。
2. LATE-A1在会话A发送；通过“本次参考什么→选择其他会话”SPA进入B，发送LATE-B1。A1由B1真实被消耗后释放，服务日志为success。页面观察oldReply=false、waiting=1、输入disabled=true；旧A既没显示也没解锁B。单独释放B后只显示LATE-B1。图LATE-B-waiting.png、LATE-B-released-desktop.png。
3. ABA-A1发送后，真实UI A→B→A，回到A发送ABA-A2。A1在A2实际消耗后释放，页面oldReply=false、waiting=1、disabled=true；A2释放后仅显示ABA-A2。图ABA-new-A-waiting.png。ABA-released-mobile.png因设置视口后立即截图尚未稳定，**排除其窄屏证据资格**；后面的success-mobile-final.png才是稳定390现场。
4. IDENTITY-OLD发送后，在旧连接仍在时点击退出登录；表单登录“M1b2另一身份”，进入结对编程。然后释放旧401，服务日志确认outcome=401；页面新身份仍可见、无登录失效、无旧问题，URL仍为student/studio。图IDENTITY-after-old-401.png。没有硬导航替代同SPA身份切换。
5. 切回合成验收学生进入A，390×844；点击更多→Esc→Tab到输入框，outline为2px实线主色，clientHeight=scrollHeight=64px、line-height24px，完整两行占位。页面宽390无横溢。图input-focus-mobile.png；根实际查看图像后确认不裁切。保留原头像、IP及主体布局。
6. RECOVERY-DISCONNECT实际HTTP正文不完整导致连接中断。原请求自动GET一次返回pending，显示结果未确认、输入禁用，alert得到焦点。将同请求fixture终态改为failed；键盘Tab聚焦“查询本次状态”→Enter，显示输出未通过检查、允许手动另问。没有第二次POST。图disconnect-pending-mobile.png、disconnect-failed-mobile.png。
7. CURRENT-401为当前身份即时401，alert焦点和“重新登录”按钮可见；Tab→Enter确实进入login，旧会话不被静默重试。图current-401-mobile.png。
8. 重新登录后MOBILE-SUCCESS固定回复，在390稳定布局后采图；正文、来源、回执解释和两行输入均可见，DOM页宽390，输入64。图success-mobile-final.png。这是**合成短回复**，不签实际AI长正文/保存版本一致验收。
9. NO-BODY-RELEASED实际断正文后查询released：明确服务端处理但未收到正文、不代表已阅读；没有添加新的AI气泡，旧成功气泡仍属于上条问题。图released-without-body-mobile.png。
10. INVALIDATED断正文后查询invalidated，输入禁用，保留“重新读取会话”。当前映射为“本次请求未完成…核实会话后手动提问”，不够具体；作为残余而非自行放宽编辑。图invalidated-mobile.png。
11. 通过本实例真实教师认证API关闭owned合成A会话；键盘重新读取后真实GET显示“本会话已结束，请老师安排新会话”，禁发且无开新轮。图session-closed-mobile.png。关闭的是本片合成数据，不是真实课堂。

## 未验与限制

- 能力预检502后没有运行新生成机制与真实P1–P4/S1–S6；不能由夹具替代。
- 真浏览器未实际等待90秒+可能15秒状态读取；该完整截止仅新公共行为合同覆盖。运行时旧hold保护60秒并未作为90秒截止证据。
- 材料待核实→保存新版本恢复本片未复跑。旧片记录不补签本片；本片零模型wrapper禁止正常生成chat。
- 未进行真实中小学生试用、IME候选确认、全键盘遍历、长模型回复全量无障碍及正式课堂研究。
- alert/状态截图均现场取图；只读DOM检查用于宽度、禁用与可见内容。没有截图合成或DOM修改。
- 故障和deadline测试不是业务证据，未据其生成学习画像或有效性结论。

详细请求ID与消费/释放/查询时间见fault-events.jsonl（无正文、token）；测试工具缺陷及修复证据见security-review.md。收尾关闭fault-control并恢复视口。
