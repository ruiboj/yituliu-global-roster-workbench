import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Build a small, auditable public catalog from Yituliu's generated game-data
 * table and its public progression statistics. Player data never enters this
 * script. Keeping the snapshot local makes the editor usable when GitHub or
 * the statistics endpoint is temporarily unavailable.
 */
const [characterPath, statisticsPath, globalCharacterPath, globalPatchPath, globalEquipPath, outputPath = 'data/operator-catalog.json'] = process.argv.slice(2);
if (!characterPath || !statisticsPath || !globalCharacterPath || !globalPatchPath || !globalEquipPath) {
  throw new Error('Usage: node scripts/prepare-data.mjs <yituliu-character.json> <statistics.json> <en-character.json> <en-patch.json> <en-uniequip.json> [output.json]');
}

const parseJson = async (file) => JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
const characterTable = await parseJson(characterPath);
const statisticsResponse = await parseJson(statisticsPath);
const globalCharacterTable = await parseJson(globalCharacterPath);
const globalPatchTable = await parseJson(globalPatchPath);
const globalEquipTable = await parseJson(globalEquipPath);
const statistics = statisticsResponse?.data ?? statisticsResponse;
if (!characterTable || Array.isArray(characterTable) || typeof characterTable !== 'object') {
  throw new Error('Character table must be an object keyed by charId.');
}
if (!Array.isArray(statistics?.result)) throw new Error('Statistics response is missing data.result.');

const statsById = new Map(statistics.result.map((row) => [row.charId, row]));
const rate = (value, denominator) => denominator > 0 ? Number((Number(value || 0) / denominator).toFixed(6)) : null;
const moduleTypes = new Set(['X', 'Y', 'D', 'A', 'B']);
// Global static IDs are an availability allowlist. This prevents the CN-derived
// display table from offering operators/modules not yet released by Yostar EN.
const globalCharacterIds = new Set([
  ...Object.keys(globalCharacterTable || {}),
  ...Object.keys(globalPatchTable?.patchChars || {})
]);
const globalModuleIds = new Set(Object.entries(globalEquipTable?.equipDict || {})
  .filter(([, item]) => moduleTypes.has(String(item?.typeName2 || '').toUpperCase()))
  .map(([id]) => id));

const operators = Object.entries(characterTable)
  .filter(([charId, value]) => charId.startsWith('char_') && value?.name && globalCharacterIds.has(charId))
  .map(([charId, value]) => {
    const stat = statsById.get(charId);
    const owned = Number(stat?.own || 0);
    const skills = (value.skills || []).slice(0, 3).map((skill) => ({
      id: String(skill.skillId || ''),
      name: String(skill.skillName || '').trim() || '未命名技能'
    }));
    const modules = (value.equip || [])
      .map((item) => ({
        id: String(item.uniEquipId || ''),
        name: String(item.uniEquipName || '').trim() || '未命名模组',
        type: String(item.typeName2 || '').toUpperCase(),
        branch: String(item.typeName1 || ''),
        availableAt: Number(item.uniEquipGetTime || 0) || null
      }))
      .filter((item) => item.id && moduleTypes.has(item.type) && globalModuleIds.has(item.id));

    return {
      id: charId,
      name: String(value.name),
      rarity: Number(value.rarity || 0),
      profession: String(value.profession || ''),
      skills,
      modules,
      popularity: {
        owned,
        sampleSize: Number(stat?.sampleSize || statistics.sampleSize || 0),
        skillM3: skills.map((_, index) => rate(stat?.[`skill${index + 1}`]?.['3'], owned)),
        moduleUnlock: Object.fromEntries(modules.map((item) => {
          const ranks = stat?.[`mod${item.type}`] || {};
          return [item.type, rate(Number(ranks['1'] || 0) + Number(ranks['2'] || 0) + Number(ranks['3'] || 0), owned)];
        }))
      }
    };
  })
  .sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name, 'zh-CN'));

if (operators.length < 350) throw new Error(`Catalog unexpectedly small: ${operators.length}`);
if (new Set(operators.map((item) => item.id)).size !== operators.length) throw new Error('Duplicate charId in catalog.');

const output = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  statisticsCreatedAt: statistics.createTime || null,
  statisticsSampleSize: Number(statistics.sampleSize || 0),
  sources: {
    characterTable: 'https://github.com/Arknights-yituliu/frontend-v2-plus/blob/dev/src/static/json/operator/character_table_simple.v2.json',
    statistics: 'https://backend.yituliu.cn/survey/operator/result/v2',
    globalAvailability: 'https://github.com/ArknightsAssets/ArknightsGamedata/tree/master/en/gamedata/excel'
  },
  operators
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ operators: operators.length, modules: operators.reduce((sum, item) => sum + item.modules.length, 0), outputPath }));
