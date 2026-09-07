/**
 * Pure roster rules. UI and networking deliberately stay outside this file so
 * the risky parts (credential transport and whole-roster upload) are easy to
 * audit separately and these transformations can be unit-tested without a DOM.
 */

export const MODULE_TYPES = ['X', 'Y', 'D', 'A', 'B'];
export const MODULE_FIELDS = Object.freeze({ X: 'modX', Y: 'modY', D: 'modD', A: 'modA', B: 'modB' });
export const PROGRESSION_FIELDS = ['level', 'elite', 'potential', 'mainSkill', 'skill1', 'skill2', 'skill3', ...Object.values(MODULE_FIELDS)];

export const toNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
export const toBoolean = (value) => value === true || value === 1 || ['true', '是', '1'].includes(String(value ?? '').trim().toLowerCase());
export const clamp = (value, min, max) => Math.min(max, Math.max(min, toNumber(value)));

export function maxOperatorLevel(rarity, elite) {
  const table = {
    0: { 1: 30, 2: 30, 3: 40, 4: 45, 5: 50, 6: 50 },
    1: { 3: 55, 4: 60, 5: 70, 6: 80 },
    2: { 4: 70, 5: 80, 6: 90 }
  };
  return table[elite]?.[rarity] ?? 0;
}

export function moduleLevelRequirement(rarity) {
  return rarity >= 6 ? 60 : rarity === 5 ? 50 : rarity === 4 ? 40 : Number.POSITIVE_INFINITY;
}

export function createOperator(catalogItem) {
  const skills = Array.isArray(catalogItem.skills) ? catalogItem.skills.slice(0, 3) : [];
  const modules = Array.isArray(catalogItem.modules) ? catalogItem.modules : [];
  return {
    id: String(catalogItem.id || catalogItem.charId || ''),
    name: String(catalogItem.name || catalogItem.id || catalogItem.charId || '未知干员'),
    rarity: toNumber(catalogItem.rarity),
    profession: String(catalogItem.profession || ''),
    skills,
    modules,
    popularity: catalogItem.popularity || { skillM3: [], moduleUnlock: {} },
    own: false,
    elite: 0,
    level: 0,
    potential: 0,
    mainSkill: 0,
    skill1: 0,
    skill2: 0,
    skill3: 0,
    modX: 0,
    modY: 0,
    modD: 0,
    modA: 0,
    modB: 0
  };
}

export function createUnknownOperator(source) {
  const rarity = toNumber(source.rarity);
  const count = rarity >= 6 ? 3 : rarity >= 3 ? 2 : 1;
  return createOperator({
    id: source.id || source.charId,
    name: source.name || source.id || source.charId,
    rarity,
    skills: Array.from({ length: count }, (_, index) => ({ id: '', name: `技能 ${index + 1}（目录待更新）` })),
    modules: []
  });
}

export function availableModuleTypes(operator) {
  return new Set((operator.modules || []).map((item) => String(item.type || '').toUpperCase()).filter((type) => MODULE_TYPES.includes(type)));
}

/**
 * A deliberate edit may fill prerequisites. This only mutates the local draft;
 * it never sends a request. It avoids the common impossible state "M3 with
 * skill level 1" while leaving one-click recommendations stricter (E2 level 60).
 */
export function applyDependencies(operator, changedField = '') {
  const changes = [];
  const set = (field, value, label) => {
    if (operator[field] !== value) {
      operator[field] = value;
      changes.push(label);
    }
  };
  const anyProgress = PROGRESSION_FIELDS.some((field) => toNumber(operator[field]) > 0);
  if (changedField !== 'own' && anyProgress && !operator.own) set('own', true, '设为已持有');
  if (operator.own) {
    if (operator.level < 1) set('level', 1, '等级补为 1');
    if (operator.potential < 1) set('potential', 1, '潜能补为 1');
    if (operator.mainSkill < 1) set('mainSkill', 1, '技能等级补为 1');
  }
  if ([operator.skill1, operator.skill2, operator.skill3].some((value) => toNumber(value) > 0)) {
    set('own', true, '设为已持有');
    if (operator.elite < 2) set('elite', 2, '精英化补为 2');
    if (operator.mainSkill < 7) set('mainSkill', 7, '技能等级补为 7');
    if (operator.level < 1) set('level', 1, '等级补为 1');
    if (operator.potential < 1) set('potential', 1, '潜能补为 1');
  }
  const types = availableModuleTypes(operator);
  const hasRealModule = [...types].some((type) => toNumber(operator[MODULE_FIELDS[type]]) > 0);
  if (hasRealModule) {
    set('own', true, '设为已持有');
    if (operator.elite < 2) set('elite', 2, '精英化补为 2');
    const requiredLevel = moduleLevelRequirement(operator.rarity);
    if (Number.isFinite(requiredLevel) && operator.level < requiredLevel) set('level', requiredLevel, `等级补为 ${requiredLevel}`);
    if (operator.potential < 1) set('potential', 1, '潜能补为 1');
    if (operator.mainSkill < 1) set('mainSkill', 1, '技能等级补为 1');
  }
  return [...new Set(changes)];
}

