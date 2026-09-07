import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Fetch only the five public inputs required to build the compact catalog.
 * Player data and tokens never enter this script. Sources are downloaded into
 * a unique temporary directory and removed after the deterministic transform.
 *
 * Redistribution warning: generating data locally is not the same as having
 * permission to republish it. See THIRD_PARTY_NOTICES.md before making a
 * prebuilt public release.
 */
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'yituliu-catalog-'));
const maxBytes = 50 * 1024 * 1024;
const sources = [
  ['yituliu-character.json', 'https://raw.githubusercontent.com/Arknights-yituliu/frontend-v2-plus/dev/src/static/json/operator/character_table_simple.v2.json'],
  ['yituliu-statistics.json', 'https://backend.yituliu.cn/survey/operator/result/v2'],
  ['en-character.json', 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/master/en/gamedata/excel/character_table.json'],
  ['en-patch.json', 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/master/en/gamedata/excel/char_patch_table.json'],
  ['en-uniequip.json', 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/master/en/gamedata/excel/uniequip_table.json']
];

async function download(name, url) {
  process.stdout.write(`Downloading ${name}... `);
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Yituliu-Local-Roster-Workbench/3.0' },
    signal: AbortSignal.timeout(120_000)
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new Error(`${name} is unexpectedly large (${declared} bytes)`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxBytes) throw new Error(`${name} exceeded the ${maxBytes}-byte safety limit`);
  JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
  const target = path.join(tempRoot, name);
  await fs.writeFile(target, bytes);
  console.log(`${bytes.length} bytes`);
  return target;
}

try {
  const inputs = [];
  for (const [name, url] of sources) inputs.push(await download(name, url));
  const output = path.join(projectRoot, 'data', 'operator-catalog.json');
  const pending = path.join(tempRoot, 'operator-catalog.json');
  const result = spawnSync(process.execPath, [path.join(projectRoot, 'scripts', 'prepare-data.mjs'), ...inputs, pending], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Catalog transform failed');
  const catalog = JSON.parse(await fs.readFile(pending, 'utf8'));
  if (catalog.schemaVersion !== 2 || !Array.isArray(catalog.operators) || catalog.operators.length < 400) throw new Error('Incomplete public catalog');
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.copyFile(pending, output + '.tmp');
  await fs.rename(output + '.tmp', output);
  process.stdout.write(result.stdout);
} finally {
  // The target is always the unique directory returned by mkdtemp above.
  await fs.rm(tempRoot, { recursive: true, force: true });
}
