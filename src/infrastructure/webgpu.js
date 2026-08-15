export async function initWebGPU(canvas) {
  if (!navigator.gpu) {
    throw new Error('WebGPU is not supported in this browser.');
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error('No WebGPU adapter found.');
  }
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  if (!context) {
    throw new Error('Failed to acquire webgpu context from canvas.');
  }
  const format = navigator.gpu.getPreferredCanvasFormat();
  return { device, context, format };
}

const SHADER = /* wgsl */ `
struct Uniforms {
  skin_color: vec3f,
  head_radius: f32,
  hair_color: vec3f,
  hair_amount: f32,
  eye_color: vec3f,
  eye_size: f32,
  mouth_width: f32,
  mouth_smile: f32,
  eye_spacing: f32,
  rot_x: f32,
  rot_y: f32,
  time: f32,
  resolution: vec2f,
}

@binding(0) @group(0) var<uniform> u: Uniforms;

fn fill(d: f32, color: vec3f, base: vec3f) -> vec3f {
  let a = 1.0 - smoothstep(-0.005, 0.005, d);
  return mix(base, color, a);
}

fn fillSoft(d: f32, color: vec3f, base: vec3f, alpha: f32) -> vec3f {
  let a = alpha * (1.0 - smoothstep(-0.015, 0.015, d));
  return mix(base, color, a);
}

fn stroke(d: f32, color: vec3f, width: f32, base: vec3f) -> vec3f {
  let a = 1.0 - smoothstep(-width, width, abs(d));
  return mix(base, color, a);
}

fn smin(a: f32, b: f32, k: f32) -> f32 {
  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

fn sdCircle(p: vec2f, r: f32) -> f32 {
  return length(p) - r;
}

fn sdEllipse(p: vec2f, ab: vec2f) -> f32 {
  let k = length(p / ab);
  return k - 1.0;
}

fn sdCapsule(p: vec2f, a: vec2f, b: vec2f, r: f32) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

@vertex
fn vsMain(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  var pos = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0)
  );
  return vec4f(pos[vi], 0.0, 1.0);
}

@fragment
fn fsMain(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
  let aspect = u.resolution.x / u.resolution.y;
  // WebGPU's fragCoord.y increases downward, so flip Y to make +Y point up.
  var uv = (fragCoord.xy / u.resolution - 0.5) * 2.0;
  uv.y = -uv.y;
  uv.x *= aspect;

  let h = u.head_radius;
  let hairW = u.hair_amount * h * 1.2;
  let hairH = u.hair_amount * h * 0.8;

  // soft warm background
  var col = vec3f(1.0, 0.98, 0.96);

  // neck
  let neck = sdEllipse(uv - vec2f(0.0, -h * 0.9), vec2f(h * 0.28, h * 0.45));
  col = fill(neck, u.skin_color * 0.88, col);

  // back hair
  let backHair = sdEllipse(uv - vec2f(0.0, h * 0.08), vec2f(h * 0.95 + hairW, h * 1.15 + hairH));
  col = fill(backHair, u.hair_color, col);

  // face: smooth union of a rounded forehead and a tapered chin
  let faceTop = sdEllipse(uv - vec2f(0.0, h * 0.08), vec2f(h * 0.78, h * 0.48));
  let faceChin = sdEllipse(uv - vec2f(0.0, -h * 0.42), vec2f(h * 0.46, h * 0.42));
  let face = smin(faceTop, faceChin, h * 0.18);
  col = fill(face, u.skin_color, col);
  // subtle face line
  col = stroke(face, vec3f(0.15), h * 0.012, col);

  // blush
  let blushY = -h * 0.12;
  let blushR = h * 0.11;
  let blushL = sdCircle(uv - vec2f(-h * 0.43, blushY), blushR);
  let blushR2 = sdCircle(uv - vec2f(h * 0.43, blushY), blushR);
  col = fillSoft(blushL, vec3f(1.0, 0.72, 0.72), col, 0.28);
  col = fillSoft(blushR2, vec3f(1.0, 0.72, 0.72), col, 0.28);

  // nose
  let nose = sdCircle(uv - vec2f(0.0, -h * 0.05), h * 0.006);
  col = fillSoft(nose, u.skin_color * 0.7, col, 0.6);

  // eyes
  let eyeY = h * 0.02;
  let eyeX = u.eye_spacing * h;
  let eyeH = u.eye_size * 1.55;
  let eyeW = u.eye_size * 0.82;
  let scleraAB = vec2f(eyeW, eyeH);

  let leftSclera = sdEllipse(uv - vec2f(-eyeX, eyeY), scleraAB);
  let rightSclera = sdEllipse(uv - vec2f(eyeX, eyeY), scleraAB);
  col = fill(leftSclera, vec3f(1.0), col);
  col = fill(rightSclera, vec3f(1.0), col);

  // upper eyelash / lid
  let lashThick = h * 0.02;
  let lashHalfW = eyeW * 0.9;
  let lashY = eyeY + eyeH * 0.82;
  let leftLash = sdCapsule(uv, vec2f(-eyeX - lashHalfW, lashY), vec2f(-eyeX + lashHalfW, lashY), lashThick);
  let rightLash = sdCapsule(uv, vec2f(eyeX - lashHalfW, lashY), vec2f(eyeX + lashHalfW, lashY), lashThick);
  col = fill(leftLash, vec3f(0.08), col);
  col = fill(rightLash, vec3f(0.08), col);

  // iris, clipped to sclera
  let irisR = eyeH * 0.55;
  let irisY = eyeY - eyeH * 0.05;
  let leftIris = max(sdCircle(uv - vec2f(-eyeX, irisY), irisR), leftSclera);
  let rightIris = max(sdCircle(uv - vec2f(eyeX, irisY), irisR), rightSclera);
  col = fill(leftIris, u.eye_color, col);
  col = fill(rightIris, u.eye_color, col);

  // pupil
  let pupilR = irisR * 0.45;
  let leftPupil = max(sdCircle(uv - vec2f(-eyeX, irisY), pupilR), leftSclera);
  let rightPupil = max(sdCircle(uv - vec2f(eyeX, irisY), pupilR), rightSclera);
  col = fill(leftPupil, vec3f(0.05), col);
  col = fill(rightPupil, vec3f(0.05), col);

  // highlights
  let highR1 = irisR * 0.28;
  let highOff1 = vec2f(-irisR * 0.35, irisR * 0.38);
  let leftHigh1 = max(sdCircle(uv - (vec2f(-eyeX, irisY) + highOff1), highR1), leftSclera);
  let rightHigh1 = max(sdCircle(uv - (vec2f(eyeX, irisY) + highOff1), highR1), rightSclera);
  col = fill(leftHigh1, vec3f(1.0), col);
  col = fill(rightHigh1, vec3f(1.0), col);

  let highR2 = irisR * 0.13;
  let highOff2 = vec2f(irisR * 0.42, -irisR * 0.32);
  let leftHigh2 = max(sdCircle(uv - (vec2f(-eyeX, irisY) + highOff2), highR2), leftSclera);
  let rightHigh2 = max(sdCircle(uv - (vec2f(eyeX, irisY) + highOff2), highR2), rightSclera);
  col = fill(leftHigh2, vec3f(1.0), col);
  col = fill(rightHigh2, vec3f(1.0), col);

  // eyebrows
  let browY = eyeY + eyeH + h * 0.06;
  let browW = h * 0.18;
  let browThick = h * 0.018;
  let browDrop = h * 0.02;
  let leftBrow = sdCapsule(uv, vec2f(-eyeX - browW, browY), vec2f(-eyeX + browW, browY - browDrop), browThick);
  let rightBrow = sdCapsule(uv, vec2f(eyeX - browW, browY - browDrop), vec2f(eyeX + browW, browY), browThick);
  col = fill(leftBrow, u.hair_color, col);
  col = fill(rightBrow, u.hair_color, col);

  // mouth (lower half of an ellipse => U smile)
  let mouthY = -h * 0.35;
  let mouthW = u.mouth_width * h * 0.4;
  let mouthH = max(0.004, u.mouth_smile * h * 0.65);
  let mouthLine = sdEllipse(uv - vec2f(0.0, mouthY), vec2f(mouthW, mouthH));
  let mouth = max(mouthLine, uv.y - mouthY);
  col = fill(mouth, vec3f(0.55, 0.12, 0.12), col);

  // front bangs
  let bangsY = h * 0.52;
  var bangs = sdEllipse(uv - vec2f(0.0, bangsY), vec2f(h * 0.72 + hairW * 0.6, h * 0.22 + hairH * 0.25));
  // center widow's peak and side partings
  let peak = uv.y - bangsY + hairW * 0.5 + abs(uv.x) * 0.9;
  bangs = max(bangs, -peak);
  let partL = -uv.x + h * 0.38;
  let partR = uv.x + h * 0.38;
  bangs = max(bangs, -partL);
  bangs = max(bangs, -partR);

  // cut out around the eyes
  let eyeMaskL = sdCircle(uv - vec2f(-eyeX, eyeY), eyeH * 1.35);
  let eyeMaskR = sdCircle(uv - vec2f(eyeX, eyeY), eyeH * 1.35);
  let eyeMask = min(eyeMaskL, eyeMaskR);
  bangs = max(bangs, -eyeMask);

  // keep bangs above the cheeks/mouth
  bangs = max(bangs, -uv.y - h * 0.08);

  col = fill(bangs, u.hair_color, col);

  // side locks
  let lockL = sdEllipse(uv - vec2f(-h * 0.62 - hairW * 0.2, h * 0.02), vec2f(h * 0.18 + hairW * 0.2, h * 0.55 + hairH * 0.4));
  let lockR = sdEllipse(uv - vec2f(h * 0.62 + hairW * 0.2, h * 0.02), vec2f(h * 0.18 + hairW * 0.2, h * 0.55 + hairH * 0.4));
  col = fill(lockL, u.hair_color, col);
  col = fill(lockR, u.hair_color, col);

  // hair shine highlights
  let shine1 = sdEllipse(uv - vec2f(-h * 0.22, h * 0.35), vec2f(h * 0.18, h * 0.035));
  col = stroke(shine1, vec3f(1.0), h * 0.02, col);
  let shine2 = sdEllipse(uv - vec2f(h * 0.32, h * 0.25), vec2f(h * 0.12, h * 0.025));
  col = stroke(shine2, vec3f(1.0), h * 0.015, col);

  // ahoge (cowlick)
  let ahoge = sdCapsule(uv, vec2f(0.0, h * 0.82), vec2f(h * 0.08, h * 1.18), h * 0.045);
  col = fill(ahoge, u.hair_color, col);

  return vec4f(col, 1.0);
}
`;

const UNIFORM_SIZE = 80;

export function createRenderer(device, context, format) {
  const uniformBuffer = device.createBuffer({
    size: UNIFORM_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout],
  });

  const shaderModule = device.createShaderModule({ code: SHADER });

  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: shaderModule,
      entryPoint: 'vsMain',
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fsMain',
      targets: [{ format }],
    },
    primitive: { topology: 'triangle-list' },
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
    ],
  });

  function resize(width, height) {
    context.configure({
      device,
      format,
      width,
      height,
    });
  }

  function update(paramsArray) {
    device.queue.writeBuffer(uniformBuffer, 0, paramsArray);
  }

  function draw() {
    const textureView = context.getCurrentTexture().createView();
    const commandEncoder = device.createCommandEncoder();
    const renderPassDescriptor = {
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.9, g: 0.95, b: 1.0, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    };
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(3, 1, 0, 0);
    passEncoder.end();
    device.queue.submit([commandEncoder.finish()]);
  }

  return { resize, update, draw };
}
