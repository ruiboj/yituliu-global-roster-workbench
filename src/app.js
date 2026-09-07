import {
  MODULE_FIELDS,
  MODULE_TYPES,
  applyDependencies,
  applyLiveStatistics,
  applyQuickRecommendation,
  availableModuleTypes,
  canUseQuickRecommendation,
  checkOperator,
  clamp,
  createOperator,
  createUnknownOperator,
  extractArkprtsList,
  extractMaaList,
  maxOperatorLevel,
  mergeProgression,
  normalizeForDraft,
  progressionScore,
  recommendationFor,
  toNumber,
  uploadRow
} from './core.js';

const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const parseJsonText = (text) => JSON.parse(String(text).replace(/^\uFEFF/, ''));

const state = {
  catalog: null,
  roster: [],
  source: { zh: '空白目录', en: 'Blank catalog' },
  importStatus: { zh: '尚未导入玩家数据。', en: 'No player data imported yet.' },
  language: 'zh',
  serverState: 'pending',
  catalogError: false,
  dirty: false,
  busy: false,
  recommendationMeta: null,
  toastTimer: 0
};

// A compact two-language layer keeps this dependency-free and auditable. It is
// intentionally session-only: changing language must never create browser
// storage next to sensitive roster data or tokens.
const l = (zh, en) => state.language === 'en' ? en : zh;
const locale = () => state.language === 'en' ? 'en-CA' : 'zh-CN';
const formatPercent = (rate) => Number.isFinite(Number(rate)) ? `${(Number(rate) * 100).toFixed(1)}%` : l('暂无统计', 'No data');

function localizeCoreMessage(message) {
  if (state.language !== 'en') return message;
  const exact = {
    '设为已持有': 'Set as owned',
    '等级补为 1': 'Level raised to 1',
    '潜能补为 1': 'Potential raised to 1',
    '技能等级补为 1': 'Skill level raised to 1',
    '精英化补为 2': 'Elite phase raised to E2',
    '技能等级补为 7': 'Skill level raised to 7',
    '仅对已持有且精二 60 级以上干员开放': 'Available only for owned operators at E2 Lv.60+',
    '没有可用的专精统计': 'No mastery statistics available',
    '没有可用的模组统计': 'No module statistics available',
    '缺少干员 ID': 'Missing operator ID',
    '已持有但等级为 0': 'Owned operator has level 0',
    '潜能应为 1–6': 'Potential must be 1–6',
    '技能等级应为 1–7': 'Skill level must be 1–7',
    '该星级不能达到当前精英阶段': 'This rarity cannot reach the selected elite phase',
    '未持有但存在练度；上传时会忽略': 'Progression exists for an unowned operator; it will be ignored on upload',
    '模组要求精二': 'Modules require E2',
    '低于四星不能开启模组': 'Operators below 4★ cannot unlock modules',
    '公共目录缺少技能信息，请更新目录后核对': 'The public catalog lacks skill data; update the catalog and verify'
  };
  if (exact[message]) return exact[message];
  const patterns = [
    [/^当前精英阶段最高 (\d+) 级$/, 'Maximum level for this elite phase is $1'],
    [/^技能 (\d+) 专精应为 0–3$/, 'Skill $1 mastery must be 0–3'],
    [/^技能 (\d+) 专精要求精二$/, 'Skill $1 mastery requires E2'],
    [/^技能 (\d+) 专精要求技能 7 级$/, 'Skill $1 mastery requires skill level 7'],
    [/^该干员没有技能 (\d+)$/, 'This operator does not have skill $1'],
    [/^([XYDAB]) 模组应为 0–3$/, '$1 module level must be 0–3'],
    [/^该干员没有 ([XYDAB]) 模组$/, 'This operator does not have a $1 module'],
    [/^模组要求至少 (\d+) 级$/, 'Modules require at least level $1'],
    [/^等级补为 (\d+)$/, 'Level raised to $1']
  ];
  for (const [pattern, replacement] of patterns) if (pattern.test(message)) return message.replace(pattern, replacement);
  return message;
}

