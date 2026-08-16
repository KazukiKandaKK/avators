import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clamp, hexToRgb, createAvatarParams, paramsToArray, DEFAULT_PARAMS } from '../src/domain/avatar.js';

describe('clamp', () => {
  it('keeps values inside the range', () => {
    assert.equal(clamp(5, 0, 10), 5);
  });

  it('clamps to the lower bound', () => {
    assert.equal(clamp(-1, 0, 10), 0);
  });

  it('clamps to the upper bound', () => {
    assert.equal(clamp(11, 0, 10), 10);
  });

  it('keeps boundary values', () => {
    assert.equal(clamp(0, 0, 10), 0);
    assert.equal(clamp(10, 0, 10), 10);
  });
});

describe('hexToRgb', () => {
  it('parses 6-digit hex', () => {
    assert.deepEqual(hexToRgb('#ffffff'), { r: 1, g: 1, b: 1 });
    assert.deepEqual(hexToRgb('#000000'), { r: 0, g: 0, b: 0 });
  });

  it('expands 3-digit hex', () => {
    assert.deepEqual(hexToRgb('#f0f'), { r: 1, g: 0, b: 1 });
  });

  it('falls back to white for invalid input', () => {
    assert.deepEqual(hexToRgb('invalid'), { r: 1, g: 1, b: 1 });
    assert.deepEqual(hexToRgb(null), { r: 1, g: 1, b: 1 });
  });
});

describe('createAvatarParams', () => {
  it('uses defaults when no input is given', () => {
    const params = createAvatarParams();
    assert.equal(params.headRadius, DEFAULT_PARAMS.headRadius);
    assert.equal(params.skinColor, DEFAULT_PARAMS.skinColor);
  });

  it('clamps out-of-range numeric values', () => {
    const params = createAvatarParams({ headRadius: 10, eyeSize: -1, hairAmount: 0.5 });
    assert.equal(params.headRadius, 1.2);
    assert.equal(params.eyeSize, 0.03);
    assert.equal(params.hairAmount, 0.4);
  });

  it('normalizes invalid colors to white', () => {
    const params = createAvatarParams({ skinColor: '' });
    assert.equal(params.skinColor, '#ffffff');
  });
});

describe('paramsToArray', () => {
  it('produces a Float32Array for the uniform buffer', () => {
    const params = createAvatarParams({ skinColor: '#000000', headRadius: 0.6 });
    const arr = paramsToArray(params, 800, 600, 1.5);
    assert.equal(arr.length, 20);
    assert.equal(arr[0], 0);
    assert.equal(arr[1], 0);
    assert.equal(arr[2], 0);
    assert.ok(Math.abs(arr[3] - 0.6) < 0.001);
    assert.equal(arr[18], 800);
    assert.equal(arr[19], 600);
  });
});
