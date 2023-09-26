// TODO replace this with a webgpu implementation
import BN from "bn.js";
import { Block, hashBlock } from "common";

export const mine = (
  prompt: string,
  currentHash: string,
  prevResponse: string,
  target: BN,
  callback: (nonce: string, prevHash: string, prompt: string) => void
) => {
  console.log(
    "mining prompt: ",
    prompt,
    " target: ",
    target.toString("hex").padStart(64, "0")
  );

  let block: Block = {
    nonce: new BN(0),
    prevHash: currentHash,
    prompt,
    prevResponse,
  };

  let abort = 8;

  while (abort-- > 0) {
    const hashBN = new BN(hashBlock(block), "hex");
    console.log(
      "hashing - (nonce): ",
      block.nonce.toString("hex"),
      " (hash): ",
      hashBN.toString("hex")
    );
    if (hashBN.lt(target)) {
      // callback(
      //   block.nonce.toString("hex").padStart(64, "0"),
      //   block.prevHash,
      //   block.prompt
      // );
      // break;
    }
    block.nonce.iaddn(1);
  }

  // const nonceBytes = Buffer.from(block.nonce.toArray());
  const nonceBytes = Buffer.from(new BN(0).toArray("be", 32));
  console.log("nonceBytes: ", nonceBytes.toString("hex"));

  const prevHashBytes = Buffer.from(block.prevHash, "hex");
  const promptBytes = Buffer.from(block.prompt, "utf8");
  const responseBytes = Buffer.from(block.prevResponse, "utf8");

  const length =
    nonceBytes.length +
    prevHashBytes.length +
    promptBytes.length +
    responseBytes.length;

  // pad buffer to 4 byte boundary with 0s
  const padding = 4 - (length % 4);
  const paddingBytes = Buffer.alloc(padding);

  const buffer = Buffer.concat([
    nonceBytes,
    prevHashBytes,
    promptBytes,
    responseBytes,
    paddingBytes,
  ]);

  // hash buffer
  testHash(buffer);
};

async function testHash(bytes: Buffer) {
  // const messages = [
  // new Uint8Array([0x01, 0x00, 0x00, 0x00]), // int 1
  // new Uint8Array([0x02, 0x00, 0x00, 0x00]), // int 2
  // new Uint8Array([0x03, 0x00, 0x00, 0x00]), // int 3
  // new Uint8Array([0x04, 0x00, 0x00, 0x00]), // int 4
  // new Uint8Array([0x05, 0x00, 0x00, 0x00]), // int 5
  // new Uint8Array([0x06, 0x00, 0x00, 0x00]), // int 6
  // new Uint8Array([0x07, 0x00, 0x00, 0x00]), // int 7
  // new Uint8Array([0x08, 0x00, 0x00, 0x00]), // int 8
  // new Uint8Array([0x09, 0x00, 0x00, 0x00]), // int 9
  // ];
  const messages = new Array(8).fill(bytes).map((b) => new Uint8Array(b));
  // each message in messages must have the same size
  const hashes = await sha256_gpu(messages);
  for (let i = 0; i < hashes.length; i += 32) {
    console.log(
      hashes
        .subarray(i, i + 32)
        .reduce((a, b) => a + b.toString(16).padStart(2, "0"), "")
    );
  }
}

