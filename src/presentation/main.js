import { initWebGPU, createRenderer } from '../infrastructure/webgpu.js';
import { createAvatarParams, paramsToArray, DEFAULT_PARAMS } from '../domain/avatar.js';

const canvas = document.getElementById('canvas');
const errorBox = document.getElementById('error');
const resetButton = document.getElementById('reset');

const rangeMeta = [
  { id: 'headRadius', key: 'headRadius' },
  { id: 'hairAmount', key: 'hairAmount' },
  { id: 'eyeSize', key: 'eyeSize' },
  { id: 'eyeSpacing', key: 'eyeSpacing' },
  { id: 'mouthWidth', key: 'mouthWidth' },
  { id: 'mouthSmile', key: 'mouthSmile' },
];

const colorMeta = [
  { id: 'skinColor', key: 'skinColor' },
  { id: 'hairColor', key: 'hairColor' },
  { id: 'eyeColor', key: 'eyeColor' },
];

let params = createAvatarParams();

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove('hidden');
}

function updateUIFromParams() {
  for (const { id, key } of rangeMeta) {
    const input = document.getElementById(id);
    input.value = params[key];
    const display = document.getElementById(`${id}Value`);
    if (display) display.textContent = params[key];
  }
  for (const { id, key } of colorMeta) {
    const input = document.getElementById(id);
    input.value = params[key];
  }
}

function setParam(key, value) {
  params = createAvatarParams({ ...params, [key]: value });
  updateUIFromParams();
}

function setupControls() {
  for (const { id, key } of rangeMeta) {
    const input = document.getElementById(id);
    input.addEventListener('input', () => {
      setParam(key, parseFloat(input.value));
    });
  }
  for (const { id, key } of colorMeta) {
    const input = document.getElementById(id);
    input.addEventListener('input', () => {
      setParam(key, input.value);
    });
  }
  resetButton.addEventListener('click', () => {
    params = createAvatarParams();
    updateUIFromParams();
  });
}

function setupOrbit() {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    const rotY = params.rotY + dx * 0.01;
    const rotX = params.rotX - dy * 0.01;
    setParam('rotY', rotY);
    setParam('rotX', rotX);
  });

  canvas.addEventListener('pointerup', (e) => {
    dragging = false;
    canvas.releasePointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointerleave', (e) => {
    dragging = false;
    canvas.releasePointerCapture(e.pointerId);
  });
}

async function main() {
  try {
    const { device, context, format } = await initWebGPU(canvas);
    const renderer = createRenderer(device, context, format);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(rect.width * dpr));
      const height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.width = width;
      canvas.height = height;
      renderer.resize(width, height);
    };

    new ResizeObserver(resize).observe(canvas);
    resize();
    setupControls();
    setupOrbit();
    updateUIFromParams();

    const render = () => {
      const time = performance.now() / 1000;
      const data = paramsToArray(params, canvas.width, canvas.height, time);
      renderer.update(data);
      renderer.draw();
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  } catch (err) {
    showError(err.message);
  }
}

main();
