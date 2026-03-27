const NAME_KEY = 'mbr_names';
const WEIGHT_KEY = 'mbr_weights';
const DEV_ASSIST_KEY = 'mbr_dev_physics_assist';
const PARTICIPANT_SNAPSHOT_KEY = 'mbr_participants_snapshot';
const MIN_WEIGHT = 0.1;
const MAX_WEIGHT = 50;
const STEP_WEIGHT = 0.1;
const DEV_ASSIST_MIN = 0;
const DEV_ASSIST_MAX = 100;
const DEV_ASSIST_STEP = 1;

let lastParticipantSnapshot = '';
let lastRenderedTargetId = '';

function isKoreanLocale() {
  const locale = (document.documentElement.lang || navigator.language || 'en').toLowerCase();
  return locale.startsWith('ko');
}

function formatWeight(value) {
  return Number(value.toFixed(2)).toString();
}

function clampWeight(value) {
  if (Number.isNaN(value)) return 1;
  return Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, value));
}

function clampDevAssistStrength(value) {
  if (Number.isNaN(value)) return 0;
  return Math.min(DEV_ASSIST_MAX, Math.max(DEV_ASSIST_MIN, Math.round(value)));
}

function formatAssistStrength(value) {
  return clampDevAssistStrength(value).toString();
}