export function recommendationFor(operator) {
  const skillRates = operator.popularity?.skillM3 || [];
  const skillCandidates = (operator.skills || []).map((skill, index) => ({
    index,
    field: `skill${index + 1}`,
    name: skill.name || `技能 ${index + 1}`,
    rate: Number.isFinite(Number(skillRates[index])) ? Number(skillRates[index]) : null
  })).filter((item) => item.rate !== null);
  skillCandidates.sort((a, b) => b.rate - a.rate || a.index - b.index);

  const moduleCandidates = (operator.modules || []).map((module) => ({
    type: module.type,
    field: MODULE_FIELDS[module.type],
    name: module.name,
    rate: Number.isFinite(Number(operator.popularity?.moduleUnlock?.[module.type]))
      ? Number(operator.popularity.moduleUnlock[module.type])
      : null
  })).filter((item) => item.field && item.rate !== null);
  moduleCandidates.sort((a, b) => b.rate - a.rate || a.type.localeCompare(b.type));

  return {
    skill: skillCandidates[0]?.rate > 0 ? skillCandidates[0] : null,
    module: moduleCandidates[0]?.rate > 0 ? moduleCandidates[0] : null
  };
}

export function canUseQuickRecommendation(operator) {
  return Boolean(operator.own && operator.elite === 2 && operator.level >= 60);
}

export function applyQuickRecommendation(operator, kind) {
  if (!canUseQuickRecommendation(operator)) {
    return { ok: false, reason: '仅对已持有且精二 60 级以上干员开放' };
  }
  const recommendation = recommendationFor(operator);
  const item = recommendation[kind];
  if (!item) return { ok: false, reason: kind === 'skill' ? '没有可用的专精统计' : '没有可用的模组统计' };
  if (kind === 'skill') {
    operator[item.field] = 3;
    operator.mainSkill = Math.max(7, operator.mainSkill);
  } else {
    operator[item.field] = 3;
  }
  return { ok: true, item };
}

