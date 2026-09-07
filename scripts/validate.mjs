import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  MODULE_FIELDS,
  applyDependencies,
  applyLiveStatistics,
  applyQuickRecommendation,
  availableModuleTypes,
  canUseQuickRecommendation,
  checkOperator,
  createOperator,
  extractArkprtsList,
  extractMaaList,
  mergeProgression,
  recommendationFor,
  uploadRow
} from '../src/core.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(process.argv[2] || path.join(projectRoot, 'dist'));
const read = (relative) => fs.readFile(path.join(root, relative), 'utf8');
const readProject = (relative) => fs.readFile(path.join(projectRoot, relative), 'utf8');
const catalog = JSON.parse((await read('data/operator-catalog.json')).replace(/^\uFEFF/, ''));
assert.equal(catalog.schemaVersion, 2);
assert.ok(catalog.operators.length >= 400, `catalog too small: ${catalog.operators.length}`);
assert.ok(catalog.operators.reduce((sum, item) => sum + item.modules.length, 0) >= 450, 'module catalog too small');
assert.equal(new Set(catalog.operators.map((item) => item.id)).size, catalog.operators.length, 'duplicate charId');
assert.ok(catalog.operators.every((item) => item.skills.length <= 3));
assert.ok(catalog.operators.every((item) => item.modules.every((module) => MODULE_FIELDS[module.type])), 'unknown module type');
assert.ok(!catalog.operators.some((item) => item.modules.some((module) => module.id === 'uniequip_003_yato2')), 'CN-future module leaked into EN allowlist');

const html = await read('index.html');
const app = await read('src/app.js');
const core = await read('src/core.js');
const css = `${await read('assets/ui-standard.css')}\n${await read('assets/app.css')}`;
const server = await read('server.ps1');
for (const token of [
  '一图流本地干员工作台', '导入 MAA OperBox', '导入 ArkPRTS JSON',
  '整体替换', 'Token 仅驻留本页内存', 'operatorRows', 'uploadDialog',
  'languageToggle', 'HIGH-RISK WRITE:', 'Risks & privacy', 'data-en=', 'data-aria-en='
]) assert.ok(html.includes(token), `missing HTML token: ${token}`);
for (const token of ['推荐专三', '推荐模组 3', 'applyQuickRecommendation', 'showModal', 'applyStaticLanguage', 'state.language', 'localizeCoreMessage', 'document.documentElement.lang']) {
  assert.ok(app.includes(token), `missing app behavior token: ${token}`);
}
for (const token of ['border-radius: 0', '--orange: #ff8a00', 'Courier Prime', '.danger-notice', '.risk-list', '.button--danger']) assert.ok(css.includes(token), `missing UI standard: ${token}`);
assert.ok(!html.match(/[🚀✨🔒🤖🎉]/u), 'decorative emoji present');
assert.ok(!app.includes('localStorage') && !core.includes('localStorage'), 'credential/personal data persistence introduced');

const [gitignore, ciWorkflow, releaseWorkflow, releaseScript, packageJson, thirdParty] = await Promise.all([
  readProject('.gitignore'), readProject('.github/workflows/ci.yml'), readProject('.github/workflows/release.yml'),
  readProject('scripts/package-release.ps1'), readProject('package.json'), readProject('THIRD_PARTY_NOTICES.md')
]);
assert.ok(gitignore.includes('data/operator-catalog.json') && gitignore.includes('OperBox_Export.json'), 'generated/private files are not ignored');
assert.ok(ciWorkflow.includes('actions/checkout@v6') && ciWorkflow.includes('actions/setup-node@v7') && ciWorkflow.includes('npm test'), 'CI workflow incomplete');
assert.ok(releaseWorkflow.includes('ALLOW_THIRD_PARTY_DATA_REDISTRIBUTION') && releaseWorkflow.includes('contents: write'), 'release guard incomplete');
assert.ok(releaseScript.includes('[switch]$IncludeRuntime') && releaseScript.includes('SHA256SUMS.txt'), 'release packaging incomplete');
assert.match(JSON.parse(packageJson).version, /^\d+\.\d+\.\d+$/);
assert.ok(thirdParty.includes('Public availability is not permission to redistribute'), 'third-party data warning missing');
for (const token of [
  'IPAddress]::Loopback', 'https://backend.yituliu.cn', '/open-api/operator/info',
  '/open-api/operator/upload', '/survey/operator/result/v2', 'Authorization', 'Content-Security-Policy'
]) assert.ok(server.includes(token), `server security/route token missing: ${token}`);

