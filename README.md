# PCR Workbench · PCR 工作台

**在线使用：<https://gaoyuan-0423.github.io/pcr-workbench/>** · [仓库](https://github.com/Gaoyuan-0423/pcr-workbench)

纯网页端的 qPCR 懒人分析工具：把仪器下机导出的结果文件拖进来，自动识别列和孔板，算 ΔΔCt，出可发表图表和带 ΔΔCt 的 Excel 表格。**数据只在浏览器本地处理，不上传任何服务器。**

## 功能（v0.1）

- **直接导入下机结果**：支持 Bio-Rad CFX、Thermo QuantStudio / StepOne、Roche LightCycler、Qiagen Rotor-Gene 等仪器软件导出的 `.xlsx / .xls / .csv / .tsv / .txt`；中英文列名自动识别（含 LightCycler 的 `CP`、`Detection Cell` 等非标准叫法），UTF-8 / GBK 编码自动识别；多工作表时弹出选择器。
- **孔板自动识别**：检出孔位列后自动渲染 96 / 384 孔板视图，按基因着色，点击孔位整组剔除 / 恢复；无孔位列自动降级为表格模式。
- **ΔΔCt 引擎（Livak 法）**：复孔自动聚合；**多内参基因池化**；ΔΔCt 与 Fold Change 按每个生物学重复计算。
- **统计**：2 组自动 Welch t 检验，多组单因素 ANOVA + **Dunnett vs 对照多重比较校正**，均在**个体 ΔCt** 上进行（方法学正确做法）；p 值经不完全 beta 函数与多元 t 数值积分精确计算，图表星号取校正后显著性。
- **QC**：Cq 上下限、缺值检测、复孔绝对偏差与 z 分数离群标记，人工复核后一键剔除。
- **NTC 污染检查**：自动识别 Task 列或样本名（NTC / NTC-1 等惯例）标记的无模板对照孔，逐基因判定——提前扩增（Cq < 35）判疑似污染并告警，晚期扩增提示关注，NTC 自动排除在分析之外，检查结果随 Excel 一并导出。内参基因的 NTC 同样检查。
- **导出**：多 sheet Excel（ΔΔCt 结果 / 原始数据+QC / 项目信息）、结果 CSV、图表 SVG（矢量）与 PNG。
- 项目自动保存在浏览器本地（IndexedDB），刷新后可恢复。

## 不支持的（诚实声明）

- 不解析仪器专有二进制格式（`.eds` / `.pcrd` / `.rex` / `.ixo`）——请先在仪器软件里导出为表格文件，这也是各家仪器软件的官方推荐交换方式。
- v1.2 不含扩增效率校正（Pfaffl 法）、标准曲线、熔解曲线自动判定——在路线图上。

## 开发

```bash
npm install
npm run dev        # 本地开发 http://localhost:5173
npm test           # Vitest 单元测试（核心数学与解析逻辑）
npm run build      # 类型检查 + 产物构建
npx playwright test # E2E 冒烟（导入→映射→配置→结果→导出）
```

技术栈：Vite + React 19 + TypeScript，纯前端，无后端。运行时依赖仅 `xlsx`（SheetJS）与 `idb-keyval`。

测试数据：`tests/fixtures/` 内含 CFX / QuantStudio / LightCycler 三种风格的合成导出样本（构造数据），`tests/fixtures/real/` 内含来自公开数据集的**真实 QuantStudio 导出**（96/384 孔，见其 PROVENANCE.md），均有回归与 E2E 覆盖。

## 隐私

所有解析、计算、导出均在浏览器内完成；项目数据仅存于本机 IndexedDB。无任何网络请求、无统计埋点。

## License

MIT
