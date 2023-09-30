// mining blocks based on sha256
// TODO there are some easy optimizations that could be made here
// - buffer rotation to keep hashing while the buffers are being read by the cpu
// - swap endianess ahead of time
// - better workgroup size selection
// ...also I don't know wgsl (or webgpu for that matter) so there are probably many other things that could be improved

import BN from "bn.js";

const submit = (
  nonce: BN,
  prevHash: string,
  prompt: string,
  expectedHash: string
) => {
  console.log(
    "submitting",
    nonce.toString("hex").padStart(64, "0"),
    prevHash,
    prompt,
    expectedHash
  );

  fetch(`${import.meta.env.VITE_API_BASE}/submit`, {
    method: "POST",
    body: JSON.stringify({
      nonce: nonce.toString("hex").padStart(64, "0"),
      prevHash,
      prompt,
      expectedHash,
    }),
    headers: {
      "Content-Type": "application/json",
    },
  })
    .then((response) => response.json())
    .then((data) => console.log(data))
    .catch((error) => console.error(error));
};

// NOTE This is the type for both directions of messages
export type MiningWorkerMessage =
  | {
      type: "stop";
    }
  | {
      type: "start";
    }
  | {
      type: "setPrompt";
      prompt: string;
    }
  | {
      type: "setTarget";
      target: string;
    }
  | {
      type: "setPrevBlockComponents";
      prevHash: string;
      prevResponse: string;
    }
  | {
      type: "ready";
    };

// prettier-ignore
const shader = () => /* wgsl */`

fn swap_endianess32(val: u32) -> u32 {
  return ((val>>24u) & 0xffu) | ((val>>8u) & 0xff00u) | ((val<<8u) & 0xff0000u) | ((val<<24u) & 0xff000000u);
}  

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
@group(0) @binding(3) var<storage, read> iterations: u32;
@group(0) @binding(4) var<storage, read> dispatched_count: u32;

@compute @workgroup_size(64)
fn mine(@builtin(global_invocation_id) global_id: vec3<u32>) {

  let index = global_id.x;
  
  let base_index = index * (256u / 32u) * 2;

  // == processing == //

  var scratch = array<u32,8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);

  hashes[base_index] = 0xffffffff;
  hashes[base_index + 1] = 0xffffffff;
  hashes[base_index + 2] = 0xffffffff;
  hashes[base_index + 3] = 0xffffffff;
  hashes[base_index + 4] = 0xffffffff;
  hashes[base_index + 5] = 0xffffffff;
  hashes[base_index + 6] = 0xffffffff;
  hashes[base_index + 7] = 0xffffffff;

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

  var nonce = array<u32,8>(0u, 0u, 0u, 0u, 0u, dispatched_count, 0u, index);

  for (var i = 0u; i < iterations; i++) {
    scratch[0] = 0x6a09e667u;
    scratch[1] = 0xbb67ae85u;
    scratch[2] = 0x3c6ef372u;
    scratch[3] = 0xa54ff53au;
    scratch[4] = 0x510e527fu;
    scratch[5] = 0x9b05688cu;
    scratch[6] = 0x1f83d9abu;
    scratch[7] = 0x5be0cd19u;

    let num_chunks = (block_size * 32u) / 512u;
    for (var i = 0u; i < num_chunks; i++){
      let chunk_index = i * (512u/32u);
      var w = array<u32,64>();
      for (var j = 0u; j < 16u; j++){
        if (i == 0u && j < 8u) {
          w[j] = swap_endianess32(nonce[j]);
        } else {
          // TODO This swap should probably be move to the block content initialization where the padding is added
          w[j] = swap_endianess32(block_content[chunk_index + j - 8]);
        }
      }
      for (var j = 16u; j < 64u; j++){
        w[j] = w[j - 16u] + g0(w[j - 15u]) + w[j - 7u] + g1(w[j - 2u]);
      }
      var a = scratch[0];
      var b = scratch[1];
      var c = scratch[2];
      var d = scratch[3];
      var e = scratch[4];
      var f = scratch[5];
      var g = scratch[6];
      var h = scratch[7];
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
      scratch[0] += a;
      scratch[1] += b;
      scratch[2] += c;
      scratch[3] += d;
      scratch[4] += e;
      scratch[5] += f;
      scratch[6] += g;
      scratch[7] += h;
    }
    scratch[0] = swap_endianess32(scratch[0]);
    scratch[1] = swap_endianess32(scratch[1]);
    scratch[2] = swap_endianess32(scratch[2]);
    scratch[3] = swap_endianess32(scratch[3]);
    scratch[4] = swap_endianess32(scratch[4]);
    scratch[5] = swap_endianess32(scratch[5]);
    scratch[6] = swap_endianess32(scratch[6]);
    scratch[7] = swap_endianess32(scratch[7]);

    let tmp = array<u32,8>(
      hashes[base_index],
      hashes[base_index + 1],
      hashes[base_index + 2],
      hashes[base_index + 3],
      hashes[base_index + 4],
      hashes[base_index + 5],
      hashes[base_index + 6],
      hashes[base_index + 7]
    );

    if (lt_be256(scratch, tmp)) {
      hashes[base_index] = scratch[0];
      hashes[base_index + 1] = scratch[1];
      hashes[base_index + 2] = scratch[2];
      hashes[base_index + 3] = scratch[3];
      hashes[base_index + 4] = scratch[4];
      hashes[base_index + 5] = scratch[5];
      hashes[base_index + 6] = scratch[6];
      hashes[base_index + 7] = scratch[7];
      hashes[base_index + 8] = nonce[0];
      hashes[base_index + 9] = nonce[1];
      hashes[base_index + 10] = nonce[2];
      hashes[base_index + 11] = nonce[3];
      hashes[base_index + 12] = nonce[4];
      hashes[base_index + 13] = nonce[5];
      hashes[base_index + 14] = nonce[6];
      hashes[base_index + 15] = nonce[7];
    }

    let old = nonce[7];
    nonce[7] += 64u;
    if (nonce[7] < old) {
      nonce[6] += 1u;
    }
  }
}`;

