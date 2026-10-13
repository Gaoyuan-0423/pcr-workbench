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