function applyStaticLanguage() {
  document.documentElement.lang = state.language === 'en' ? 'en' : 'zh-CN';
  document.title = l('一图流本地干员工作台', 'Yituliu Local Roster Workbench');
  const dynamicIds = new Set(['catalogState', 'serverStatus', 'importStatus', 'sourceInfo', 'statusText', 'recommendationTime']);
  document.querySelectorAll('[data-zh][data-en]').forEach((element) => {
    if (dynamicIds.has(element.id)) return;
    element.textContent = state.language === 'en' ? element.dataset.en : element.dataset.zh;
  });
  document.querySelectorAll('[data-placeholder-zh][data-placeholder-en]').forEach((element) => {
    element.placeholder = state.language === 'en' ? element.dataset.placeholderEn : element.dataset.placeholderZh;
  });
  document.querySelectorAll('[data-aria-zh][data-aria-en]').forEach((element) => {
    element.setAttribute('aria-label', state.language === 'en' ? element.dataset.ariaEn : element.dataset.ariaZh);
  });
  document.querySelectorAll('[data-title-zh][data-title-en]').forEach((element) => {
    element.title = state.language === 'en' ? element.dataset.titleEn : element.dataset.titleZh;
  });
  document.querySelector('meta[name="description"]').content = l(
    '在本机导入 MAA 或 ArkPRTS 数据，补录专精与模组，并写入一图流。',
    'Import MAA or ArkPRTS data locally, edit masteries and modules, and write to Yituliu.'
  );
  const toggle = $('languageToggle');
  toggle.textContent = state.language === 'en' ? '中文' : 'EN';
  toggle.ariaLabel = l('切换为英文', 'Switch to Chinese');
  toggle.title = toggle.ariaLabel;
  document.querySelectorAll('.reveal-token').forEach((button) => {
    button.textContent = $(button.dataset.for).type === 'password' ? l('显示', 'Show') : l('隐藏', 'Hide');
  });
}

const localizedValue = (value) => typeof value === 'object' && value !== null ? value[state.language] : String(value ?? '');

function renderAuxiliaryStatus() {
  $('importStatus').textContent = localizedValue(state.importStatus);
  $('catalogState').textContent = state.catalogError
    ? l('公共目录载入失败', 'Public catalog failed to load')
    : state.catalog
      ? l(`国际服目录 ${state.roster.length} 名 · 模组按 EN 静态表过滤`, `${state.roster.length} Global operators · modules filtered by EN data`)
      : l('正在读取公共目录…', 'Loading public catalog…');
  $('serverStatus').textContent = state.serverState === 'ok'
    ? l('本地正常', 'Local OK')
    : state.serverState === 'error'
      ? l('未连接', 'Disconnected')
      : l('检查中', 'Checking');
  $('serverStatus').dataset.state = state.serverState;
  if (state.recommendationMeta?.createdAt) {
    $('recommendationTime').textContent = l('推荐率：', 'Rates: ') + new Date(state.recommendationMeta.createdAt).toLocaleString(locale());
  } else {
    $('recommendationTime').textContent = l('推荐率：内置快照', 'Rates: bundled snapshot');
  }
}

const rosterMap = () => new Map(state.roster.map((operator) => [operator.id, operator]));

function setStatus(text) {
  $('statusText').textContent = text;
}

function showToast(title, message, type = 'info') {
  window.clearTimeout(state.toastTimer);
  $('toastTitle').textContent = title;
  $('toastMessage').textContent = message;
  $('toast').dataset.state = type;
  $('toast').hidden = false;
  state.toastTimer = window.setTimeout(() => { $('toast').hidden = true; }, 3600);
}

function setBusy(isBusy, buttonId = '', pendingLabel = '') {
  state.busy = isBusy;
  for (const id of ['readRemote', 'refreshStats', 'reviewUpload', 'confirmUpload', 'languageToggle']) {
    const button = $(id);
    if (button) button.disabled = isBusy || (id === 'confirmUpload' && !$('confirmReplace').checked);
  }
  if (buttonId) {
    const button = $(buttonId);
    if (isBusy) {
      button.dataset.originalLabel = button.textContent;
      button.textContent = pendingLabel;
    } else if (button.dataset.originalLabel) {
      button.textContent = button.dataset.originalLabel;
      delete button.dataset.originalLabel;
    }
  }
}

function selectHtml(field, value, max, label) {
  let html = `<label><span class="visually-hidden">${escapeHtml(label)}</span><select class="select" data-field="${field}" aria-label="${escapeHtml(label)}">`;
  for (let option = 0; option <= max; option += 1) {
    html += `<option value="${option}"${option === value ? ' selected' : ''}>${option}</option>`;
  }
  return `${html}</select></label>`;
}

function baseEditorHtml(operator) {
  return `<div class="base-editor">
    <label class="own-control"><input data-field="own" type="checkbox"${operator.own ? ' checked' : ''}><span>${l('已持有', 'Owned')}</span></label>
    <label>${l('精英', 'Elite')}<select class="select" data-field="elite" aria-label="${escapeHtml(l(`${operator.name}精英阶段`, `${operator.name} elite phase`))}">
      <option value="0"${operator.elite === 0 ? ' selected' : ''}>E0</option>
      <option value="1"${operator.elite === 1 ? ' selected' : ''}>E1</option>
      <option value="2"${operator.elite === 2 ? ' selected' : ''}>E2</option>
    </select></label>
    <label>${l('等级', 'Level')}<input class="input" data-field="level" type="number" min="0" max="90" value="${operator.level}" aria-label="${escapeHtml(l(`${operator.name}等级`, `${operator.name} level`))}"></label>
    <label>${l('潜能', 'Pot.')}<select class="select" data-field="potential" aria-label="${escapeHtml(l(`${operator.name}潜能`, `${operator.name} potential`))}">${Array.from({ length: 7 }, (_, value) => `<option value="${value}"${operator.potential === value ? ' selected' : ''}>${value}</option>`).join('')}</select></label>
    <label>${l('技能', 'Skill')}<select class="select" data-field="mainSkill" aria-label="${escapeHtml(l(`${operator.name}技能等级`, `${operator.name} skill level`))}">${Array.from({ length: 8 }, (_, value) => `<option value="${value}"${operator.mainSkill === value ? ' selected' : ''}>${value}</option>`).join('')}</select></label>
  </div>`;
}

