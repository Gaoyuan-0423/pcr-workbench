import { expect, test, type Page } from 'playwright/test';

// Same measurements and settings, but distinct import provenance. No external AI calls.
async function openProjects(page: Page) {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    const pending: { payload: { experiment: { basis?: string } }; resolve: (value: Response) => void }[] = [];
    Object.assign(window, { pendingInterpretations: pending });
    window.fetch = (input, init) => {
      if (String(input) !== 'https://ai.example/v1/chat/completions') return originalFetch(input, init);
      const request = JSON.parse(String(init?.body));
      // Deliberately ignore abort: a late response must not update the replacement card.
      return new Promise<Response>((resolve) => pending.push({ payload: JSON.parse(request.messages[1].content), resolve }));
    };
  });
  await page.goto('/');
  await page.evaluate(async () => {
    const state = {
      fileName: 'same-data.csv', sheetName: '', headerRow: 0, excluded: {}, step: 4,
      matrix: [['Plate', 'Well', 'Sample', 'Target', 'Cq'],
        ['P1', 'A1', 'Control', 'GAPDH', '20'], ['P1', 'A2', 'Control', 'LDHA', '25'],
        ['P1', 'B1', 'Treatment', 'GAPDH', '20'], ['P1', 'B2', 'Treatment', 'LDHA', '23']],
      mapping: { plate: 0, well: 1, sample: 2, group: -1, pairId: -1, target: 3, cq: 4, task: -1, quantity: -1 },
      config: { controlSamples: ['Control'], refGenes: ['GAPDH'], qc: { minCq: 0, maxCq: 50, absDev: 100, zScore: 100 } },
      autoMelt: [],
    };
    const a = { ...state, projectName: 'Project A', guessBasis: 'Project A import basis' };
    const b = { ...state, projectName: 'Project B', guessBasis: 'Project B import basis' };
    const index = ['A', 'B'].map((id) => ({ id, name: `Project ${id}`, updatedAt: 1, fileName: state.fileName, score: null, rows: 4 }));
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('keyval-store', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('keyval');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction('keyval', 'readwrite');
        const store = tx.objectStore('keyval');
        store.put(index, 'pcr-workbench:projects:index:v1');
        store.put(a, 'pcr-workbench:project:A');
        store.put(b, 'pcr-workbench:project:B');
        tx.oncomplete = () => { open.result.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
    localStorage.setItem('pcr-workbench:last:v1', JSON.stringify({ ...a, id: 'A' }));
    localStorage.setItem('pcr-workbench.ai.v1', JSON.stringify({ version: 1, baseUrl: 'https://ai.example/v1', model: 'test-model', apiKey: 'test-key' }));
  });
  await page.reload();
  await expect(page.locator('.current-project')).toContainText('Project A');
  await expect(page.locator('.report-summary')).toContainText('Project A import basis');
}

async function switchToB(page: Page) {
  await page.getByRole('button', { name: '我的课题', exact: true }).click();
  await page.locator('.project-row').filter({ hasText: 'Project B' }).getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.locator('.current-project')).toContainText('Project B');
  await expect(page.locator('.report-summary')).toContainText('Project B import basis');
  await expect(page.locator('.report-summary')).not.toContainText('Project A import basis');
}

async function pendingBases(page: Page) {
  return page.evaluate(() => (window as unknown as { pendingInterpretations: { payload: { experiment: { basis?: string } } }[] })
    .pendingInterpretations.map((request) => request.payload.experiment.basis));
}

async function respond(page: Page, index: number, text: string) {
  await page.evaluate(async ({ index, text }) => {
    const pending = (window as unknown as { pendingInterpretations: { resolve: (value: Response) => void }[] }).pendingInterpretations;
    pending[index].resolve(new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 }));
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  }, { index, text });
}

test('opening a saved project restores its basis and clears an existing interpretation', async ({ page }) => {
  await openProjects(page);
  await page.getByRole('button', { name: '开始解读', exact: true }).click();
  await expect.poll(() => pendingBases(page)).toEqual(['Project A import basis']);
  await respond(page, 0, 'Completed interpretation for A');
  await expect(page.locator('.ai-answer')).toContainText('Completed interpretation for A');
  await switchToB(page);
  await expect(page.locator('.ai-answer')).toHaveCount(0);
  await expect.poll(() => pendingBases(page)).toEqual(['Project A import basis']);
  await page.getByRole('button', { name: '开始解读', exact: true }).click();
  await expect.poll(() => pendingBases(page)).toEqual(['Project A import basis', 'Project B import basis']);
  await respond(page, 1, 'Completed interpretation for B');
  await expect(page.locator('.ai-answer')).toContainText('Completed interpretation for B');
});

test('a late response from the previous project cannot replace or finish the current request', async ({ page }) => {
  await openProjects(page);
  await page.getByRole('button', { name: '开始解读', exact: true }).click();
  await expect.poll(() => pendingBases(page)).toEqual(['Project A import basis']);
  await switchToB(page);
  await page.getByRole('button', { name: '开始解读', exact: true }).click();
  await expect.poll(() => pendingBases(page)).toEqual(['Project A import basis', 'Project B import basis']);
  await respond(page, 0, 'Late interpretation for A');
  await expect(page.locator('.ai-answer')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '解读中…', exact: true })).toBeDisabled();
  await respond(page, 1, 'Current interpretation for B');
  await expect(page.locator('.ai-answer')).toContainText('Current interpretation for B');
  await expect(page.locator('.ai-answer')).not.toContainText('Late interpretation for A');
});
