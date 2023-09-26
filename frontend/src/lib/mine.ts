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
    target.toString("hex").padStart(64, "0"),
    " prevHash: ",
    currentHash
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

  const prevHashBytes = Buffer.from(block.prevHash, "hex");
  const promptBytes = Buffer.from(block.prompt, "utf8");
  const responseBytes = Buffer.from(block.prevResponse, "utf8");

  const length =
    // nonceBytes.length +
    prevHashBytes.length + promptBytes.length + responseBytes.length;

  // pad buffer to 4 byte boundary with 0s
  const padding = 4 - (length % 4);
  const paddingBytes = Buffer.alloc(padding);

  const buffer = Buffer.concat([
    // nonceBytes,
    prevHashBytes,
    promptBytes,
    responseBytes,
    paddingBytes,
  ]);

  process_block(buffer)
    .then((hashes) => {
      for (let i = 0; i < hashes.length; i += 32) {
        console.log(
          hashes
            .subarray(i, i + 32)
            .reduce((a, b) => a + b.toString(16).padStart(2, "0"), "")
        );
      }
    })
    .catch(console.error);
};

const shader = (device: GPUDevice) => {
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

@group(0) @binding(0) var<storage, read_write> block_content: array<u32>;
@group(0) @binding(1) var<storage, read> block_size: u32;
@group(0) @binding(2) var<storage, read_write> hashes: array<u32>;

@compute @workgroup_size(${device.limits.maxComputeWorkgroupSizeX})
fn mine(@builtin(global_invocation_id) global_id: vec3<u32>) {

  let index = global_id.x;
  // if (index >= 1) {
  //   return;
  // }
  
  let hash_base_index = index * (256u / 32u);

  // == set the nonce == //

  let nonce_buffer = array<u32,8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, swap_endianess32(index));

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

  let num_chunks = (block_size * 32u) / 512u;
  for (var i = 0u; i < num_chunks; i++){
    let chunk_index = i * (512u/32u);
    var w = array<u32,64>();
    for (var j = 0u; j < 16u; j++){
      if (i == 0u && j < 8u) {
        w[j] = swap_endianess32(nonce_buffer[j]);
      } else {
        // TODO This swap should possibly be move to the block content initialization where the padding is added
        w[j] = swap_endianess32(block_content[chunk_index + j - 8]);
      }
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
};

const getGPUDevice = async () => {
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
  });
  if (!adapter) {
    throw "No adapter";
  } else {
    return await adapter.requestDevice();
  }
}

function calcNumWorkgroups(device: GPUDevice, messages: Uint8Array[]) {
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

class GPU {
  private device!: GPUDevice;
  private computePipeline!: GPUComputePipeline;

  async init() {
    this.device = await getGPUDevice();
    console.log(this.device.limits);

    this.computePipeline = this.device.createComputePipeline({
      compute: {
        module: this.device.createShaderModule({ code: shader(this.device) }),
        entryPoint: "mine",
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

async function process_block(blockContent: Buffer) {
  gpu = gpu ? gpu : await new GPU().init();

  // const numWorkgroups = gpu.getDevice.limits.maxComputeWorkgroupSizeX;
  // const numWorkgroups = calcNumWorkgroups(gpu.getDevice, messages);
  const workgroupCount = 16;

  let offset = blockContent.length;

  const L = (blockContent.length + 32) * 8;
  const K = 512 - ((L + 1 + 64) % 512);
  const padding = 1 + K + 64;
  const Lp = L + padding;

  const paddingBytes = Buffer.alloc(padding / 8);
  blockContent = Buffer.concat([blockContent, paddingBytes]);

  blockContent.writeUInt8(0x80, offset);
  offset += 1;
  for (let i = 1; i < (K + 1) / 8; i++) {
    blockContent.writeUInt8(0x00, offset);
    offset += 1;
  }
  blockContent.writeUInt32BE(0x00, offset);
  offset += 4;
  blockContent.writeUInt32BE(L, offset);
  offset += 4;

  // copy blockContent into the buffer
  const arrBuff = new ArrayBuffer(blockContent.length);
  new Uint8Array(arrBuff).set(blockContent);
  const blockContentUint32Buf = new Uint32Array(arrBuff);

  const blockContentBuffer = gpu.getDevice.createBuffer({
    mappedAtCreation: true,
    size: blockContentUint32Buf.byteLength,
    usage: GPUBufferUsage.STORAGE,
  });
  new Uint32Array(blockContentBuffer.getMappedRange()).set(
    blockContentUint32Buf
  );
  blockContentBuffer.unmap();

  const blockSizeBuffer = gpu.getDevice.createBuffer({
    mappedAtCreation: true,
    size: Uint32Array.BYTES_PER_ELEMENT,
    usage: GPUBufferUsage.STORAGE,
  });
  new Uint32Array(blockSizeBuffer.getMappedRange()).set([Lp / 32]);
  blockSizeBuffer.unmap();

  const resultBufferSize = (256 / 8) * workgroupCount;
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
          buffer: blockContentBuffer,
        },
      },
      {
        binding: 1,
        resource: {
          buffer: blockSizeBuffer,
        },
      },
      {
        binding: 2,
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
  passEncoder.dispatchWorkgroups(workgroupCount);
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