function shader(device: GPUDevice) {
  return /* wgsl */ `
// SHA-256 for 32-bit aligned messages

fn swap_endianess32(val: u32) -> u32 {
  return ((val>>24u) & 0xffu) | ((val>>8u) & 0xff00u) | ((val<<8u) & 0xff0000u) | ((val<<24u) & 0xff000000u);
}  

// TODO this feels like it might be built in as some intrinsic??
fn lt_be(a: u32, b: u32) -> bool {
  if ((a & 0xffu) < (b & 0xffu)) {
    return true;
  } else if ((a & 0xffu) > (b & 0xffu)) {
    return false;
  } else if ((a & 0xff00u) < (b & 0xff00u)) {
    return true;
  } else if ((a & 0xff00u) > (b & 0xff00u)) {
    return false;
  } else if ((a & 0xff0000u) < (b & 0xff0000u)) {
    return true;
  } else if ((a & 0xff0000u) > (b & 0xff0000u)) {
    return false;
  } else if ((a & 0xff000000u) < (b & 0xff000000u)) {
    return true;
  } else {
    return false;
  }
}

fn lt_be256(a: array<u32,8>, b: array<u32,8>) -> bool {
  for (var i = 0u; i < 8u; i++) {
    if (lt_be(a[i], b[i])) {
      return true;
    } else if (lt_be(b[i], a[i])) {
      return false;
    }
  }
  return false;
}

fn shw(x: u32, n: u32) -> u32 {
  return (x << (n & 31u)) & 0xffffffffu;
}

fn r(x: u32, n: u32) -> u32 {
  return (x >> n) | shw(x, 32u - n);
}

fn g0(x: u32) -> u32 {
  return r(x, 7u) ^ r(x, 18u) ^ (x >> 3u);
}

fn g1(x: u32) -> u32 {
  return r(x, 17u) ^ r(x, 19u) ^ (x >> 10u);
}

fn s0(x: u32) -> u32 {
  return r(x, 2u) ^ r(x, 13u) ^ r(x, 22u);
}

fn s1(x: u32) -> u32 {
  return r(x, 6u) ^ r(x, 11u) ^ r(x, 25u);
}

fn maj(a: u32, b: u32, c: u32) -> u32 {
  return (a & b) ^ (a & c) ^ (b & c);
}

fn ch(e: u32, f: u32, g: u32) -> u32 {
  return (e & f) ^ ((~e) & g);
}

@group(0) @binding(0) var<storage, read_write> messages: array<u32>;
@group(0) @binding(1) var<storage, read> num_messages: u32;
@group(0) @binding(2) var<storage, read> message_sizes: array<u32>;
@group(0) @binding(3) var<storage, read_write> hashes: array<u32>;

@compute @workgroup_size(${device.limits.maxComputeWorkgroupSizeX})
fn sha256(@builtin(global_invocation_id) global_id: vec3<u32>) {

  let index = global_id.x;
  if (index >= num_messages) {
    return;
  }
  
  let message_base_index = index * message_sizes[1];
  let hash_base_index = index * (256u / 32u);

  // == padding == //

  messages[message_base_index + message_sizes[0]] = 0x00000080u;
  for (var i = message_sizes[0] + 1; i < message_sizes[1] - 2; i++){
    messages[message_base_index + i] = 0x00000000u;
  }
  messages[message_base_index + message_sizes[1] - 2] = 0;
  messages[message_base_index + message_sizes[1] - 1] = swap_endianess32(message_sizes[0] * 32u);

  // == set the nonce == //

  for (var i = 0u; i < 7u; i++) {
    messages[message_base_index + i] = 0x00000000u;
  }
  messages[message_base_index + 7] = swap_endianess32(global_id.x);

  // == processing == //

  hashes[hash_base_index] = 0x6a09e667u;
  hashes[hash_base_index + 1] = 0xbb67ae85u;
  hashes[hash_base_index + 2] = 0x3c6ef372u;
  hashes[hash_base_index + 3] = 0xa54ff53au;
  hashes[hash_base_index + 4] = 0x510e527fu;
  hashes[hash_base_index + 5] = 0x9b05688cu;
  hashes[hash_base_index + 6] = 0x1f83d9abu;
  hashes[hash_base_index + 7] = 0x5be0cd19u;

  let k = array<u32,64>(
    0x428a2f98u, 0x71374491u, 0xb5c0fbcfu, 0xe9b5dba5u, 0x3956c25bu, 0x59f111f1u, 0x923f82a4u, 0xab1c5ed5u,
    0xd807aa98u, 0x12835b01u, 0x243185beu, 0x550c7dc3u, 0x72be5d74u, 0x80deb1feu, 0x9bdc06a7u, 0xc19bf174u,
    0xe49b69c1u, 0xefbe4786u, 0x0fc19dc6u, 0x240ca1ccu, 0x2de92c6fu, 0x4a7484aau, 0x5cb0a9dcu, 0x76f988dau,
    0x983e5152u, 0xa831c66du, 0xb00327c8u, 0xbf597fc7u, 0xc6e00bf3u, 0xd5a79147u, 0x06ca6351u, 0x14292967u,
    0x27b70a85u, 0x2e1b2138u, 0x4d2c6dfcu, 0x53380d13u, 0x650a7354u, 0x766a0abbu, 0x81c2c92eu, 0x92722c85u,
    0xa2bfe8a1u, 0xa81a664bu, 0xc24b8b70u, 0xc76c51a3u, 0xd192e819u, 0xd6990624u, 0xf40e3585u, 0x106aa070u,
    0x19a4c116u, 0x1e376c08u, 0x2748774cu, 0x34b0bcb5u, 0x391c0cb3u, 0x4ed8aa4au, 0x5b9cca4fu, 0x682e6ff3u,
    0x748f82eeu, 0x78a5636fu, 0x84c87814u, 0x8cc70208u, 0x90befffau, 0xa4506cebu, 0xbef9a3f7u, 0xc67178f2u
  );

  let num_chunks = (message_sizes[1] * 32u) / 512u;
  for (var i = 0u; i < num_chunks; i++){
    let chunk_index = i * (512u/32u);
    var w = array<u32,64>();
    for (var j = 0u; j < 16u; j++){
      w[j] = swap_endianess32(messages[message_base_index + chunk_index + j]);
    }
    for (var j = 16u; j < 64u; j++){
      w[j] = w[j - 16u] + g0(w[j - 15u]) + w[j - 7u] + g1(w[j - 2u]);
    }
    var a = hashes[hash_base_index];
    var b = hashes[hash_base_index + 1];
    var c = hashes[hash_base_index + 2];
    var d = hashes[hash_base_index + 3];
    var e = hashes[hash_base_index + 4];
    var f = hashes[hash_base_index + 5];
    var g = hashes[hash_base_index + 6];
    var h = hashes[hash_base_index + 7];
    for (var j = 0u; j < 64u; j++){
      let t2 = s0(a) + maj(a, b, c);
      let t1 = h + s1(e) + ch(e, f, g) + k[j] + w[j];
      h = g;
      g = f;
      f = e;
      e = d + t1;
      d = c;
      c = b;
      b = a;
      a = t1 + t2;
    }
    hashes[hash_base_index] += a;
    hashes[hash_base_index + 1] += b;
    hashes[hash_base_index + 2] += c;
    hashes[hash_base_index + 3] += d;
    hashes[hash_base_index + 4] += e;
    hashes[hash_base_index + 5] += f;
    hashes[hash_base_index + 6] += g;
    hashes[hash_base_index + 7] += h;
  }
  hashes[hash_base_index] = swap_endianess32(hashes[hash_base_index]);
  hashes[hash_base_index + 1] = swap_endianess32(hashes[hash_base_index + 1]);
  hashes[hash_base_index + 2] = swap_endianess32(hashes[hash_base_index + 2]);
  hashes[hash_base_index + 3] = swap_endianess32(hashes[hash_base_index + 3]);
  hashes[hash_base_index + 4] = swap_endianess32(hashes[hash_base_index + 4]);
  hashes[hash_base_index + 5] = swap_endianess32(hashes[hash_base_index + 5]);
  hashes[hash_base_index + 6] = swap_endianess32(hashes[hash_base_index + 6]);
  hashes[hash_base_index + 7] = swap_endianess32(hashes[hash_base_index + 7]);
}`;
}