const getGPUDevice = async () => {
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: "high-performance",
  });
  if (!adapter) {
    throw "No adapter";
  } else {
    return await adapter.requestDevice();
  }
};

class GPU {
  private device!: GPUDevice;
  private computePipeline!: GPUComputePipeline;

  async init() {
    this.device = await getGPUDevice();
    console.log(this.device.limits);

    this.computePipeline = this.device.createComputePipeline({
      compute: {
        module: this.device.createShaderModule({ code: shader() }),
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

let gpu = new GPU();

let queuedPrompt: string | null = null;

let prevHash: string | null = null;
let prevResponse: string | null = null;

let running = false;

let target: BN | null = null;

let miner: Miner | null = null;

gpu.init().then(() => {
  console.log("GPU initialized");
  miner = new Miner(1024);
  self.postMessage({ type: "ready" });
});

class Miner {
  private dispatchX: number = 0;
  private resultBufferSize: number;
  private resultBuffer: GPUBuffer;
  private iterationsBuffer: GPUBuffer;
  private dispatchedCount: number;
  private dispatchedCountBuffer: GPUBuffer;
  private dispatchedCountStagingBuffer: GPUBuffer;

  private bindGroup!: GPUBindGroup;
  private commandEncoder!: GPUCommandEncoder;

  private prompt: string | null = null;

  constructor(iterations: number) {
    this.dispatchX = gpu.getDevice.limits.maxComputeWorkgroupSizeX;

    this.resultBufferSize = (256 / 8) * this.dispatchX * 2 * 64;
    this.resultBuffer = gpu.getDevice.createBuffer({
      size: this.resultBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    this.iterationsBuffer = gpu.getDevice.createBuffer({
      mappedAtCreation: true,
      size: Uint32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE,
    });
    new Uint32Array(this.iterationsBuffer.getMappedRange()).set([iterations]);
    this.iterationsBuffer.unmap();

    this.dispatchedCount = 0;
    this.dispatchedCountBuffer = gpu.getDevice.createBuffer({
      size: Uint32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.dispatchedCountStagingBuffer = gpu.getDevice.createBuffer({
      size: Uint32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.MAP_WRITE,
    });
  }

  // NOTE this pulls from the worker global state
  private bind() {
    if (prevHash === null || prevResponse === null) {
      console.warn("Unable to bind - missing prevHash or prevResponse");
      return;
    }

    if (queuedPrompt === null) {
      console.warn("Unable to bind - missing prompt");
      return;
    }

    const prevHashBytes = Buffer.from(prevHash, "hex");
    const promptBytes = Buffer.from(queuedPrompt, "utf8");
    const separatorBytes = Buffer.from([0x00, 0x00]);
    const responseBytes = Buffer.from(prevResponse, "utf8");

    this.prompt = queuedPrompt;

    prevHash;
    prevResponse;
    queuedPrompt = null;

    const length =
      prevHashBytes.length +
      promptBytes.length +
      separatorBytes.length +
      responseBytes.length;

    // pad buffer to 4 byte boundary with 0s
    const blockPadding = 4 - (length % 4);
    const blockPaddingBytes = Buffer.alloc(blockPadding);

    // The nonce is excluded here because it is handled by the shader
    let blockContent = Buffer.concat([
      prevHashBytes,
      promptBytes,
      separatorBytes,
      responseBytes,
      blockPaddingBytes,
    ]);

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

    this.bindGroup = gpu.getDevice.createBindGroup({
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
            buffer: this.resultBuffer,
          },
        },
        {
          binding: 3,
          resource: {
            buffer: this.iterationsBuffer,
          },
        },
        {
          binding: 4,
          resource: {
            buffer: this.dispatchedCountBuffer,
          },
        },
      ],
    });

    this.dispatchedCount = 0;
  }

  private launched = false;

  async run() {
    if (this.launched) {
      return;
    }
    this.launched = true;

    while (true) {
      if (running && target !== null && this.prompt !== null) {
        // do mining

        await this.dispatchedCountStagingBuffer.mapAsync(GPUMapMode.WRITE);
        new Uint32Array(this.dispatchedCountStagingBuffer.getMappedRange()).set(
          [this.dispatchedCount]
        );
        this.dispatchedCountStagingBuffer.unmap();

        this.commandEncoder = gpu.getDevice.createCommandEncoder();

        this.commandEncoder.copyBufferToBuffer(
          this.dispatchedCountStagingBuffer,
          0,
          this.dispatchedCountBuffer,
          0,
          Uint32Array.BYTES_PER_ELEMENT
        );

        const passEncoder = this.commandEncoder.beginComputePass();
        passEncoder.setPipeline(gpu.getComputePipeline);
        passEncoder.setBindGroup(0, this.bindGroup);
        passEncoder.dispatchWorkgroups(this.dispatchX, 1, 1);
        passEncoder.end();

        const hashesReadBuffer = gpu.getDevice.createBuffer({
          size: this.resultBufferSize,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        this.commandEncoder.copyBufferToBuffer(
          this.resultBuffer,
          0,
          hashesReadBuffer,
          0,
          this.resultBufferSize
        );

        const gpuCommands = this.commandEncoder.finish();
        gpu.getDevice.queue.submit([gpuCommands]);

        await hashesReadBuffer.mapAsync(GPUMapMode.READ);
        const hashes = new Uint8Array(hashesReadBuffer.getMappedRange());
        // hashesReadBuffer.unmap();

        let lowestHash = new BN(
          "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
          "hex"
        );
        let bestNonce = new BN(0);
        for (let i = 0; i < hashes.length; i += 64) {
          const hash = new BN(hashes.subarray(i, i + 32), undefined, "be");
          if (hash.lt(lowestHash)) {
            lowestHash = hash;
            bestNonce = new BN(
              hashes.subarray(i + 32, i + 64),
              undefined,
              "be"
            );
          }
          // sanity check
          const nonce = new BN(hashes.subarray(i + 32, i + 64), undefined, "be");
          if (nonce.eq(new BN("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", "hex"))) {
            console.warn("Hash not preformed on buffer");
          }
        }
        hashesReadBuffer.unmap();

        if (lowestHash.lt(target)) {
          if (prevHash === null || this.prompt === null || !running) {
            console.warn(
              "Unable to submit - missing prevHash or prompt - or not running due to chain update"
            );
          } else {
            submit(
              bestNonce,
              prevHash,
              this.prompt,
              lowestHash.toString("hex").padStart(64, "0")
            );
          }
        }

        this.dispatchedCount += 1;
        // break;
      } else {
        // wait for mining to be enabled
        // TODO there is surely a better way to do this
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (queuedPrompt !== null) {
        this.bind();
      }
    }
  }
}

onmessage = (e: MessageEvent<MiningWorkerMessage>) => {
  console.log("worker received message", e.data);

  switch (e.data.type) {
    case "stop":
      running = false;
      break;
    case "setPrompt":
      queuedPrompt = e.data.prompt;
      break;
    case "setTarget":
      target = new BN(e.data.target, "hex");
      break;
    case "setPrevBlockComponents":
      prevHash = e.data.prevHash;
      prevResponse = e.data.prevResponse;
      // running = false;
      break;
    case "start":
      running = true;
      miner?.run();
      break;
  }
};