function skillsHtml(operator) {
  if (!operator.skills?.length) return `<span class="no-data">${l('公共目录缺少技能', 'Skills missing from public catalog')}</span>`;
  return `<div class="progress-list">${operator.skills.map((skill, index) => {
    const field = `skill${index + 1}`;
    const rate = operator.popularity?.skillM3?.[index];
    return `<div class="progress-item">
      <span class="progress-label"><strong>S${index + 1} ${escapeHtml(skill.name)}</strong><span>${l('专三率', 'M3 rate')} ${formatPercent(rate)}</span></span>
      ${selectHtml(field, operator[field], 3, l(`${operator.name}${skill.name}专精等级`, `${operator.name} ${skill.name} mastery level`))}
    </div>`;
  }).join('')}</div>`;
}

function modulesHtml(operator) {
  if (!operator.modules?.length) return `<span class="no-data">${l('国际服当前无可用模组', 'No modules currently available on Global')}</span>`;
  return `<div class="progress-list">${operator.modules.map((module) => {
    const field = MODULE_FIELDS[module.type];
    const rate = operator.popularity?.moduleUnlock?.[module.type];
    return `<div class="progress-item">
      <span class="progress-label"><strong>${escapeHtml(module.type)} · ${escapeHtml(module.name)}</strong><span>${l('开启率', 'Unlock rate')} ${formatPercent(rate)}</span></span>
      ${selectHtml(field, operator[field], 3, l(`${operator.name}${module.name}等级`, `${operator.name} ${module.name} level`))}
    </div>`;
  }).join('')}</div>`;
}

function recommendationHtml(operator) {
  const recommendation = recommendationFor(operator);
  const ready = canUseQuickRecommendation(operator);
  const disabledReason = ready ? '' : l('仅对已持有且精二 60 级以上干员开放', 'Available only for owned operators at E2 Lv.60+');
  const skillLabel = recommendation.skill
    ? `<strong>S${recommendation.skill.index + 1} ${escapeHtml(recommendation.skill.name)}</strong> · ${formatPercent(recommendation.skill.rate)}`
    : l('无专精统计', 'No mastery data');
  const moduleLabel = recommendation.module
    ? `<strong>${escapeHtml(recommendation.module.type)} ${escapeHtml(recommendation.module.name)}</strong> · ${formatPercent(recommendation.module.rate)}`
    : l('无可用模组统计', 'No module data');
  const skillDisabled = !ready || !recommendation.skill;
  const moduleDisabled = !ready || !recommendation.module;
  return `<div class="recommendation">
    <div class="recommendation-line"><p>${skillLabel}</p><button class="button" type="button" data-recommend="skill"${skillDisabled ? ' disabled' : ''} title="${escapeHtml(skillDisabled ? disabledReason || l('没有可用的专精统计', 'No mastery statistics available') : l('只把推荐技能设置为专精 3', 'Set only the recommended skill to M3'))}">${l('推荐专三', 'Set top M3')}</button></div>
    <div class="recommendation-line"><p>${moduleLabel}</p><button class="button" type="button" data-recommend="module"${moduleDisabled ? ' disabled' : ''} title="${escapeHtml(moduleDisabled ? disabledReason || l('没有可用的模组统计', 'No module statistics available') : l('只把最高开启率模组设置为 3 级', 'Set only the highest-unlock module to level 3'))}">${l('推荐模组 3', 'Set top module 3')}</button></div>
    ${!ready ? `<p class="recommendation-help">${escapeHtml(disabledReason)}</p>` : ''}
  </div>`;
}

function checkHtml(check) {
  if (check.errors.length) return `<div class="result-cell"><span data-kind="error">${escapeHtml(check.errors.map(localizeCoreMessage).join(l('；', '; ')))}</span></div>`;
  if (check.warnings.length) return `<div class="result-cell"><span data-kind="warning">${escapeHtml(check.warnings.map(localizeCoreMessage).join(l('；', '; ')))}</span></div>`;
  return `<div class="result-cell"><span data-kind="ok">${l('通过', 'Pass')}</span></div>`;
}