export function checkOperator(operator) {
  const errors = [];
  const warnings = [];
  if (operator.own) {
    if (!operator.id) errors.push('缺少干员 ID');
    if (operator.level < 1) errors.push('已持有但等级为 0');
    if (operator.potential < 1 || operator.potential > 6) errors.push('潜能应为 1–6');
    if (operator.mainSkill < 1 || operator.mainSkill > 7) errors.push('技能等级应为 1–7');
    const cap = maxOperatorLevel(operator.rarity, operator.elite);
    if (!cap) errors.push('该星级不能达到当前精英阶段');
    else if (operator.level > cap) errors.push(`当前精英阶段最高 ${cap} 级`);
  } else if (PROGRESSION_FIELDS.some((field) => toNumber(operator[field]) > 0)) {
    warnings.push('未持有但存在练度；上传时会忽略');
  }

  (operator.skills || []).forEach((_, index) => {
    const level = toNumber(operator[`skill${index + 1}`]);
    if (level < 0 || level > 3) errors.push(`技能 ${index + 1} 专精应为 0–3`);
    if (level > 0 && operator.elite < 2) errors.push(`技能 ${index + 1} 专精要求精二`);
    if (level > 0 && operator.mainSkill < 7) errors.push(`技能 ${index + 1} 专精要求技能 7 级`);
  });
  for (let index = (operator.skills || []).length + 1; index <= 3; index += 1) {
    if (toNumber(operator[`skill${index}`]) > 0) errors.push(`该干员没有技能 ${index}`);
  }

  const types = availableModuleTypes(operator);
  for (const type of MODULE_TYPES) {
    const value = toNumber(operator[MODULE_FIELDS[type]]);
    if (value < 0 || value > 3) errors.push(`${type} 模组应为 0–3`);
    if (value > 0 && !types.has(type)) errors.push(`该干员没有 ${type} 模组`);
  }
  if ([...types].some((type) => toNumber(operator[MODULE_FIELDS[type]]) > 0)) {
    if (operator.elite < 2) errors.push('模组要求精二');
    const requirement = moduleLevelRequirement(operator.rarity);
    if (!Number.isFinite(requirement)) errors.push('低于四星不能开启模组');
    else if (operator.level < requirement) errors.push(`模组要求至少 ${requirement} 级`);
  }
  if (!operator.skills?.length) warnings.push('公共目录缺少技能信息，请更新目录后核对');
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

export function progressionScore(operator) {
  return (operator.own ? 1e9 : 0)
    + operator.elite * 1e7
    + operator.level * 1e5
    + [operator.skill1, operator.skill2, operator.skill3].reduce((sum, value) => sum + value, 0) * 1200
    + MODULE_TYPES.reduce((sum, type) => sum + operator[MODULE_FIELDS[type]], 0) * 280
    + operator.mainSkill * 20
    + operator.potential * 4
    + operator.rarity;
}

export function uploadRow(operator) {
  return {
    charId: operator.id,
    own: true,
    level: operator.level,
    elite: operator.elite,
    potential: operator.potential,
    rarity: operator.rarity,
    mainSkill: operator.mainSkill,
    skill1: operator.skill1,
    skill2: operator.skill2,
    skill3: operator.skill3,
    modX: operator.modX,
    modY: operator.modY,
    modD: operator.modD,
    modA: operator.modA,
    modB: operator.modB
  };
}

function objectValues(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

export function extractMaaList(data) {
  if (Array.isArray(data)) return data;
  for (const key of ['operatorDataList', 'operators', 'chars', 'data']) {
    const value = data?.[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const nested = extractMaaList(value);
      if (nested.length) return nested;
    }
  }
  return [];
}

/**
 * Accepts both raw account/syncData (`user.troop.chars`) and the sanitized
 * file produced by arkprts_export.py. The browser reads the file locally; it
 * never uploads the raw game response to the PowerShell server.
 */
export function extractArkprtsList(data) {
  const candidates = [
    data?.user?.troop?.chars,
    data?.troop?.chars,
    data?.operators,
    data?.chars
  ];
  const container = candidates.find((item) => item && (Array.isArray(item) || typeof item === 'object'));
  return objectValues(container).filter((item) => item && (item.charId || item.id));
}

export function mergeProgression(target, source, mode = 'generic') {
  target.own = source.own == null ? true : toBoolean(source.own);
  const direct = [
    ['level', 'level'], ['elite', 'elite'], ['evolvePhase', 'elite'],
    ['potential', 'potential'], ['mainSkill', 'mainSkill'], ['mainSkillLevel', 'mainSkill'],
    ['mainSkillLvl', 'mainSkill'], ['skill1', 'skill1'], ['skill2', 'skill2'], ['skill3', 'skill3'],
    ['modX', 'modX'], ['modY', 'modY'], ['modD', 'modD'], ['modA', 'modA'], ['modB', 'modB']
  ];
  for (const [input, output] of direct) if (source[input] != null) target[output] = toNumber(source[input]);
  if (source.potentialRank != null) target.potential = toNumber(source.potentialRank) + 1;

  objectValues(source.skills).slice(0, 3).forEach((skill, index) => {
    const level = skill?.specializeLevel ?? skill?.level ?? skill?.mastery ?? 0;
    target[`skill${index + 1}`] = toNumber(level);
  });

  const moduleById = new Map((target.modules || []).map((item) => [item.id, item.type]));
  const equips = source.equip ?? source.equips;
  if (equips && typeof equips === 'object') {
    for (const [key, item] of Object.entries(equips)) {
      const id = item?.id || item?.uniEquipId || key;
      const type = String(item?.type || moduleById.get(id) || '').toUpperCase();
      if (!MODULE_FIELDS[type]) continue;
      const level = item?.level ?? item?.rank ?? 0;
      // ArkPRTS exposes locked module entries; locked level 0 must not become owned.
      target[MODULE_FIELDS[type]] = item?.locked === true ? 0 : toNumber(level);
    }
  }
  applyDependencies(target, mode);
  return target;
}

export function normalizeForDraft(operator) {
  const clean = { ...operator };
  clean.own = Boolean(clean.own);
  clean.elite = clamp(clean.elite, 0, 2);
  clean.level = clamp(clean.level, 0, 90);
  clean.potential = clamp(clean.potential, 0, 6);
  clean.mainSkill = clamp(clean.mainSkill, 0, 7);
  for (const field of ['skill1', 'skill2', 'skill3', ...Object.values(MODULE_FIELDS)]) clean[field] = clamp(clean[field], 0, 3);
  return clean;
}

export function applyLiveStatistics(catalogOperators, response) {
  const payload = response?.data ?? response;
  if (!Array.isArray(payload?.result)) throw new Error('统计接口缺少 data.result');
  const byId = new Map(payload.result.map((row) => [row.charId, row]));
  for (const operator of catalogOperators) {
    const stat = byId.get(operator.id);
    const owned = toNumber(stat?.own);
    const asRate = (value) => owned > 0 ? Number(value || 0) / owned : null;
    operator.popularity = {
      owned,
      sampleSize: toNumber(stat?.sampleSize || payload.sampleSize),
      skillM3: (operator.skills || []).map((_, index) => asRate(stat?.[`skill${index + 1}`]?.['3'])),
      moduleUnlock: Object.fromEntries((operator.modules || []).map((item) => {
        const ranks = stat?.[`mod${item.type}`] || {};
        return [item.type, asRate(toNumber(ranks['1']) + toNumber(ranks['2']) + toNumber(ranks['3']))];
      }))
    };
  }
  return { sampleSize: toNumber(payload.sampleSize), createdAt: payload.createTime || null, matched: catalogOperators.filter((item) => byId.has(item.id)).length };
}
