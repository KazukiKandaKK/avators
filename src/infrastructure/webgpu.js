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

fn sdSphere(p: vec3f, r: f32) -> f32 {
  return length(p) - r;
}

fn sdCapsule(p: vec3f, a: vec3f, b: vec3f, r: f32) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

fn rotateX(p: vec3f, angle: f32) -> vec3f {
  let c = cos(angle);
  let s = sin(angle);
  return vec3f(p.x, c * p.y - s * p.z, s * p.y + c * p.z);
}

fn rotateY(p: vec3f, angle: f32) -> vec3f {
  let c = cos(angle);
  let s = sin(angle);
  return vec3f(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

fn map(p: vec3f) -> vec2f {
  let h = u.head_radius;
  var res = vec2f(sdSphere(p, h), 0.0);

  // hair shell above the head
  let outer = length(p) - (h + u.hair_amount);
  let inner = h - length(p);
  var hair = max(outer, inner);
  hair = max(hair, -p.y - 0.2 * h);
  if (hair < res.x) {
    res = vec2f(hair, 1.0);
  }

  // eyes
  let eyeY = 0.15 * h;
  let eyeZ = -sqrt(max(0.0, h * h - u.eye_spacing * u.eye_spacing - eyeY * eyeY));
  let leftEye = vec3f(-u.eye_spacing, eyeY, eyeZ);
  let rightEye = vec3f(u.eye_spacing, eyeY, eyeZ);
  let dEyes = min(sdSphere(p - leftEye, u.eye_size), sdSphere(p - rightEye, u.eye_size));
  if (dEyes < res.x) {
    res = vec2f(dEyes, 2.0);
  }

  // mouth
  let mouthW = u.mouth_width * h;
  let mouthY = -0.25 * h;
  let mouthZ = -sqrt(max(0.0, h * h - mouthW * mouthW - mouthY * mouthY));
  let mouthA = vec3f(-mouthW, mouthY, mouthZ);
  let mouthB = vec3f(mouthW, mouthY, mouthZ);
  let dMouth = sdCapsule(p, mouthA, mouthB, 0.03 * h + u.mouth_smile);
  if (dMouth < res.x) {
    res = vec2f(dMouth, 3.0);
  }

  return res;
}

fn calcNormal(p: vec3f) -> vec3f {
  let eps = 0.001;
  let n = vec3f(
    map(p + vec3f(eps, 0.0, 0.0)).x - map(p - vec3f(eps, 0.0, 0.0)).x,
    map(p + vec3f(0.0, eps, 0.0)).x - map(p - vec3f(0.0, eps, 0.0)).x,
    map(p + vec3f(0.0, 0.0, eps)).x - map(p - vec3f(0.0, 0.0, eps)).x
  );
  return normalize(n);
}

fn materialColor(mat: f32) -> vec3f {
  switch (i32(mat)) {
    case 0: { return u.skin_color; }
    case 1: { return u.hair_color; }
    case 2: { return u.eye_color; }
    case 3: { return vec3f(0.6, 0.1, 0.1); }
    default: { return vec3f(1.0); }
  }
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
  var uv = (fragCoord.xy / u.resolution - 0.5) * 2.0;
  uv.x *= aspect;

  var ro = vec3f(0.0, 0.0, 3.0);
  var rd = normalize(vec3f(uv.x, uv.y, -1.5));

  ro = rotateY(ro, u.rot_y);
  ro = rotateX(ro, u.rot_x);
  rd = rotateY(rd, u.rot_y);
  rd = rotateX(rd, u.rot_x);

  var t = 0.0;
  var hit = false;
  var mat = 0.0;
  for (var i = 0; i < 80; i = i + 1) {
    let p = ro + rd * t;
    let d = map(p);
    if (d.x < 0.001) {
      hit = true;
      mat = d.y;
      break;
    }
    if (t > 50.0) {
      break;
    }
    t += d.x;
  }

  if (!hit) {
    let bg = mix(
      vec3f(0.85, 0.9, 0.95),
      vec3f(0.6, 0.75, 0.9),
      fragCoord.y / u.resolution.y
    );
    return vec4f(bg, 1.0);
  }

  let p = ro + rd * t;
  let n = calcNormal(p);
  let light = normalize(vec3f(0.5, 0.8, -0.5));
  let diff = max(dot(n, light), 0.0);
  let ambient = 0.3;
  let spec = pow(max(dot(reflect(-light, n), -rd), 0.0), 16.0);
  let col = materialColor(mat) * (diff + ambient) + vec3f(0.1) * spec;
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
