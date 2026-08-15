---
name: WebGPU E2E Testing with a Mock Adapter
description: How to end-to-end test WebGPU apps in a headless/CI environment that has no real GPU adapter, using a temporary browser stub and agent-browser.
---

# WebGPU E2E Testing with a Mock Adapter

## When to use this

- Testing a Vite / vanilla JS WebGPU app on Linux CI or on Chrome for Testing with `--disable-gpu`.
- You need to verify that control-panel changes reach the WebGPU uniform buffer, even though no real adapter is available.

## Setup

1. Start the dev server:
   ```bash
   cd <repo>
   npm install
   npm run dev
   ```
2. Create a temporary init script (do not commit it) that stubs `navigator.gpu` and captures data written to `device.queue.writeBuffer`:
   ```js
   // /tmp/webgpu-stub.js
   (function () {
     const fakeTextureView = Object.freeze({});
     const fakeTexture = { createView: () => fakeTextureView };
     const fakeContext = { configure: () => {}, getCurrentTexture: () => fakeTexture };

     const origGetContext = HTMLCanvasElement.prototype.getContext;
     HTMLCanvasElement.prototype.getContext = function (type, attrs) {
       if (type === 'webgpu') return fakeContext;
       return origGetContext.call(this, type, attrs);
     };

     const fakeRenderPassEncoder = { setPipeline: () => {}, setBindGroup: () => {}, draw: () => {}, end: () => {} };
     const fakeCommandEncoder = { beginRenderPass: () => fakeRenderPassEncoder, finish: () => Object.freeze({}) };
     const fakeQueue = {
       submit: () => {},
       writeBuffer: (buffer, offset, data) => {
         if (data && data.buffer) {
           const copy = new Float32Array(data.buffer, data.byteOffset, data.byteLength / Float32Array.BYTES_PER_ELEMENT);
           window.lastWebGPUUniformData = new Float32Array(copy);
         }
       },
     };

     const fakeDevice = {
       queue: fakeQueue,
       createBuffer: () => ({ usage: 0 }),
       createBindGroupLayout: () => ({}),
       createPipelineLayout: () => ({}),
       createShaderModule: () => ({}),
       createRenderPipeline: () => ({}),
       createBindGroup: () => ({}),
       createCommandEncoder: () => fakeCommandEncoder,
     };

     const fakeAdapter = { requestDevice: async () => fakeDevice };
     const fakeGPU = {
       getPreferredCanvasFormat: () => 'bgra8unorm',
       requestAdapter: async () => fakeAdapter,
     };

     Object.defineProperty(navigator, 'gpu', { value: fakeGPU, configurable: true, writable: true });
   })();
   ```
3. Launch Chrome via `agent-browser` with the stub:
   ```bash
   AGENT_BROWSER_HEADED=true npx agent-browser --session <name> --init-script /tmp/webgpu-stub.js open http://127.0.0.1:5173
   ```
   Use `wmctrl -r "Avators" -b add,maximized_vert,maximized_horz` or `xdotool` to maximize the window before recording.

## Reading state

- Use `npx agent-browser --session <name> eval "JSON.stringify(window.lastWebGPUUniformData ? Array.from(window.lastWebGPUUniformData) : null)"` to read the Float32Array that the renderer wrote to the GPU.
- Use `get box '<selector>'` for coordinates, then `agent-browser mouse move/drag` or the `computer` mouse tools for pointer actions.

## Common pitfalls

- `agent-browser fill` on `<input type="range">` may not fire `input` events. Prefer JS `input.value = '1.2'; input.dispatchEvent(new Event('input', { bubbles: true }))`.
- The real `pointerdown`/`pointermove` orbit handlers call `canvas.setPointerCapture`, so synthetic `PointerEvent`s may throw unless they have a valid active pointer. Use real mouse commands or skip capture.
- Chrome for Testing may default to `--disable-gpu` and `--use-angle=swiftshader-webgl`, so `requestAdapter()` returns `null`. This is the normal fallback path (`No WebGPU adapter found.`).
- A `#canvas { width: 100% }` rule alongside `flex: 1` in a horizontal flex container can collapse the controls panel; this is a real layout bug if it reproduces.

## Devin Secrets Needed

None.
