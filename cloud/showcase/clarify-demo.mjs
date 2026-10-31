/** Explicit showcase copy overrides, applied only by the isolated showcase build. */
export function clarifyDemo(source, id) {
  const path = id.replaceAll('\\', '/');
  if (id.includes('?')) return null;
  if (path.endsWith('/views/student/IdeView.vue')) return source.replaceAll('云端', '演示内存');
  if (path.endsWith('/views/teacher/research/ExportView.vue')) return source
    .replace('下载脱敏后的研究数据', '下载演示数据，了解导出格式')
    .replace('已去标识化，可直接用于课题分析。', '仅含合成示例，不可用于真实课题分析。');
  if (path.endsWith('/views/teacher/research/ReportView.vue')) return source
    .replace('数据取自平台真实记录 · 学生一律以假名呈现', '全部为合成示例 · 不代表真实课堂或教学效果')
    .replace('本报告不含学生真实姓名与对话原文，学生以 S01…假名呈现；如需研究数据，请用「导出」页的脱敏数据集。', '本报告及导出文件均为合成示例，不含真实学生数据，不可作为教学效果或研究结论。');
  return null;
}
