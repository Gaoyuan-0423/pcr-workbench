import { expect, test } from 'playwright/test';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const fixture = (name: string) => join(here, '../fixtures', name);

test('完整流程：导入 CFX 导出 → 映射 → 配置 → ΔΔCt 结果与导出', async ({ page }) => {
  await page.goto('/');

  // 第 1 步：上传（通过隐藏 input 注入文件）
  await page.setInputFiles('input[type=file]', fixture('cfx-style.csv'));
  await expect(page.getByText('已解析 cfx-style.csv')).toBeVisible({ timeout: 15_000 });

  // 第 2 步：映射确认（自动识别）→ 下一步
  await expect(page.getByText('确认表头与列映射')).toBeVisible();
  await page.getByRole('button', { name: '下一步：孔板与配置 →' }).click();

  // 第 3 步：配置。GAPDH 应被自动识别为内参；勾选一个对照组
  await expect(page.getByText('孔板布局（96孔）')).toBeVisible();
  await page.locator('.check-list label', { hasText: 'Control-1' }).locator('input').check();
  await expect(page.locator('.check-list label', { hasText: 'GAPDH' }).locator('input')).toBeChecked();
  await page.getByRole('button', { name: '计算 ΔΔCt 并查看结果 →' }).click();


  // 第 4 步：结果
  await expect(page.getByText('ΔΔCt 结果表')).toBeVisible();
  await expect(page.getByRole('button', { name: 'LDHA' })).toBeVisible();
  await expect(page.getByText('导出 Excel（多表，含 ΔΔCt）')).toBeVisible();

  // 图表渲染
  await expect(page.locator('svg[role=img]')).toBeVisible();

  // Excel 导出触发下载
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '导出 Excel（多表，含 ΔΔCt）' }).click(),
  ]);
  expect(download.suggestedFilename()).toContain('xlsx');

  // CSV 导出
  const [csvDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '导出结果 CSV' }).click(),
  ]);
  expect(csvDownload.suggestedFilename()).toContain('csv');
});

test('QuantStudio 风格（元数据行 + Tab 分隔）也能走通', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('input[type=file]', fixture('quantstudio-style.txt'));
  await expect(page.getByText('已解析 quantstudio-style.txt')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('确认表头与列映射')).toBeVisible();
  await page.getByRole('button', { name: '下一步：孔板与配置 →' }).click();
  await page.locator('.check-list label', { hasText: 'WT-1' }).locator('input').check();
  await page.locator('.check-list label', { hasText: 'WT-2' }).locator('input').check();
  // GAPDH 自动识别为内参
  await expect(page.locator('.check-list label', { hasText: 'GAPDH' }).locator('input')).toBeChecked();
  await page.getByRole('button', { name: '计算 ΔΔCt 并查看结果 →' }).click();
  await expect(page.getByText('ΔΔCt 结果表')).toBeVisible();
  await expect(page.getByRole('button', { name: 'BAX2' })).toBeVisible();
});

test('真实 QuantStudio 384 孔导出（46 行元数据头）走通全流程', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('input[type=file]', fixture('real/RELATIVE_example.csv'));
  await expect(page.getByText('已解析 RELATIVE_example.csv')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('确认表头与列映射')).toBeVisible();
  await page.getByRole('button', { name: '下一步：孔板与配置 →' }).click();
  await expect(page.getByText('孔板布局（384孔）')).toBeVisible();
  await page.locator('.check-list label', { hasText: 'AiW002-2-D0' }).locator('input').check();
  // GAPDH / ACTB 均被自动识别为内参（池化）
  await expect(page.locator('.check-list label', { hasText: 'GAPDH' }).locator('input')).toBeChecked();
  await expect(page.locator('.check-list label', { hasText: 'ACTB' }).locator('input')).toBeChecked();
  await page.getByRole('button', { name: '计算 ΔΔCt 并查看结果 →' }).click();
  await expect(page.getByText('ΔΔCt 结果表')).toBeVisible();
  await expect(page.getByRole('button', { name: 'GRIN1' })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '导出 Excel（多表，含 ΔΔCt）' }).click(),
  ]);
  expect(download.suggestedFilename()).toContain('xlsx');
});