async function getGPUDevice() {
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
  });
  if (!adapter) {
    throw "No adapter";
  } else {
    return await adapter.requestDevice();
  }
}

// right pads the message to size * 4 bytes with zeros
function padMessage(bytes: Uint8Array, size: number) {
  const arrBuff = new ArrayBuffer(size * 4);
  new Uint8Array(arrBuff).set(bytes);
  return new Uint32Array(arrBuff);
}

// [number of 32-bit words, number of 32-bit words padded]
function getMessageSizes(bytes: Uint8Array) {
  const lenBit = bytes.length * 8;
  const k = 512 - ((lenBit + 1 + 64) % 512);
  const padding = 1 + k + 64;
  const lenBitPadded = lenBit + padding;
  return new Uint32Array([lenBit / 32, lenBitPadded / 32]);
}

function calcNumWorkgroups(device: GPUDevice, messages: Uint8Array[]) {
  // console.log(device.limits);

  const numWorkgroups = Math.ceil(
    messages.length / device.limits.maxComputeWorkgroupSizeX
  );
  if (numWorkgroups > device.limits.maxComputeWorkgroupsPerDimension) {
    throw `Input array too large. Max size is ${
      device.limits.maxComputeWorkgroupsPerDimension *
      device.limits.maxComputeWorkgroupSizeX
    }.`;
  }
  return numWorkgroups;
}

