# 产品宣传册与介绍册

这里保留 **2026-10-13 历史版本**，不是新上线说明或当前 AI 可用性证明。

- [产品宣传册 · 6 页](archive/结对编程智能体-产品宣传册.pdf)
- [产品介绍册 · 12 页](archive/结对编程智能体-产品介绍册.pdf)
- [可编辑制作源码](build_brochures.py) · [排版验证](validate_brochures.py)
- `assets/`：制作所需的六张历史演示/验收截图；在用双 IP 图像复用仓库 `web/public/generated/`。

## 本地重制

从仓库根目录，用自己的 Python 虚拟环境运行：

```powershell
python -m pip install -r docs/brochures/requirements.txt
python docs/brochures/build_brochures.py
python docs/brochures/validate_brochures.py
```

输出位于已忽略的 `.runtime/brochures-rebuild/`，不会覆盖 `archive/` 中原版成品。源码只调整目录与字体配置，保留原正文、版式和历史状态说明。

默认使用 Windows 本机的微软雅黑字体；仓库**不附独立字体安装文件**。PDF 包含渲染所需的字体子集嵌入，公开或商业再分发前仍须核验对应字体授权。其他系统需提供有授权、支持中文且 ReportLab 能嵌入的 TrueType 字体：

```powershell
$env:BROCHURE_FONT_REGULAR = '你的中文常规字体绝对路径.ttf'
$env:BROCHURE_FONT_BOLD = '你的中文粗体字体绝对路径.ttf'
```

换字体可能改变换行，须重新检查 18 页版面。历史 PDF 和重制 PDF 的时间戳/内部标识可能不同，不能只凭二进制散列判断视觉变化。构建脚本不联网、不调用模型、不读取数据库；验证仅检查页数、文本、字体嵌入、链接与文字越界，不能代替人工视觉检查。

## 权利和使用边界

截图为项目演示/合成验收场景。页面保留模型服务未验收、功能演示等原说明。参考来源仅为原版编排研究引用，不表示大厂合作或背书。用户提供 IP、编程猫相关图像及所用字体不因进入私有仓库而获得新的公开/商业再分发许可。