test('NTC 自动识别：Task/样本名两种途径 + 污染分级告警', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('input[type=file]', fixture('cfx-ntc-style.csv'));
  await expect(page.getByText('已解析 cfx-ntc-style.csv')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '下一步：孔板与配置 →' }).click();

  // NTC 检查卡片：GAPDH 通过（无扩增）、LDHA 疑似污染（Cq 33.10）、PKM 通过
  await expect(page.getByText('NTC 污染检查')).toBeVisible();
  await expect(page.locator('.ntc-row.ntc-pass', { hasText: 'GAPDH' })).toBeVisible();
  await expect(page.locator('.ntc-row.ntc-contaminated', { hasText: 'LDHA' })).toBeVisible();
  await expect(page.locator('.ntc-row.ntc-contaminated', { hasText: '33.1' })).toBeVisible();

  // NTC 不出现在对照组样本列表
  await expect(page.locator('.check-list label', { hasText: /^NTC/ })).toHaveCount(0);
  await page.locator('.check-list label', { hasText: 'Control-1' }).locator('input').check();
  await page.getByRole('button', { name: '计算 ΔΔCt 并查看结果 →' }).click();

  // 结果页告警横幅包含污染提示
  await expect(page.getByText('ΔΔCt 结果表')).toBeVisible();
  await expect(page.locator('.warning-banner')).toContainText('疑似');
});

test('QuantStudio Task=NTC（无扩增）显示通过', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('input[type=file]', fixture('quantstudio-style.txt'));
  await expect(page.getByText('已解析 quantstudio-style.txt')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: '下一步：孔板与配置 →' }).click();
  await expect(page.getByText('NTC 污染检查')).toBeVisible();
  await expect(page.locator('.ntc-row.ntc-pass', { hasText: 'GAPDH' })).toBeVisible();
  await expect(page.locator('.ntc-row.ntc-pass', { hasText: 'BAX2' })).toBeVisible();
  // Task=NTC 的行不进样本列表（样本名恰好也叫 NTC）
  await expect(page.locator('.check-list label', { hasText: /^NTC/ })).toHaveCount(0);
});

test('一键智能分析：跳过向导直接出结果与质量报告', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /一键智能分析/ }).click();
  await page.setInputFiles('input[type=file]', fixture('cfx-ntc-style.csv'));
  await page.getByText('一键智能分析报告').waitFor({ timeout: 15_000 });
  // 报告包含问题与优化方向
  await expect(page.getByText(/发现的问题/)).toBeVisible();
  await expect(page.getByText(/优化方向/)).toBeVisible();
  // 直接在第 4 步，结果表可用
  await expect(page.getByText('ΔΔCt 结果表')).toBeVisible();
  // NTC 污染作为严重问题出现在报告卡中
  await expect(page.locator('.issue-list li.sev-error', { hasText: 'NTC' })).toBeVisible();
});

test('多板合并：两个文件一起拖入，跨板计算 ΔΔCt', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('input[type=file]', [fixture('merge-plate1.csv'), fixture('merge-plate2.csv')]);
  await page.getByRole('heading', { name: '合并 2 个文件' }).waitFor({ timeout: 15_000 });
  await expect(page.getByText('merge-plate1.csv')).toBeVisible();
  await expect(page.getByText('merge-plate2.csv')).toBeVisible();
  await page.getByRole('button', { name: '下一步：孔板与配置 →' }).click();
  await expect(page.getByText('孔板布局（2 块板合并分析）')).toBeVisible();
  await page.locator('.check-list label', { hasText: 'Control-1' }).locator('input').check();
  await page.getByRole('button', { name: '计算 ΔΔCt 并查看结果 →' }).click();
  await expect(page.getByText('ΔΔCt 结果表')).toBeVisible();
  // 跨板合并后 Fold Change ≈ 5.04（2^(16/3-3)）
  await expect(page.getByText('5.04')).toBeVisible();
});

