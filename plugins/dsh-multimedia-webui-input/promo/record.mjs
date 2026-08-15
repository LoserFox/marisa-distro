import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const playwrightPackage = process.env.DSHCA_PLAYWRIGHT_PACKAGE;
const url = process.env.DSHCA_DEMO_URL;
const attachment = process.env.DSHCA_DEMO_FILE;
const attachmentFolder = process.env.DSHCA_DEMO_FOLDER;
const browserExecutable = process.env.DSHCA_BROWSER_EXECUTABLE;
const workspaceLabel = process.env.DSHCA_WORKSPACE_LABEL ?? 'Multimedia Input Demo';
const output = resolve(process.env.DSHCA_VIDEO_DIR ?? './promo/raw');

if (!playwrightPackage || !url || !attachment || !attachmentFolder) {
  throw new Error('Set DSHCA_PLAYWRIGHT_PACKAGE, DSHCA_DEMO_URL, DSHCA_DEMO_FILE, and DSHCA_DEMO_FOLDER');
}

const { chromium } = require(playwrightPackage);
await mkdir(output, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(browserExecutable ? { executablePath: browserExecutable } : {}),
});
const context = await browser.newContext({
  colorScheme: 'dark',
  locale: 'zh-CN',
  recordVideo: { dir: output, size: { width: 1440, height: 900 } },
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
const video = page.video();

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  const workspacePicker = page.getByRole('button', { name: '选择工作区' });
  if (await workspacePicker.isVisible().catch(() => false)) {
    await workspacePicker.click();
    await page.getByRole('menuitem', { name: workspaceLabel }).click();
  } else {
    // A reused local QA profile may auto-open its last session. Start a blank
    // session so the recording always demonstrates the complete first-send flow.
    await page.locator('button[aria-label="新建会话"]').nth(1).click();
  }
  await page.getByRole('textbox', { name: '描述你想要构建的内容' }).waitFor();
  await page.waitForTimeout(900);

  await page.getByRole('button', { name: 'Attach files or a folder' }).click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: 'Choose files' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(attachment);
  const attachmentChip = page.locator('.dshca-hero-dock .dshca-chip, .dshca-dock .dshca-chip').filter({
    hasText: basename(attachment),
  });
  await attachmentChip.waitFor();
  await attachmentChip.getByRole('button', { name: new RegExp(`Remove ${basename(attachment).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).waitFor();
  await page.waitForTimeout(700);

  await page.getByRole('button', { name: 'Attach files or a folder' }).click();
  const folderChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: 'Choose folder' }).click();
  const folderChooser = await folderChooserPromise;
  await folderChooser.setFiles(attachmentFolder);
  const folderChip = page.locator('.dshca-hero-dock .dshca-chip, .dshca-dock .dshca-chip').filter({
    hasText: basename(attachmentFolder),
  });
  await folderChip.waitFor();
  await page.waitForTimeout(1200);

  const composer = page.getByRole('textbox', { name: '描述你想要构建的内容' });
  await composer.click();
  await composer.pressSequentially(
    '请用 Read 读取独立文件和文件夹内容，再用 StrReplace 把 sample-project/status.md 中的 reviewed: false 改成 reviewed: true。只修改发送后复制到工作区的附件副本。最后列出独立文件名、文件夹名、至少两个内部文件名、修改结果和 Review code。',
    { delay: 16 },
  );
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: '发送消息' }).click();
  await page.getByText(/aurora-bridge-42/).last().waitFor({ timeout: 90_000 });
  await page.waitForTimeout(2200);

  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '多媒体输入' }).click();
  await page.locator('.dshca-settings').waitFor({ timeout: 10_000 });
  await page.getByText(/当前工作区 · \d+ 个有附件的会话/).waitFor({ timeout: 10_000 });
  await page.waitForTimeout(1300);

  await page.getByRole('button', { name: '清理当前会话附件' }).click();
  await page.getByRole('button', { name: '再次点击：清理当前会话' }).waitFor();
  await page.waitForTimeout(1100);
  await page.getByRole('button', { name: '取消' }).click();
  await page.waitForTimeout(700);

  await page.getByRole('button', { name: '清理当前工作区全部会话附件' }).click();
  const confirmWorkspace = page.getByRole('button', { name: '再次点击：清理当前工作区' });
  await confirmWorkspace.waitFor();
  await page.waitForTimeout(1100);
  await confirmWorkspace.click();
  await page.getByText(/已清理当前工作区/).waitFor({ timeout: 20_000 });
  await page.getByText('0 B', { exact: true }).waitFor();
  await page.waitForTimeout(2200);
} finally {
  await context.close();
  await browser.close();
}

console.log(await video.path());