function rowHtml(operator) {
  const check = checkOperator(operator);
  const rowState = check.errors.length ? 'error' : check.warnings.length ? 'warning' : 'ok';
  return `<tr data-id="${escapeHtml(operator.id)}" data-state="${rowState}">
    <td><div class="operator-name"><strong>${escapeHtml(operator.name)}</strong><span><b class="rarity">${operator.rarity}★</b> · ${escapeHtml(operator.id)}</span></div></td>
    <td>${baseEditorHtml(operator)}</td>
    <td>${skillsHtml(operator)}</td>
    <td>${modulesHtml(operator)}</td>
    <td>${recommendationHtml(operator)}</td>
    <td>${checkHtml(check)}</td>
  </tr>`;
}

function recommendationScore(operator) {
  const recommendation = recommendationFor(operator);
  return Math.max(recommendation.skill?.rate || 0, recommendation.module?.rate || 0);
}

function filteredRoster() {
  const query = $('search').value.trim().toLowerCase();
  const sort = $('sort').value;
  const list = state.roster.filter((operator) => {
    const check = checkOperator(operator);
    return (!query || operator.name.toLowerCase().includes(query) || operator.id.toLowerCase().includes(query))
      && (!$('ownedOnly').checked || operator.own)
      && (!$('e260Only').checked || canUseQuickRecommendation(operator))
      && (!$('issuesOnly').checked || check.errors.length + check.warnings.length > 0);
  });
  list.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'zh-CN');
    if (sort === 'rarity') return b.rarity - a.rarity || progressionScore(b) - progressionScore(a);
    if (sort === 'recommendation') return recommendationScore(b) - recommendationScore(a) || progressionScore(b) - progressionScore(a);
    if (sort === 'issues') {
      const weight = (operator) => checkOperator(operator).errors.length * 10 + checkOperator(operator).warnings.length;
      return weight(b) - weight(a) || progressionScore(b) - progressionScore(a);
    }
    return progressionScore(b) - progressionScore(a);
  });
  return list;
}

function renderSummary() {
  const owned = state.roster.filter((operator) => operator.own);
  const checks = state.roster.map(checkOperator);
  const errors = checks.filter((check) => check.errors.length).length;
  const warnings = checks.filter((check) => !check.errors.length && check.warnings.length).length;
  const mastery3 = owned.reduce((sum, operator) => sum + [operator.skill1, operator.skill2, operator.skill3].filter((level) => level === 3).length, 0);
  const modules = owned.reduce((sum, operator) => sum + MODULE_TYPES.filter((type) => operator[MODULE_FIELDS[type]] > 0).length, 0);
  const values = [
    [l('国际服目录', 'Global catalog'), state.roster.length, ''],
    [l('已持有', 'Owned'), owned.length, ''],
    [l('精二 60+', 'E2 Lv.60+'), owned.filter(canUseQuickRecommendation).length, ''],
    [l('专三技能', 'M3 skills'), mastery3, ''],
    [l('已开模组', 'Modules'), modules, warnings ? 'warning' : ''],
    [l('有错误干员', 'Operators with errors'), errors, errors ? 'error' : '']
  ];
  $('summary').innerHTML = values.map(([label, value, status]) => `<dl class="summary-item"${status ? ` data-state="${status}"` : ''}><dt>${label}</dt><dd>${value}</dd></dl>`).join('');
}

function render() {
  const visible = filteredRoster();
  $('operatorRows').innerHTML = visible.map(rowHtml).join('');
  $('emptyState').hidden = visible.length > 0;
  renderSummary();
  const ownedCount = state.roster.filter((operator) => operator.own).length;
  $('sourceInfo').textContent = l(
    `当前数据：${localizedValue(state.source)}${state.dirty ? ' · 有未写入修改' : ''}。写入只包含 ${ownedCount} 名已持有干员。`,
    `Current data: ${localizedValue(state.source)}${state.dirty ? ' · unsaved changes' : ''}. Upload includes only ${ownedCount} owned operators.`
  );
  setStatus(l(`显示 ${visible.length} / ${state.roster.length}`, `Showing ${visible.length} / ${state.roster.length}`));
}

function createBaseRoster() {
  state.roster = state.catalog.operators.map(createOperator);
}

function getOrCreateTarget(source, map, unknownIds) {
  const id = String(source.id ?? source.charId ?? '').trim();
  if (!id) return null;
  let target = map.get(id);
  if (!target) {
    target = createUnknownOperator({ ...source, id });
    state.roster.push(target);
    map.set(id, target);
    unknownIds.push(id);
  }
  return target;
}