test('标准曲线自动拟合：Task=STANDARD + Quantity 一键应用效率', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /一键智能分析/ }).click();
  await page.setInputFiles('input[type=file]', fixture('standard-curve-style.csv'));
  await page.getByText('一键智能分析报告').waitFor({ timeout: 15_000 });
  // 报告含标准曲线应用信息（2 基因）
  await expect(page.locator('.issue-list li', { hasText: '标准曲线已应用' })).toHaveCount(2);
  // 效率非 100% → Pfaffl 口径
  await expect(page.getByText(/Pfaffl 效率校正 · /)).toBeVisible();
  await expect(page.getByText('ΔΔCt 结果表')).toBeVisible();
});

test('RDML 标准格式直接导入（真实 StepOne 文件）', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /一键智能分析/ }).click();
  await page.setInputFiles('input[type=file]', fixture('real/stepone_std.rdml'));
  await page.getByText('一键智能分析报告').waitFor({ timeout: 15_000 });
  // RDML 靶标声明效率已应用（RNase P 93.9%）
  await expect(page.locator('.issue-list li', { hasText: 'RDML 靶标声明效率已应用' })).toBeVisible();
  // 只有内参基因 → 明确提示
  await expect(page.locator('.issue-list li.sev-error', { hasText: '内参基因' })).toBeVisible();
});

test('熔解摘要表附加：LightCycler No. Tm 格式按孔位连接', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('input[type=file]', fixture('cfx-style.csv'));
  await page.getByText('已解析 cfx-style.csv').waitFor({ timeout: 15_000 });
  await page.getByRole('button', { name: '下一步：孔板与配置 →' }).click();
  // 附加熔解摘要表
  await page.getByRole('button', { name: '附加熔解摘要表文件' }).click();
  await page.setInputFiles('input[type=file]', fixture('melt-summary.csv'));
  await page.getByText('已附加 melt-summary.csv').waitFor({ timeout: 10_000 });
  // F1（规范化孔位）Treat-3 双峰被点名
  await expect(page.locator('.qc-flag-row', { hasText: 'Treat-3' })).toContainText('2 个熔解峰');
});

test('示例数据一键体验 + 分步使用说明', async ({ page }) => {
  await page.goto('/');
  // 帮助面板
  await page.getByText('❓ 这一步怎么做？').click();
  await expect(page.getByText('怎么拿到分析用的文件？')).toBeVisible();
  // 示例数据一键分析
  await page.getByRole('button', { name: '标准曲线示例' }).click();
  await page.getByText('一键智能分析报告').waitFor({ timeout: 15_000 });
  await expect(page.getByText('ΔΔCt 结果表')).toBeVisible();
  // AI 解读卡片（未配置状态）
  await expect(page.getByText('还没有配置 AI')).toBeVisible();
  await page.getByRole('button', { name: '配置我的 API' }).click();
  await expect(page.getByText('🤖 AI 解读设置')).toBeVisible();
  await page.getByRole('button', { name: '取消' }).click();
});

test('课题管理：自动保存、我的课题列表、打开与删除', async ({ page }) => {
  await page.goto('/');
  // 用示例数据产生一个课题
  await page.getByRole('button', { name: '标准曲线示例' }).click();
  await page.getByText('一键智能分析报告').waitFor({ timeout: 15_000 });
  // 头部出现课题名，打开我的课题
  await page.getByRole('button', { name: /我的课题/ }).click();
  await page.getByText('1 个已保存').waitFor({ timeout: 10_000 });
  await expect(page.getByText('standard-curve-style.csv', { exact: true })).toBeVisible();
  // 新建课题（清空当前）
  await page.getByRole('button', { name: '＋ 新建课题' }).click();
  await expect(page.getByText('拖入文件，或点击选择')).toBeVisible();
  // 再开我的课题，打开刚才的课题 → 恢复到结果页
  await page.getByRole('button', { name: /我的课题/ }).click();
  await page.getByRole('button', { name: '打开' }).first().click();
  await page.getByText('一键智能分析报告').waitFor({ timeout: 15_000 });
  // 删除流程（两段确认）
  await page.getByRole('button', { name: /我的课题/ }).click();
  await page.getByRole('button', { name: '删除' }).first().click();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByText('还没有保存的课题')).toBeVisible();
});