for (const relative of ['src/core.js', 'src/app.js', 'scripts/build.mjs', 'scripts/prepare-data.mjs']) {
  const result = spawnSync(process.execPath, ['--check', path.join(projectRoot, relative)], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${relative} syntax error: ${result.stderr}`);
}

const firstWithStats = catalog.operators.find((item) => recommendationFor(item).skill || recommendationFor(item).module);
assert.ok(firstWithStats, 'no recommendation data');
const operator = createOperator(firstWithStats);
operator.own = true;
operator.elite = 2;
operator.level = 60;
operator.potential = 1;
operator.mainSkill = 7;
assert.equal(canUseQuickRecommendation(operator), true);
const rec = recommendationFor(operator);
if (rec.skill) {
  const result = applyQuickRecommendation(operator, 'skill');
  assert.equal(result.ok, true);
  assert.equal(operator[rec.skill.field], 3);
  assert.equal(operator.mainSkill, 7);
}
if (rec.module) {
  const result = applyQuickRecommendation(operator, 'module');
  assert.equal(result.ok, true);
  assert.equal(operator[rec.module.field], 3);
  assert.ok(availableModuleTypes(operator).has(rec.module.type));
}
assert.equal(checkOperator(operator).errors.length, 0);
assert.equal(uploadRow(operator).charId, operator.id);

const masteryDependency = createOperator({ id: 'char_test', name: '测试', rarity: 6, skills: [{ name: '技能一' }], modules: [] });
masteryDependency.skill1 = 3;
applyDependencies(masteryDependency, 'skill1');
assert.equal(masteryDependency.own, true);
assert.equal(masteryDependency.elite, 2);
assert.equal(masteryDependency.mainSkill, 7);

const moduleDependency = createOperator({
  id: 'char_test_module', name: '模组测试', rarity: 5, skills: [{ name: '技能一' }], modules: [{ id: 'uniequip_test', name: '测试模组', type: 'X' }]
});
moduleDependency.modX = 1;
applyDependencies(moduleDependency, 'modX');
assert.equal(moduleDependency.level, 50);
assert.equal(checkOperator(moduleDependency).errors.length, 0);

const impossibleModule = createOperator({ id: 'char_no_module', name: '无模组', rarity: 6, skills: [{ name: '技能一' }], modules: [] });
impossibleModule.own = true;
impossibleModule.elite = 2;
impossibleModule.level = 60;
impossibleModule.potential = 1;
impossibleModule.mainSkill = 7;
impossibleModule.modY = 1;
assert.ok(checkOperator(impossibleModule).errors.some((message) => message.includes('没有 Y 模组')));

assert.equal(extractMaaList({ data: { operators: [{ id: 'char_a' }] } }).length, 1);
const rawArkprts = {
  user: { troop: { chars: { 1: {
    charId: 'char_test_module', level: 60, evolvePhase: 2, potentialRank: 0, mainSkillLvl: 7,
    skills: [{ specializeLevel: 3 }], equip: { uniequip_test: { locked: false, level: 2 } }
  } } } }
};
const arkList = extractArkprtsList(rawArkprts);
assert.equal(arkList.length, 1);
const arkTarget = createOperator({
  id: 'char_test_module', name: '模组测试', rarity: 5, skills: [{ name: '技能一' }], modules: [{ id: 'uniequip_test', name: '测试模组', type: 'X' }]
});
mergeProgression(arkTarget, arkList[0], 'arkprts');
assert.equal(arkTarget.skill1, 3);
assert.equal(arkTarget.modX, 2);
assert.equal(arkTarget.potential, 1);

const liveTarget = createOperator({ id: 'char_live', name: '统计测试', rarity: 6, skills: [{ name: '一' }, { name: '二' }], modules: [{ id: 'm', name: 'X', type: 'X' }] });
const liveMeta = applyLiveStatistics([liveTarget], { data: { sampleSize: 100, createTime: 1, result: [{
  charId: 'char_live', own: 20, sampleSize: 100, skill1: { 3: 2 }, skill2: { 3: 10 }, modX: { 1: 1, 2: 2, 3: 7 }
}] } });
assert.equal(liveMeta.matched, 1);
assert.equal(recommendationFor(liveTarget).skill.index, 1);
assert.equal(recommendationFor(liveTarget).module.rate, 0.5);

const python = process.platform === 'win32' ? spawnSync('py', ['-3', '-c', "import ast,pathlib; ast.parse(pathlib.Path('arkprts_export.py').read_text(encoding='utf-8'))"], { encoding: 'utf8' }) : spawnSync('python3', ['-c', "import ast,pathlib; ast.parse(pathlib.Path('arkprts_export.py').read_text(encoding='utf-8'))"], { encoding: 'utf8' });
if (python.error == null) assert.equal(python.status, 0, `arkprts_export.py syntax error: ${python.stderr}`);

console.log(JSON.stringify({
  status: 'ok',
  catalog: catalog.operators.length,
  modules: catalog.operators.reduce((sum, item) => sum + item.modules.length, 0),
  enAvailabilityFilter: 'ok',
  uiContract: 'neon-orange-square',
  maaImport: 'ok',
  arkprtsImport: 'ok',
  recommendation: 'highest-rate-only',
  masteryDependency: 'skill7+elite2+owned',
  moduleEligibility: 'catalog-allowlist+level-threshold',
  tokenStorage: 'memory-only',
  loopbackOnly: 'ok'
}));
