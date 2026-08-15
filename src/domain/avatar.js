export const DEFAULT_PARAMS = Object.freeze({
  headRadius: 0.8,
  hairAmount: 0.25,
  skinColor: '#ffe0bd',
  hairColor: '#3e2723',
  eyeColor: '#4a90e2',
  eyeSize: 0.12,
  eyeSpacing: 0.25,
  mouthWidth: 0.2,
  mouthSmile: 0.0,
  rotX: 0.2,
  rotY: 0.0,
});

const LIMITS = Object.freeze({
  headRadius: { min: 0.5, max: 1.2 },
  hairAmount: { min: 0.0, max: 0.4 },
  eyeSize: { min: 0.03, max: 0.25 },
  eyeSpacing: { min: 0.05, max: 0.5 },
  mouthWidth: { min: 0.05, max: 0.5 },
  mouthSmile: { min: 0.0, max: 0.3 },
  rotX: { min: -1.5, max: 1.5 },
  rotY: { min: -Math.PI, max: Math.PI },
});

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function hexToRgb(hex) {
  const cleaned = String(hex ?? '').replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned) && !/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    return { r: 1, g: 1, b: 1 };
  }
  let full = cleaned;
  if (full.length === 3) {
    full = full.split('').map((c) => c + c).join('');
  }
  const num = parseInt(full, 16);
  return {
    r: ((num >> 16) & 0xff) / 255,
    g: ((num >> 8) & 0xff) / 255,
    b: (num & 0xff) / 255,
  };
}

function clampParam(value, key) {
  const limit = LIMITS[key];
  if (!limit) return value;
  return clamp(Number.isFinite(value) ? value : limit.min, limit.min, limit.max);
}

function normalizeColor(color) {
  if (typeof color !== 'string' || color.trim() === '') {
    return '#ffffff';
  }
  return color.trim();
}

export function createAvatarParams(input = {}) {
  const params = {};
  for (const key of Object.keys(DEFAULT_PARAMS)) {
    if (key.endsWith('Color')) {
      params[key] = normalizeColor(input[key] ?? DEFAULT_PARAMS[key]);
    } else {
      params[key] = clampParam(input[key] ?? DEFAULT_PARAMS[key], key);
    }
  }
  return Object.freeze(params);
}

export function paramsToArray(params, width, height, time = 0) {
  const skin = hexToRgb(params.skinColor);
  const hair = hexToRgb(params.hairColor);
  const eye = hexToRgb(params.eyeColor);
  return new Float32Array([
    skin.r, skin.g, skin.b, params.headRadius,
    hair.r, hair.g, hair.b, params.hairAmount,
    eye.r, eye.g, eye.b, params.eyeSize,
    params.mouthWidth, params.mouthSmile, params.eyeSpacing, params.rotX,
    params.rotY, time, width, height,
  ]);
}