function mergeList(list, mode) {
  const map = rosterMap();
  const seen = new Set();
  const duplicates = [];
  const unknownIds = [];
  let imported = 0;
  for (const source of list) {
    const id = String(source.id ?? source.charId ?? '').trim();
    if (!id) continue;
    if (seen.has(id)) { duplicates.push(id); continue; }
    seen.add(id);
    const target = getOrCreateTarget(source, map, unknownIds);
    if (!target) continue;
    mergeProgression(target, source, mode);
    imported += 1;
  }
  if (duplicates.length) throw new Error(l(`文件包含重复干员 ID：${duplicates.slice(0, 8).join('、')}`, `File contains duplicate operator IDs: ${duplicates.slice(0, 8).join(', ')}`));
  return { imported, unknownIds };
}

function setRosterFromRemote(list) {
  createBaseRoster();
  const result = mergeList(list, 'remote');
  state.source = {
    zh: `一图流远端（${result.imported} 名${result.unknownIds.length ? `，${result.unknownIds.length} 名目录外干员` : ''}）`,
    en: `Yituliu remote (${result.imported} operators${result.unknownIds.length ? `, ${result.unknownIds.length} outside the catalog` : ''})`
  };
  state.dirty = false;
  render();
  return result;
}

function unpackBackendResponse(response) {
  if (toNumber(response?.code) !== 200) throw new Error(response?.message || response?.msg || l(`一图流返回 code ${response?.code ?? '未知'}`, `Yituliu returned code ${response?.code ?? 'unknown'}`));
  return response.data;
}

async function postJson(path, body) {
  let response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch {
    throw new Error(l('无法连接本地服务；请用“启动工具.cmd”打开，不能直接双击 index.html', 'Cannot reach the local service. Use 启动工具.cmd; do not open index.html directly.'));
  }
  let output;
  try { output = await response.json(); }
  catch { throw new Error(l(`本地服务返回了无法识别的内容（HTTP ${response.status}）`, `The local service returned an unreadable response (HTTP ${response.status})`)); }
  if (!response.ok || !output.ok) {
    if ([401, 403, 407].includes(toNumber(output.status))) throw new Error(l('Token 无效或权限不符，请确认只读/只写 Token 没有混用', 'The token is invalid or has the wrong permission. Check that read-only and write-only tokens were not swapped.'));
    if (toNumber(output.status) === 218) throw new Error(l('一图流拒绝了导入内容；请先运行完整检查并核对 UID', 'Yituliu rejected the import. Run the full check and verify the UID.'));
    throw new Error(output.message || l(`请求失败（HTTP ${output.status || response.status}）`, `Request failed (HTTP ${output.status || response.status})`));
  }
  return output.data;
}

async function readRemote() {
  const token = $('readToken').value.trim();
  if (!token) return showToast(l('缺少只读 Token', 'Read-only token missing'), l('填写只读 Token 后再读取。', 'Enter a read-only token before reading.'), 'error');
  setBusy(true, 'readRemote', l('读取中…', 'Reading…'));
  try {
    const response = await postJson('/api/read', { token });
    const list = unpackBackendResponse(response);
    if (!Array.isArray(list)) throw new Error(l('一图流返回的数据不是干员数组', 'Yituliu did not return an operator array'));
    setRosterFromRemote(list);
    showToast(l('读取成功', 'Read complete'), l(`已载入 ${list.length} 名已持有干员。`, `Loaded ${list.length} owned operators.`), 'success');
  } catch (error) {
    showToast(l('读取失败', 'Read failed'), localizeCoreMessage(error.message), 'error');
  } finally {
    setBusy(false, 'readRemote');
  }
}

async function refreshStatistics() {
  setBusy(true, 'refreshStats', l('刷新中…', 'Refreshing…'));
  try {
    const response = await postJson('/api/statistics', {});
    const backend = unpackBackendResponse(response);
    const meta = applyLiveStatistics(state.roster, backend);
    state.recommendationMeta = meta;
    renderAuxiliaryStatus();
    render();
    showToast(l('推荐率已刷新', 'Rates refreshed'), l(`匹配 ${meta.matched} 名干员；总体样本 ${meta.sampleSize || '未知'}。`, `Matched ${meta.matched} operators; total sample ${meta.sampleSize || 'unknown'}.`), 'success');
  } catch (error) {
    showToast(l('刷新失败', 'Refresh failed'), l(`${error.message}；仍可使用内置快照。`, `${localizeCoreMessage(error.message)}; the bundled snapshot remains available.`), 'error');
  } finally {
    setBusy(false, 'refreshStats');
  }
}

function fullCheck(show = true) {
  const errors = state.roster.filter((operator) => checkOperator(operator).errors.length);
  const warnings = state.roster.filter((operator) => checkOperator(operator).warnings.length);
  if (show) {
    if (errors.length) {
      $('issuesOnly').checked = true;
      render();
      showToast(l('检查未通过', 'Check failed'), l(`${errors.length} 名干员有错误，已切换到“只看需检查”。`, `${errors.length} operators have errors. Switched to Issues only.`), 'error');
    } else {
      showToast(l('检查通过', 'Check passed'), warnings.length ? l(`没有阻止写入的错误；另有 ${warnings.length} 名提醒。`, `No blocking errors; ${warnings.length} operators have warnings.`) : l('没有发现错误。', 'No errors found.'), warnings.length ? 'warning' : 'success');
    }
  }
  return { errors, warnings };
}