// function check(messages: Uint8Array[]) {
//   for (const message of messages) {
//     if (message.length !== messages[0].length)
//       throw "Messages must have the same size";
//     if (message.length % 4 !== 0) throw "Message must be 32-bit aligned";
//   }
// }

class GPU {
  private device!: GPUDevice;
  private computePipeline!: GPUComputePipeline;

  async init() {
    this.device = await getGPUDevice();
    this.computePipeline = this.device.createComputePipeline({
      compute: {
        module: this.device.createShaderModule({ code: shader(this.device) }),
        entryPoint: "sha256",
      },
      layout: "auto",
    });
    return this;
  }

  get getDevice() {
    return this.device;
  }

  get getComputePipeline() {
    return this.computePipeline;
  }
}

let gpu: GPU;

export async function sha256_gpu(messages: Uint8Array[]) {
  // check(messages);

  gpu = gpu ? gpu : await new GPU().init();

  // const numWorkgroups = gpu.getDevice.limits.maxComputeWorkgroupSizeX;
  const numWorkgroups = calcNumWorkgroups(gpu.getDevice, messages);

  const messageSizes = getMessageSizes(messages[0]);
  const messageArray = new Uint32Array(messageSizes[1] * messages.length);
  let offset = 0;
  for (const message of messages) {
    const messagePad = padMessage(message, messageSizes[1]);
    // messagePad is the padded version of the input message as described by SHA-256 specification
    messageArray.set(messagePad, offset);
    offset += messagePad.length;
  }

  // messages
  const messageArrayBuffer = gpu.getDevice.createBuffer({
    mappedAtCreation: true,
    size: messageArray.byteLength,
    usage: GPUBufferUsage.STORAGE,
  });
  new Uint32Array(messageArrayBuffer.getMappedRange()).set(messageArray);
  messageArrayBuffer.unmap();

  // num_messages
  const numMessagesBuffer = gpu.getDevice.createBuffer({
    mappedAtCreation: true,
    size: Uint32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE,
  });
  new Uint32Array(numMessagesBuffer.getMappedRange()).set([messages.length]);
  numMessagesBuffer.unmap();

  // message_sizes
  const messageSizesBuffer = gpu.getDevice.createBuffer({
    mappedAtCreation: true,
    size: messageSizes.byteLength,
    usage: GPUBufferUsage.STORAGE,
  });
  new Uint32Array(messageSizesBuffer.getMappedRange()).set(messageSizes);
  messageSizesBuffer.unmap();

  // Result
  const resultBufferSize = (256 / 8) * messages.length;
  const resultBuffer = gpu.getDevice.createBuffer({
    size: resultBufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  const bindGroup = gpu.getDevice.createBindGroup({
    layout: gpu.getComputePipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: messageArrayBuffer,
        },
      },
      {
        binding: 1,
        resource: {
          buffer: numMessagesBuffer,
        },
      },
      {
        binding: 2,
        resource: {
          buffer: messageSizesBuffer,
        },
      },
      {
        binding: 3,
        resource: {
          buffer: resultBuffer,
        },
      },
    ],
  });

  const commandEncoder = gpu.getDevice.createCommandEncoder();

  const passEncoder = commandEncoder.beginComputePass();
  passEncoder.setPipeline(gpu.getComputePipeline);
  passEncoder.setBindGroup(0, bindGroup);
  passEncoder.dispatchWorkgroups(numWorkgroups);
  passEncoder.end();

  const gpuReadBuffer = gpu.getDevice.createBuffer({
    size: resultBufferSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  commandEncoder.copyBufferToBuffer(
    resultBuffer,
    0,
    gpuReadBuffer,
    0,
    resultBufferSize
  );

  const gpuCommands = commandEncoder.finish();
  gpu.getDevice.queue.submit([gpuCommands]);

  await gpuReadBuffer.mapAsync(GPUMapMode.READ);

  return new Uint8Array(gpuReadBuffer.getMappedRange());
}
