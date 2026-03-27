import { parseName } from './utils/utils';

export const DEV_ASSIST_KEY = 'mbr_dev_physics_assist';
export const DEV_ASSIST_MIN = 0;
export const DEV_ASSIST_MAX = 100;
export const DEV_ASSIST_STEP = 1;

export type DevAssistConfig = {
  targetId: string;
  strength: number;
};

export type DevAssistTarget = {
  id: string;
  name: string;
  copyIndex: number;
  label: string;
};

export function getDefaultDevAssistConfig(): DevAssistConfig {
  return {
    targetId: '',
    strength: 0,
  };
}

export function clampDevAssistStrength(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.min(DEV_ASSIST_MAX, Math.max(DEV_ASSIST_MIN, Math.round(value)));
}

export function normalizeDevAssistConfig(value: Partial<DevAssistConfig> | null | undefined): DevAssistConfig {
  return {
    targetId: typeof value?.targetId === 'string' ? value.targetId : '',
    strength: clampDevAssistStrength(typeof value?.strength === 'number' ? value.strength : Number(value?.strength ?? 0)),
  };
}

export function loadDevAssistConfig(): DevAssistConfig {
  try {
    return normalizeDevAssistConfig(JSON.parse(localStorage.getItem(DEV_ASSIST_KEY) || '{}'));
  } catch (error) {
    return getDefaultDevAssistConfig();
  }
}

export function saveDevAssistConfig(config: DevAssistConfig) {
  localStorage.setItem(DEV_ASSIST_KEY, JSON.stringify(normalizeDevAssistConfig(config)));
}

export function buildDevAssistTargets(rawNames: string[]): DevAssistTarget[] {
  const targets: DevAssistTarget[] = [];

  rawNames.forEach((raw) => {
    const parsed = parseName(raw);
    if (!parsed) return;

    for (let i = 0; i < parsed.count; i++) {
      const copyIndex = i + 1;
      const hasMultipleCopies = parsed.count > 1;
      const label = hasMultipleCopies ? `${parsed.name} #${copyIndex}` : parsed.name;
      targets.push({
        id: `${parsed.name}::${copyIndex}`,
        name: parsed.name,
        copyIndex,
        label,
      });
    }
  });

  return targets;
}