function reviewUpload() {
  const token = $('writeToken').value.trim();
  const uid = $('uid').value.trim();
  const owned = state.roster.filter((operator) => operator.own);
  $('uidError').hidden = true;
  $('uid').removeAttribute('aria-invalid');
  if (!token) return showToast(l('缺少只写 Token', 'Write-only token missing'), l('填写只写 Token 后再写入。', 'Enter a write-only token before writing.'), 'error');
  if (!/^\d+$/.test(uid)) {
    $('uid').setAttribute('aria-invalid', 'true');
    $('uidError').textContent = l('UID 必须是个人名片上的纯数字 ID。', 'UID must be the numeric ID shown on your profile card.');
    $('uidError').hidden = false;
    $('uid').focus();
    return;
  }
  if (!owned.length) return showToast(l('已阻止空列表', 'Empty roster blocked'), l('当前没有已持有干员，不能覆盖远端。', 'No operators are marked owned, so the remote roster cannot be replaced.'), 'error');
  const check = fullCheck(false);
  if (check.errors.length) {
    $('issuesOnly').checked = true;
    render();
    return showToast(l('存在错误', 'Errors remain'), l(`${check.errors.length} 名干员仍需修正。`, `${check.errors.length} operators still need correction.`), 'error');
  }
  $('uploadReview').innerHTML = [
    [l('游戏 UID', 'Game UID'), uid],
    [l('写入干员', 'Operators to write'), owned.length],
    [l('提醒', 'Warnings'), check.warnings.length]
  ].map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
  $('confirmReplace').checked = false;
  $('confirmUpload').disabled = true;
  $('uploadDialog').showModal();
}

async function upload() {
  const payload = {
    uid: $('uid').value.trim(),
    nickName: $('nickName').value.trim() || '国际服玩家',
    channelName: $('channelName').value.trim() || '国际服',
    channelMasterId: toNumber($('channelMasterId').value),
    operatorDataList: state.roster.filter((operator) => operator.own).map(uploadRow),
    itemList: []
  };
  $('uploadDialog').close();
  setBusy(true, 'reviewUpload', l('写入中…', 'Writing…'));
  try {
    const response = await postJson('/api/write', { token: $('writeToken').value.trim(), payload });
    unpackBackendResponse(response);
    state.dirty = false;
    state.source = { zh: '已写入一图流服务器', en: 'Written to Yituliu' };
    render();
    showToast(l('写入成功', 'Write complete'), l(`已提交 ${payload.operatorDataList.length} 名干员。建议用只读 Token 再读取核对。`, `Submitted ${payload.operatorDataList.length} operators. Read them back with the read-only token to verify.`), 'success');
  } catch (error) {
    showToast(l('写入失败', 'Write failed'), l(`${error.message}；本地数据和 Token 未被清除。`, `${localizeCoreMessage(error.message)}; local data and tokens were not cleared.`), 'error');
  } finally {
    setBusy(false, 'reviewUpload');
  }
}

function safeFix() {
  let changed = 0;
  for (const operator of state.roster) {
    const before = JSON.stringify(operator);
    Object.assign(operator, normalizeForDraft(operator));
    applyDependencies(operator, 'safe-fix');
    if (operator.own) {
      // Keep the single source of truth in core.js so UI fixes and imports never
      // drift into using different level caps.
      const cap = maxOperatorLevel(operator.rarity, operator.elite);
      if (cap) operator.level = clamp(operator.level, 1, cap);
    }
    if (JSON.stringify(operator) !== before) changed += 1;
  }
  if (changed) state.dirty = true;
  render();
  showToast(changed ? l('依赖已补齐', 'Prerequisites filled') : l('无需修正', 'No changes needed'), changed ? l(`调整了 ${changed} 名干员；未删除目录外数据。`, `Adjusted ${changed} operators; no out-of-catalog data was deleted.`) : l('没有发现可安全自动补齐的项目。', 'No prerequisite could be filled safely.'), changed ? 'success' : 'info');
}

