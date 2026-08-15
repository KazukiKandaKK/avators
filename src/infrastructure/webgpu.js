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
  let a = alpha * (1.0 - smoothstep(-0.01, 0.01, d));
  return mix(base, color, a);
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
  // fragCoord.y grows downward, so flip Y so +Y points up on screen.
  var uv = (fragCoord.xy / u.resolution - 0.5) * 2.0;
  uv.y = -uv.y;
  uv.x *= aspect;

  let h = u.head_radius;
  let hairW = h * (0.05 + u.hair_amount * 0.5);
  let hairH = h * (0.05 + u.hair_amount * 0.5);

  // soft cream background
  var col = vec3f(0.98, 0.96, 0.94);

  // back hair drawn behind the face
  let backHair = sdEllipse(uv - vec2f(0.0, 0.05 * h), vec2f(h * 0.9 + hairW, h * 1.0 + hairH));
  col = fill(backHair, u.hair_color, col);

  // face skin
  let face = sdEllipse(uv, vec2f(h * 0.95, h * 1.05));
  col = fill(face, u.skin_color, col);

  // blush
  let blushL = sdCircle(uv - vec2f(-h * 0.45, -h * 0.12), h * 0.11);
  let blushR = sdCircle(uv - vec2f(h * 0.45, -h * 0.12), h * 0.11);
  col = fillSoft(blushL, vec3f(1.0, 0.75, 0.75), col, 0.25);
  col = fillSoft(blushR, vec3f(1.0, 0.75, 0.75), col, 0.25);

  // eyes
  let eyeY = h * 0.05;
  let eyeX = u.eye_spacing * h;
  let eyeW = u.eye_size * 0.85;
  let eyeH = u.eye_size * 1.25;
  let eyeShape = vec2f(eyeW, eyeH);

  let leftEyePos = vec2f(-eyeX, eyeY);
  let rightEyePos = vec2f(eyeX, eyeY);

  let leftWhite = sdEllipse(uv - leftEyePos, eyeShape);
  let rightWhite = sdEllipse(uv - rightEyePos, eyeShape);
  col = fill(leftWhite, vec3f(1.0), col);
  col = fill(rightWhite, vec3f(1.0), col);

  let irisR = u.eye_size * 0.55;
  let leftIris = sdCircle(uv - leftEyePos, irisR);
  let rightIris = sdCircle(uv - rightEyePos, irisR);
  col = fill(leftIris, u.eye_color, col);
  col = fill(rightIris, u.eye_color, col);

  let pupilR = irisR * 0.45;
  let leftPupil = sdCircle(uv - leftEyePos, pupilR);
  let rightPupil = sdCircle(uv - rightEyePos, pupilR);
  col = fill(leftPupil, vec3f(0.0), col);
  col = fill(rightPupil, vec3f(0.0), col);

  let highR = pupilR * 0.5;
  let leftHigh = sdCircle(uv - (leftEyePos + vec2f(-pupilR * 0.3, pupilR * 0.35)), highR);
  let rightHigh = sdCircle(uv - (rightEyePos + vec2f(-pupilR * 0.3, pupilR * 0.35)), highR);
  col = fill(leftHigh, vec3f(1.0), col);
  col = fill(rightHigh, vec3f(1.0), col);

  // eyebrows
  let browY = eyeY + h * 0.22;
  let browW = h * 0.18;
  let browThick = h * 0.022;
  let browDrop = h * 0.04;
  let leftBrow = sdCapsule(uv, vec2f(-eyeX - browW, browY), vec2f(-eyeX + browW, browY + browDrop), browThick);
  let rightBrow = sdCapsule(uv, vec2f(eyeX - browW, browY + browDrop), vec2f(eyeX + browW, browY), browThick);
  col = fill(leftBrow, u.hair_color, col);
  col = fill(rightBrow, u.hair_color, col);

  // mouth
  let mouthY = -h * 0.35;
  let mouthW = u.mouth_width * h * 0.35;
  let mouthH = max(0.005, u.mouth_smile * h * 0.5);
  let mouth = sdEllipse(uv - vec2f(0.0, mouthY), vec2f(mouthW, mouthH));
  col = fill(mouth, vec3f(0.45, 0.12, 0.12), col);

  // front bangs over the face
  let bangTop = sdEllipse(uv - vec2f(0.0, h * 0.52), vec2f(h * 0.7 + hairW * 0.6, h * 0.22 + hairH * 0.2));
  let bangSideL = sdEllipse(uv - vec2f(-h * 0.55 - hairW * 0.3, h * 0.05), vec2f(h * 0.18 + hairW * 0.25, h * 0.42 + hairH * 0.35));
  let bangSideR = sdEllipse(uv - vec2f(h * 0.55 + hairW * 0.3, h * 0.05), vec2f(h * 0.18 + hairW * 0.25, h * 0.42 + hairH * 0.35));
  var bang = min(bangTop, min(bangSideL, bangSideR));

  // carve out space for the eyes so bangs do not cover them
  let eyeMaskR = u.eye_size * 1.6;
  let leftMask = sdCircle(uv - leftEyePos, eyeMaskR);
  let rightMask = sdCircle(uv - rightEyePos, eyeMaskR);
  let eyeMask = min(leftMask, rightMask);
  bang = max(bang, -eyeMask);

  // keep bangs above the mouth/cheek line
  bang = max(bang, -uv.y - h * 0.15);

  col = fill(bang, u.hair_color, col);

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