function parseName(nameStr) {
  const weightRegex = /\/(\d+(?:\.\d+)?)/;
  const countRegex = /\*(\d+)/;
  const name = /^\s*([^\/*]+)?/.exec(nameStr)?.[1]?.trim();
  const weightMatch = weightRegex.exec(nameStr);
  const countMatch = countRegex.exec(nameStr);

  if (!name) return null;

  return {
    name,
    weight: weightMatch ? parseFloat(weightMatch[1]) : 1,
    count: countMatch ? parseInt(countMatch[1], 10) : 1,
  };
}

function getRawNames() {
  return (localStorage.getItem(NAME_KEY) || '').trim();
}

function getNames(rawNames = getRawNames()) {
  return rawNames
    .split(/[,\r\n]/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getStoredWeights() {
  try {
    return JSON.parse(localStorage.getItem(WEIGHT_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveStoredWeights(weightMap) {
  localStorage.setItem(WEIGHT_KEY, JSON.stringify(weightMap));
}

function normalizeParticipantRecord(participant) {
  const storedWeights = getStoredWeights();
  const name = typeof participant?.name === 'string' ? participant.name.trim() : '';
  const countValue = Number(participant?.count ?? 1);
  const count = Number.isFinite(countValue) ? Math.max(1, Math.round(countValue)) : 1;
  const inlineWeightValue = Number(participant?.inlineWeight ?? participant?.weight ?? 1);
  const inlineWeight = clampWeight(Number.isFinite(inlineWeightValue) ? inlineWeightValue : 1);

  if (!name) return null;

  return {
    name,
    count,
    inlineWeight,
    weight:
      typeof storedWeights[name] === 'number' && storedWeights[name] > 0
        ? clampWeight(storedWeights[name])
        : inlineWeight,
  };
}

function buildParticipantsFromRawNames(rawNames = getRawNames()) {
  const map = new Map();

  getNames(rawNames).forEach((raw) => {
    const parsed = parseName(raw);
    if (!parsed) return;

    const existing = map.get(parsed.name) || {
      name: parsed.name,
      count: 0,
      inlineWeight: 1,
    };

    existing.count += parsed.count || 1;
    if (parsed.weight !== 1) {
      existing.inlineWeight = parsed.weight;
    }

    map.set(parsed.name, existing);
  });

  return Array.from(map.values())
    .map(normalizeParticipantRecord)
    .filter(Boolean);
}

function getParticipantsFromSnapshot() {
  try {
    const value = JSON.parse(localStorage.getItem(PARTICIPANT_SNAPSHOT_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value.map(normalizeParticipantRecord).filter(Boolean);
  } catch {
    return [];
  }
}

function getParticipantsFromOpener() {
  try {
    const openerWindow = window.opener;
    if (!openerWindow || openerWindow.closed) return [];

    if (typeof openerWindow.getParticipantsForWeightEditor === 'function') {
      const value = openerWindow.getParticipantsForWeightEditor();
      if (Array.isArray(value)) {
        const normalized = value.map(normalizeParticipantRecord).filter(Boolean);
        if (normalized.length) return normalized;
      }
    }

    const openerNames = openerWindow.document?.querySelector?.('#in_names')?.value;
    if (typeof openerNames === 'string' && openerNames.trim()) {
      return buildParticipantsFromRawNames(openerNames);
    }
  } catch {
    return [];
  }

  return [];
}

function getParticipantsFromRenderedRows() {
  const rows = document.querySelectorAll('.weight-popup-row');
  if (!rows.length) return [];

  return Array.from(rows)
    .map((row) => normalizeParticipantRecord({
      name: row.getAttribute('data-participant-name') || '',
      count: Number(row.getAttribute('data-participant-count') || '1'),
      weight: Number(row.getAttribute('data-participant-weight') || '1'),
    }))
    .filter(Boolean);
}

function getParticipants() {
  const openerParticipants = getParticipantsFromOpener();
  if (openerParticipants.length) return openerParticipants;

  const snapshotParticipants = getParticipantsFromSnapshot();
  if (snapshotParticipants.length) return snapshotParticipants;

  const rawNameParticipants = buildParticipantsFromRawNames();
  if (rawNameParticipants.length) return rawNameParticipants;

  return getParticipantsFromRenderedRows();
}

function getAssistTargets(participants = getParticipants()) {
  const sourceParticipants = participants.length ? participants : getParticipantsFromRenderedRows();
  const targets = [];
  sourceParticipants.forEach((participant) => {
    const copies = Math.max(1, participant.count || 1);
    for (let i = 0; i < copies; i += 1) {
      const copyIndex = i + 1;
      const label = copies > 1 ? `${participant.name} #${copyIndex}` : participant.name;
      targets.push({
        id: `${participant.name}::${copyIndex}`,
        name: participant.name,
        copyIndex,
        label,
      });
    }
  });
  return targets;
}

function getDefaultDevAssistConfig() {
  return { targetId: '', strength: 0 };
}

function normalizeDevAssistConfig(value) {
  return {
    targetId: typeof value?.targetId === 'string' ? value.targetId : '',
    strength: clampDevAssistStrength(typeof value?.strength === 'number' ? value.strength : Number(value?.strength ?? 0)),
  };
}

function loadDevAssistConfig() {
  try {
    return normalizeDevAssistConfig(JSON.parse(localStorage.getItem(DEV_ASSIST_KEY) || '{}'));
  } catch {
    return getDefaultDevAssistConfig();
  }
}

function saveDevAssistConfig(config) {
  const normalized = normalizeDevAssistConfig(config);
  localStorage.setItem(DEV_ASSIST_KEY, JSON.stringify(normalized));
}

function buildStatusMessage(participants) {
  const adjusted = participants.filter((participant) => Math.abs(participant.weight - 1) > 0.001).length;

  if (!participants.length) {
    return isKoreanLocale()
      ? '메인 핀볼 창에서 참가자를 입력해 주세요.'
      : 'Enter participant names in the main pinball window.';
  }

  if (!adjusted) {
    return isKoreanLocale()
      ? `현재 ${participants.length}명 모두 기본 가중치(1배)`
      : `All ${participants.length} participants are using the default weight (1x).`;
  }

  return isKoreanLocale()
    ? `현재 ${participants.length}명 중 ${adjusted}명의 가중치를 조절 중입니다.`
    : `${adjusted} of ${participants.length} participants currently have custom weights.`;
}

function updateStatus(participants) {
  const adjusted = participants.filter((participant) => Math.abs(participant.weight - 1) > 0.001).length;
  const participantCount = document.querySelector('#participantCount');
  const customWeightCount = document.querySelector('#customWeightCount');

  if (participantCount) participantCount.textContent = participants.length.toString();
  if (customWeightCount) customWeightCount.textContent = adjusted.toString();

  document.title = isKoreanLocale()
    ? `가중치 조절 창 · ${buildStatusMessage(participants)}`
    : `Weight Control · ${buildStatusMessage(participants)}`;
}

function createRow(participant) {
  const wrapper = document.createElement('div');
  wrapper.className = 'weight-popup-row';
  wrapper.setAttribute('data-participant-name', participant.name);
  wrapper.setAttribute('data-participant-count', String(participant.count));
  wrapper.setAttribute('data-participant-weight', formatWeight(participant.weight));
  wrapper.innerHTML = `
    <div class="weight-popup-meta">
      <strong class="weight-popup-name"></strong>
      <span class="weight-popup-count"></span>
    </div>
    <div class="weight-popup-controls">
      <div class="weight-popup-control-group">
        <div class="weight-popup-control-title">${isKoreanLocale() ? '가중치' : 'Weight'}</div>
        <div class="weight-popup-control-inputs">
          <input type="range" class="weight-slider" min="${MIN_WEIGHT}" max="${MAX_WEIGHT}" step="${STEP_WEIGHT}" />
          <input type="number" class="weight-number" min="${MIN_WEIGHT}" max="${MAX_WEIGHT}" step="${STEP_WEIGHT}" />
        </div>
      </div>
    </div>
  `;

  const name = wrapper.querySelector('.weight-popup-name');
  const count = wrapper.querySelector('.weight-popup-count');
  const slider = wrapper.querySelector('.weight-slider');
  const numberInput = wrapper.querySelector('.weight-number');

  name.textContent = participant.name;
  count.textContent = isKoreanLocale()
    ? participant.count > 1
      ? `추첨 공 ${participant.count}개`
      : '추첨 공 1개'
    : participant.count > 1
      ? `${participant.count} marbles`
      : '1 marble';

  slider.dataset.name = participant.name;
  numberInput.dataset.name = participant.name;
  slider.value = formatWeight(participant.weight);
  numberInput.value = formatWeight(participant.weight);

  return wrapper;
}

function getAssistSummary(strength) {
  if (strength <= 0) return isKoreanLocale() ? '개발용 물리 보정 꺼짐' : 'Developer physics assist is off';
  if (strength < 20) return isKoreanLocale() ? `미세 보정 ${strength}%` : `Subtle assist ${strength}%`;
  if (strength < 45) return isKoreanLocale() ? `완만한 보정 ${strength}%` : `Moderate assist ${strength}%`;
  if (strength < 75) return isKoreanLocale() ? `뚜렷한 보정 ${strength}%` : `Visible assist ${strength}%`;
  return isKoreanLocale() ? `강한 보정 ${strength}%` : `Strong assist ${strength}%`;
}

function normalizeAssistConfigForTargets(rawConfig, targets) {
  const config = normalizeDevAssistConfig(rawConfig);
  const hasTarget = targets.some((target) => target.id === config.targetId);
  if (!hasTarget) {
    return {
      ...config,
      targetId: '',
      strength: config.targetId ? config.strength : config.strength,
    };
  }
  return config;
}

function renderAssistTargetButtons(targets, selectedId) {
  const list = document.querySelector('#devAssistTargetList');
  const count = document.querySelector('#devAssistTargetCount');
  const empty = document.querySelector('#devAssistTargetEmpty');
  if (!(list instanceof HTMLDivElement)) return;

  const effectiveSelectedId = selectedId || lastRenderedTargetId || '';
  list.innerHTML = '';

  if (count) count.textContent = targets.length.toString();
  if (empty) empty.toggleAttribute('hidden', targets.length > 0);
  const debug = document.querySelector('#devAssistTargetDebug');
  if (debug) {
    const preview = targets.slice(0, 4).map((target) => target.label).join(', ');
    debug.textContent = targets.length
      ? (isKoreanLocale() ? `표시 중인 참가자 기준 후보 ${targets.length}개: ${preview}${targets.length > 4 ? ' ...' : ''}` : `Built ${targets.length} targets from visible rows: ${preview}${targets.length > 4 ? ' ...' : ''}`)
      : (isKoreanLocale() ? '표시 중인 참가자 rows 기준으로 후보를 만들지 못했습니다.' : 'No targets could be built from the visible participant rows.');
  }

  targets.forEach((target) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'weight-popup-target-button';
    button.dataset.targetId = target.id;
    button.dataset.targetLabel = target.label;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', target.id === effectiveSelectedId ? 'true' : 'false');
    button.innerHTML = `
      <span class="weight-popup-target-button-name">${target.label}</span>
      <span class="weight-popup-target-button-meta">${isKoreanLocale() ? '개발 보정 대상' : 'Assist target'}</span>
    `;
    if (target.id === effectiveSelectedId) {
      button.classList.add('is-selected');
      lastRenderedTargetId = target.id;
    }
    list.append(button);
  });

  if (!targets.some((target) => target.id === effectiveSelectedId)) {
    lastRenderedTargetId = '';
  }
}

function syncAssistInputs(value) {
  const slider = document.querySelector('#devAssistStrength');
  const numberInput = document.querySelector('#devAssistStrengthNumber');
  const valueLabel = document.querySelector('#devAssistStrengthValue');
  const formatted = formatAssistStrength(value);
  if (slider) slider.value = formatted;
  if (numberInput) numberInput.value = formatted;
  if (valueLabel) valueLabel.textContent = formatted;
}

function renderAssistPreview(targets, config) {
  const summary = document.querySelector('#devAssistSummary');
  const targetBadge = document.querySelector('#devAssistTargetBadge');
  const downwardValue = document.querySelector('#devAssistDownwardValue');
  const reboundValue = document.querySelector('#devAssistReboundValue');
  const spinValue = document.querySelector('#devAssistSpinValue');

  const targetLabel = targets.find((target) => target.id === config.targetId)?.label;
  const summaryText = targetLabel ? `${targetLabel} · ${getAssistSummary(config.strength)}` : getAssistSummary(config.strength);

  if (summary) summary.textContent = summaryText;
  if (targetBadge) targetBadge.textContent = targetLabel || (isKoreanLocale() ? '선택된 공 없음' : 'No target marble selected');
  if (downwardValue) downwardValue.textContent = `+${Math.round(config.strength * 0.45)}%`;
  if (reboundValue) reboundValue.textContent = `${Math.round(config.strength * 0.65)}%`;
  if (spinValue) spinValue.textContent = `${Math.round(config.strength * 0.8)}%`;
}

function saveAssistConfigFromControls({ autoPickTarget = false, explicitTargetId = null } = {}) {
  const slider = document.querySelector('#devAssistStrength');
  if (!(slider instanceof HTMLInputElement)) return;

  const participants = getParticipants();
  const targets = getAssistTargets(participants);
  let targetId = typeof explicitTargetId === 'string' ? explicitTargetId : lastRenderedTargetId;
  const strength = clampDevAssistStrength(parseFloat(slider.value));

  if (!targets.length) {
    targetId = '';
  } else if (!targetId && autoPickTarget && strength > 0) {
    targetId = targets[0].id;
  }

  const nextConfig = {
    targetId: targets.some((target) => target.id === targetId) ? targetId : '',
    strength,
  };

  saveDevAssistConfig(nextConfig);
  lastRenderedTargetId = nextConfig.targetId;
  syncAssistInputs(nextConfig.strength);
  renderDevAssist(participants);
}

function renderWeightRows(participants) {
  const rowsContainer = document.querySelector('#weightPopupRows');
  const emptyState = document.querySelector('#weightPopupEmpty');
  if (!rowsContainer || !emptyState) return;

  rowsContainer.innerHTML = '';
  emptyState.toggleAttribute('hidden', participants.length > 0);
  participants.forEach((participant) => rowsContainer.append(createRow(participant)));
}

function renderDevAssist(participants = getParticipants()) {
  const sourceParticipants = participants.length ? participants : getParticipantsFromRenderedRows();
  const targets = getAssistTargets(sourceParticipants);
  const list = document.querySelector('#devAssistTargetList');
  const slider = document.querySelector('#devAssistStrength');
  const numberInput = document.querySelector('#devAssistStrengthNumber');
  const resetButton = document.querySelector('#btnResetDevAssist');

  let config = normalizeAssistConfigForTargets(loadDevAssistConfig(), targets);

  if (!config.targetId && lastRenderedTargetId && targets.some((target) => target.id === lastRenderedTargetId)) {
    config = { ...config, targetId: lastRenderedTargetId };
  }

  renderAssistTargetButtons(targets, config.targetId);
  syncAssistInputs(config.strength);
  renderAssistPreview(targets, config);

  const disabled = targets.length === 0;
  if (list) list.toggleAttribute('data-disabled', disabled);
  if (slider) slider.disabled = disabled;
  if (numberInput) numberInput.disabled = disabled;
  if (resetButton) resetButton.disabled = disabled && config.strength === 0;

  saveDevAssistConfig(config);
}

function render() {
  const participants = getParticipants();
  renderWeightRows(participants);
  renderDevAssist(participants);
  updateStatus(participants);
  lastParticipantSnapshot = getParticipantSyncSnapshot();
}

function applyWeight(name, value) {
  const nextValue = clampWeight(value);
  const weightMap = getStoredWeights();
  weightMap[name] = nextValue;
  saveStoredWeights(weightMap);
  updateStatus(getParticipants());
}

function syncWeightInputs(name, value) {
  const formatted = formatWeight(value);
  document.querySelectorAll(`[data-name="${CSS.escape(name)}"]`).forEach((input) => {
    input.value = formatted;
  });
  document.querySelectorAll(`.weight-popup-row[data-participant-name="${CSS.escape(name)}"]`).forEach((row) => {
    row.setAttribute('data-participant-weight', formatted);
  });
}

function resetAllWeights() {
  const participants = getParticipants();
  const weightMap = getStoredWeights();
  participants.forEach((participant) => {
    weightMap[participant.name] = 1;
  });
  saveStoredWeights(weightMap);
  render();
}

function resetDevAssist() {
  lastRenderedTargetId = '';
  saveDevAssistConfig(getDefaultDevAssistConfig());
  renderDevAssist();
}

function getParticipantSyncSnapshot() {
  const rawNames = getRawNames();
  const snapshot = localStorage.getItem(PARTICIPANT_SNAPSHOT_KEY) || '';
  return `${rawNames}@@${snapshot}`;
}

function refreshIfNamesChanged() {
  const currentSnapshot = getParticipantSyncSnapshot();
  if (currentSnapshot !== lastParticipantSnapshot) {
    render();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const assistSlider = document.querySelector('#devAssistStrength');
  const assistNumber = document.querySelector('#devAssistStrengthNumber');
  if (assistSlider) {
    assistSlider.min = DEV_ASSIST_MIN.toString();
    assistSlider.max = DEV_ASSIST_MAX.toString();
    assistSlider.step = DEV_ASSIST_STEP.toString();
  }
  if (assistNumber) {
    assistNumber.min = DEV_ASSIST_MIN.toString();
    assistNumber.max = DEV_ASSIST_MAX.toString();
    assistNumber.step = DEV_ASSIST_STEP.toString();
  }

  render();

  document.querySelector('#btnRefreshWeights')?.addEventListener('click', render);
  document.querySelector('#btnResetWeights')?.addEventListener('click', resetAllWeights);
  document.querySelector('#btnResetDevAssist')?.addEventListener('click', resetDevAssist);
  document.querySelector('#btnCloseWeights')?.addEventListener('click', () => window.close());

  document.querySelector('#weightPopupRows')?.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.dataset.name || target.type !== 'range') return;
    const nextValue = clampWeight(parseFloat(target.value));
    syncWeightInputs(target.dataset.name, nextValue);
    applyWeight(target.dataset.name, nextValue);
  });

  document.querySelector('#weightPopupRows')?.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.dataset.name || target.type !== 'number') return;
    const nextValue = clampWeight(parseFloat(target.value));
    syncWeightInputs(target.dataset.name, nextValue);
    applyWeight(target.dataset.name, nextValue);
  });

  document.querySelector('#devAssistTargetList')?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest('.weight-popup-target-button');
    if (!(button instanceof HTMLButtonElement)) return;
    lastRenderedTargetId = button.dataset.targetId || '';
    saveAssistConfigFromControls({ autoPickTarget: false, explicitTargetId: lastRenderedTargetId });
  });

  document.querySelector('#devAssistStrength')?.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const nextValue = clampDevAssistStrength(parseFloat(target.value));
    syncAssistInputs(nextValue);
    saveAssistConfigFromControls({ autoPickTarget: true });
  });

  document.querySelector('#devAssistStrengthNumber')?.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const nextValue = clampDevAssistStrength(parseFloat(target.value));
    syncAssistInputs(nextValue);
    saveAssistConfigFromControls({ autoPickTarget: true });
  });

  window.addEventListener('storage', (event) => {
    if (event.key === NAME_KEY || event.key === WEIGHT_KEY || event.key === DEV_ASSIST_KEY || event.key === PARTICIPANT_SNAPSHOT_KEY) {
      render();
    }
  });

  window.addEventListener('focus', refreshIfNamesChanged);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshIfNamesChanged();
  });
  window.setInterval(refreshIfNamesChanged, 800);
});