function downloadJson(fileName, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function draftPayload() {
  return {
    format: 'yituliu-local-roster-draft',
    version: 2,
    createdAt: new Date().toISOString(),
    profile: {
      uid: $('uid').value.trim(),
      nickName: $('nickName').value.trim(),
      channelName: $('channelName').value.trim(),
      channelMasterId: toNumber($('channelMasterId').value)
    },
    // Tokens are intentionally excluded. Drafts are safe to inspect and keep locally.
    operators: state.roster.map(normalizeForDraft)
  };
}

async function importMaa(file) {
  const data = parseJsonText(await file.text());
  const list = extractMaaList(data);
  if (!list.length) throw new Error(l('未找到 MAA OperBox 干员数组', 'No MAA OperBox operator array found'));
  const result = mergeList(list, 'maa');
  state.source = { zh: `MAA ${file.name}（${result.imported} 条）`, en: `MAA ${file.name} (${result.imported} records)` };
  state.dirty = true;
  state.importStatus = {
    zh: `MAA 已合并 ${result.imported} 条${result.unknownIds.length ? `；${result.unknownIds.length} 条不在目录` : ''}。`,
    en: `Merged ${result.imported} MAA records${result.unknownIds.length ? `; ${result.unknownIds.length} are outside the catalog` : ''}.`
  };
  renderAuxiliaryStatus();
  render();
  showToast(l('MAA 导入成功', 'MAA import complete'), l('基础练度已合并；原有专精和模组未被无故清除。', 'Base progression was merged; existing mastery and module entries were preserved.'), 'success');
}

async function importArkprts(file) {
  const data = parseJsonText(await file.text());
  const list = extractArkprtsList(data);
  if (!list.length) throw new Error(l('未找到 user.troop.chars 或净化后的 operators 数组', 'No user.troop.chars or sanitized operators array found'));
  const result = mergeList(list, 'arkprts');
  state.source = { zh: `ArkPRTS ${file.name}（${result.imported} 条）`, en: `ArkPRTS ${file.name} (${result.imported} records)` };
  state.dirty = true;
  const profile = data?.profile || data?.user?.status || {};
  if (profile.uid) $('uid').value = String(profile.uid);
  if (profile.nickName) $('nickName').value = String(profile.nickName);
  if (profile.channelName) $('channelName').value = String(profile.channelName);
  if (profile.channelMasterId != null) $('channelMasterId').value = String(profile.channelMasterId);
  state.importStatus = {
    zh: `ArkPRTS 已合并 ${result.imported} 条；请重点核对阿米娅形态和目录外模组。`,
    en: `Merged ${result.imported} ArkPRTS records. Carefully verify Amiya forms and out-of-catalog modules.`
  };
  renderAuxiliaryStatus();
  render();
  showToast(l('ArkPRTS 导入成功', 'ArkPRTS import complete'), l('基础、专精和已解锁模组已合并；请运行完整检查。', 'Base, mastery, and unlocked module data were merged. Run the full check.'), 'warning');
}

async function restoreDraft(file) {
  const data = parseJsonText(await file.text());
  if (data?.format !== 'yituliu-local-roster-draft' || !Array.isArray(data.operators)) throw new Error(l('不是本工具生成的草稿', 'This is not a draft generated by this workbench'));
  createBaseRoster();
  const map = rosterMap();
  const unknown = [];
  for (const saved of data.operators) {
    const target = getOrCreateTarget(saved, map, unknown);
    if (target) Object.assign(target, normalizeForDraft({ ...target, ...saved }));
  }
  const profile = data.profile || {};
  for (const id of ['uid', 'nickName', 'channelName', 'channelMasterId']) if (profile[id] != null) $(id).value = profile[id];
  state.source = { zh: `本地草稿 ${file.name}`, en: `Local draft ${file.name}` };
  state.dirty = true;
  state.importStatus = {
    zh: `草稿已恢复${unknown.length ? `；保留 ${unknown.length} 条目录外干员` : ''}。`,
    en: `Draft restored${unknown.length ? `; preserved ${unknown.length} out-of-catalog operators` : ''}.`
  };
  renderAuxiliaryStatus();
  render();
  showToast(l('草稿恢复成功', 'Draft restored'), l('Token 没有包含在草稿中。', 'Tokens were not included in the draft.'), 'success');
}

async function handleFileInput(event, importer, label) {
  const file = event.target.files?.[0];
  if (!file) return;
  try { await importer(file); }
  catch (error) { showToast(l(`${label.zh}失败`, `${label.en} failed`), localizeCoreMessage(error.message), 'error'); }
  finally { event.target.value = ''; }
}

async function checkHealth() {
  try {
    const response = await fetch('/health', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.ok || data.data?.loopback !== true) throw new Error();
    state.serverState = 'ok';
    renderAuxiliaryStatus();
  } catch {
    state.serverState = 'error';
    renderAuxiliaryStatus();
    showToast(l('本地服务未连接', 'Local service disconnected'), l('请关闭本页并用“启动工具.cmd”重新打开。', 'Close this page and reopen it with 启动工具.cmd.'), 'error');
  }
}

async function initialize() {
  try {
    const response = await fetch('/data/operator-catalog.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.catalog = await response.json();
    if (!Array.isArray(state.catalog.operators) || state.catalog.operators.length < 350) throw new Error(l('公共目录不完整', 'The public catalog is incomplete'));
    createBaseRoster();
    state.recommendationMeta = {
      sampleSize: state.catalog.statisticsSampleSize,
      createdAt: state.catalog.statisticsCreatedAt
    };
    state.catalogError = false;
    renderAuxiliaryStatus();
    render();
    await checkHealth();
  } catch (error) {
    state.catalogError = true;
    renderAuxiliaryStatus();
    setStatus(l('初始化失败', 'Initialization failed'));
    showToast(l('初始化失败', 'Initialization failed'), l(`${error.message}；请重新构建或解压完整运行包。`, `${localizeCoreMessage(error.message)}; rebuild or extract the complete run package.`), 'error');
  }
}

$('operatorRows').addEventListener('change', (event) => {
  const row = event.target.closest('tr[data-id]');
  const field = event.target.dataset.field;
  if (!row || !field) return;
  const operator = rosterMap().get(row.dataset.id);
  if (!operator) return;
  operator[field] = event.target.type === 'checkbox' ? event.target.checked : toNumber(event.target.value);
  const changes = applyDependencies(operator, field);
  state.dirty = true;
  render();
  if (changes.length) showToast(l('已补齐依赖', 'Prerequisites filled'), changes.map(localizeCoreMessage).join(l('；', '; ')), 'success');
});

$('operatorRows').addEventListener('click', (event) => {
  const button = event.target.closest('[data-recommend]');
  const row = event.target.closest('tr[data-id]');
  if (!button || !row) return;
  const operator = rosterMap().get(row.dataset.id);
  const result = applyQuickRecommendation(operator, button.dataset.recommend);
  if (!result.ok) return showToast(l('不能应用推荐', 'Cannot apply recommendation'), localizeCoreMessage(result.reason), 'warning');
  state.dirty = true;
  render();
  const action = button.dataset.recommend === 'skill' ? l('专精 3', 'M3') : l('模组 3 级', 'module level 3');
  showToast(l('已应用推荐', 'Recommendation applied'), l(`${operator.name}：${result.item.name} → ${action}。`, `${operator.name}: ${result.item.name} → ${action}.`), 'success');
});

$('readRemote').addEventListener('click', readRemote);
$('refreshStats').addEventListener('click', refreshStatistics);
$('runCheck').addEventListener('click', () => fullCheck(true));
$('reviewUpload').addEventListener('click', reviewUpload);
$('confirmUpload').addEventListener('click', upload);
$('safeFix').addEventListener('click', safeFix);
$('downloadDraft').addEventListener('click', () => downloadJson('一图流干员练度_本地草稿.json', draftPayload()));
$('maaFile').addEventListener('change', (event) => handleFileInput(event, importMaa, { zh: 'MAA 导入', en: 'MAA import' }));
$('arkprtsFile').addEventListener('change', (event) => handleFileInput(event, importArkprts, { zh: 'ArkPRTS 导入', en: 'ArkPRTS import' }));
$('draftFile').addEventListener('change', (event) => handleFileInput(event, restoreDraft, { zh: '草稿恢复', en: 'Draft restore' }));
$('confirmReplace').addEventListener('change', (event) => { $('confirmUpload').disabled = !event.target.checked || state.busy; });
$('openArkprtsHelp').addEventListener('click', () => $('arkprtsDialog').showModal());
$('languageToggle').addEventListener('click', () => {
  state.language = state.language === 'zh' ? 'en' : 'zh';
  applyStaticLanguage();
  renderAuxiliaryStatus();
  if (state.catalog) render();
});

for (const id of ['search', 'sort', 'ownedOnly', 'e260Only', 'issuesOnly']) {
  $(id).addEventListener(id === 'search' ? 'input' : 'change', render);
}
$('resetFilters').addEventListener('click', () => {
  $('search').value = '';
  $('sort').value = 'progress';
  $('ownedOnly').checked = true;
  $('e260Only').checked = false;
  $('issuesOnly').checked = false;
  render();
});
document.querySelectorAll('.reveal-token').forEach((button) => button.addEventListener('click', () => {
  const input = $(button.dataset.for);
  input.type = input.type === 'password' ? 'text' : 'password';
  button.textContent = input.type === 'password' ? l('显示', 'Show') : l('隐藏', 'Hide');
}));
document.querySelectorAll('[data-scroll]').forEach((button) => button.addEventListener('click', () => {
  $(button.dataset.scroll).scrollIntoView({ behavior: 'smooth', block: 'start' });
}));
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
    event.preventDefault();
    $('search').focus();
  }
});
window.addEventListener('beforeunload', (event) => {
  if (state.dirty) {
    event.preventDefault();
    event.returnValue = '';
  }
});

// Minimal test hook: pure rules remain exported from core.js; this exposes only
// stateful integration points without tokens or network helpers.
window.__ROSTER_WORKBENCH__ = {
  get roster() { return state.roster; },
  get language() { return state.language; },
  mergeList,
  fullCheck,
  draftPayload
};

applyStaticLanguage();
renderAuxiliaryStatus();
initialize();
