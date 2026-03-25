import './localization';

type ParsedParticipant = {
  name: string;
  count: number;
  inlineWeight: number;
};

type Participant = ParsedParticipant & {
  weight: number;
};

const NAME_KEY = 'mbr_names';
const WEIGHT_KEY = 'mbr_weights';
const MIN_WEIGHT = 0.1;
const MAX_WEIGHT = 50;
const STEP_WEIGHT = 0.1;

function isKoreanLocale() {
  const locale = (document.documentElement.lang || navigator.language || 'en').toLowerCase();
  return locale.startsWith('ko');
}

function formatWeight(value: number) {
  return Number(value.toFixed(2)).toString();
}

function clampWeight(value: number) {
  if (Number.isNaN(value)) return 1;
  return Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, value));
}

function parseName(nameStr: string) {
  const weightRegex = /\/(\d+(?:\.\d+)?)/;
  const countRegex = /\*(\d+)/;
  const name = /^\s*([^\/*]+)?/.exec(nameStr)?.[1]?.trim();
  const weightMatch = weightRegex.exec(nameStr);
  const countMatch = countRegex.exec(nameStr);

  if (!name) {
    return null;
  }

  return {
    name,
    weight: weightMatch ? parseFloat(weightMatch[1]) : 1,
    count: countMatch ? parseInt(countMatch[1], 10) : 1,
  };
}

function getRawNames() {
  return (localStorage.getItem(NAME_KEY) || '').trim();
}

function getNames() {
  const value = getRawNames();
  return value.split(/[,\r\n]/g).map((entry) => entry.trim()).filter(Boolean);
}

function getStoredWeights(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(WEIGHT_KEY) || '{}');
  } catch (error) {
    return {};
  }
}

function saveStoredWeights(weightMap: Record<string, number>) {
  localStorage.setItem(WEIGHT_KEY, JSON.stringify(weightMap));
}

function getParticipants(): Participant[] {
  const map = new Map<string, ParsedParticipant>();

  getNames().forEach((raw) => {
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

  const storedWeights = getStoredWeights();

  return Array.from(map.values()).map((participant) => ({
    ...participant,
    weight:
      typeof storedWeights[participant.name] === 'number' && storedWeights[participant.name] > 0
        ? clampWeight(storedWeights[participant.name])
        : participant.inlineWeight || 1,
  }));
}

function buildStatusMessage(participants: Participant[]) {
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

function updateStatus(participants: Participant[]) {
  const adjusted = participants.filter((participant) => Math.abs(participant.weight - 1) > 0.001).length;
  const participantCount = document.querySelector('#participantCount');
  const customWeightCount = document.querySelector('#customWeightCount');

  if (participantCount) participantCount.textContent = participants.length.toString();
  if (customWeightCount) customWeightCount.textContent = adjusted.toString();

  document.title = isKoreanLocale()
    ? `가중치 조절 창 · ${buildStatusMessage(participants)}`
    : `Weight Control · ${buildStatusMessage(participants)}`;
}

function createRow(participant: Participant) {
  const wrapper = document.createElement('div');
  wrapper.className = 'weight-popup-row';
  wrapper.innerHTML = `
    <div class="weight-popup-meta">
      <strong class="weight-popup-name"></strong>
      <span class="weight-popup-count"></span>
    </div>
    <div class="weight-popup-controls">
      <input
        type="range"
        class="weight-slider"
        min="${MIN_WEIGHT}"
        max="${MAX_WEIGHT}"
        step="${STEP_WEIGHT}"
      />
      <input
        type="number"
        class="weight-number"
        min="${MIN_WEIGHT}"
        max="${MAX_WEIGHT}"
        step="${STEP_WEIGHT}"
      />
    </div>
  `;

  const name = wrapper.querySelector('.weight-popup-name') as HTMLElement;
  const count = wrapper.querySelector('.weight-popup-count') as HTMLElement;
  const slider = wrapper.querySelector('.weight-slider') as HTMLInputElement;
  const numberInput = wrapper.querySelector('.weight-number') as HTMLInputElement;

  name.textContent = participant.name;
  count.textContent = isKoreanLocale()
    ? (participant.count > 1 ? `추첨 공 ${participant.count}개` : '추첨 공 1개')
    : (participant.count > 1 ? `${participant.count} marbles` : '1 marble');

  slider.dataset.name = participant.name;
  numberInput.dataset.name = participant.name;
  slider.value = formatWeight(participant.weight);
  numberInput.value = formatWeight(participant.weight);

  return wrapper;
}

function render() {
  const participants = getParticipants();
  const rowsContainer = document.querySelector('#weightPopupRows');
  const emptyState = document.querySelector('#weightPopupEmpty');
  if (!rowsContainer || !emptyState) return;

  rowsContainer.innerHTML = '';
  emptyState.toggleAttribute('hidden', participants.length > 0);

  if (participants.length) {
    participants.forEach((participant) => {
      rowsContainer.append(createRow(participant));
    });
  }

  updateStatus(participants);
}

function applyWeight(name: string, value: number) {
  const nextValue = clampWeight(value);
  const weightMap = getStoredWeights();
  weightMap[name] = nextValue;
  saveStoredWeights(weightMap);
  updateStatus(getParticipants());
}

function syncInputs(name: string, value: number) {
  document.querySelectorAll<HTMLInputElement>(`[data-name="${CSS.escape(name)}"]`).forEach((input) => {
    input.value = formatWeight(value);
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

document.addEventListener('DOMContentLoaded', () => {
  render();

  document.querySelector('#btnRefreshWeights')?.addEventListener('click', () => {
    render();
  });

  document.querySelector('#btnResetWeights')?.addEventListener('click', () => {
    resetAllWeights();
  });

  document.querySelector('#btnCloseWeights')?.addEventListener('click', () => {
    window.close();
  });

  document.querySelector('#weightPopupRows')?.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.dataset.name || target.type !== 'range') return;

    const nextValue = clampWeight(parseFloat(target.value));
    syncInputs(target.dataset.name, nextValue);
    applyWeight(target.dataset.name, nextValue);
  });

  document.querySelector('#weightPopupRows')?.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.dataset.name || target.type !== 'number') return;

    const nextValue = clampWeight(parseFloat(target.value));
    syncInputs(target.dataset.name, nextValue);
    applyWeight(target.dataset.name, nextValue);
  });

  window.addEventListener('storage', (event) => {
    if (event.key === NAME_KEY || event.key === WEIGHT_KEY) {
      render();
    }
  });
});
