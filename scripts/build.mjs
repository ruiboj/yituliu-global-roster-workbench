import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Dependency-free packager. It copies an explicit allowlist so temporary
 * downloads, test fixtures and credentials can never leak into the run folder.
 */
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.resolve(process.argv[2] || path.join(sourceRoot, 'dist'));
const files = [
  'index.html',
  'server.ps1',
  '启动工具.cmd',
  'arkprts_export.py',
  '导出国际服干员_实验性.cmd',
  'README.md',
  'README.en.md',
  'README.zh-CN.md',
  'docs/screenshots/workbench.png',
  'docs/screenshots/editing.png',
  'docs/screenshots/yituliu-tokens.png',
  'DESIGN_AND_RISKS.md',
  'THIRD_PARTY_NOTICES.md',
  'LICENSE',
  '使用说明.txt',
  'assets/ui-standard.css',
  'assets/app.css',
  'src/core.js',
  'src/app.js',
  'data/operator-catalog.json'
];

if (outputRoot === sourceRoot) throw new Error('Output directory must not be the source directory.');
await fs.mkdir(outputRoot, { recursive: true });
for (const relative of files) {
  const source = path.join(sourceRoot, relative);
  const target = path.join(outputRoot, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  if (relative === 'server.ps1') {
    // Windows PowerShell 5.1 treats UTF-8 without BOM as the active ANSI code
    // page. A BOM is required because user-facing Chinese error strings would
    // otherwise corrupt quote boundaries and make the script fail to parse.
    const text = (await fs.readFile(source, 'utf8')).replace(/^\uFEFF/, '');
    await fs.writeFile(target, `\uFEFF${text}`, 'utf8');
  } else if (relative.endsWith('.cmd')) {
    // cmd.exe is unreliable with LF-only UTF-8 batch files. Keep the source
    // readable, then emit Windows CRLF so discovery/error branches parse whole.
    const text = (await fs.readFile(source, 'utf8')).replace(/^\uFEFF/, '');
    await fs.writeFile(target, text.replace(/\r?\n/g, '\r\n'), 'utf8');
  } else {
    await fs.copyFile(source, target);
  }
}
console.log(JSON.stringify({ outputRoot, files: files.length }));
