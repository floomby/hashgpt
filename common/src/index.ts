import BN from "bn.js";
import crypto from "crypto";

export const genesisHash =
  "0000000000000000000000000000000000000000000000000000000000000000";

export const genesisResponse = "genesis response";

export type Block = {
  nonce: BN;
  prevHash: string;
  prompt: string;
  prevResponse: string;
};

export function hashBlock(block: Block): string {
  // concat everything into a buffer
  const nonceBytes = Buffer.from(block.nonce.toArray("be", 32));
  const prevHashBytes = Buffer.from(block.prevHash, "hex");
  const promptBytes = Buffer.from(block.prompt, "utf8");
  const separatorBytes = Buffer.from([0x00, 0x00]);
  const responseBytes = Buffer.from(block.prevResponse, "utf8");

  const length =
    nonceBytes.length +
    prevHashBytes.length +
    promptBytes.length +
    separatorBytes.length +
    responseBytes.length;

  // pad buffer to 4 byte boundary with 0s
  const padding = 4 - (length % 4);
  const paddingBytes = Buffer.alloc(padding);

  const buffer = Buffer.concat([
    nonceBytes,
    prevHashBytes,
    promptBytes,
    separatorBytes,
    responseBytes,
    paddingBytes,
  ]);

  // hash buffer
  const hash = crypto.createHash("sha256");
  hash.update(buffer);
  return hash.digest("hex");
}

export function checkDifficulty(hash: string, difficulty: number): boolean {
  const hashBN = new BN(hash, "hex");
  const target = new BN(2).pow(new BN(256 - difficulty));
  return hashBN.lt(target);
}

export function validateBlock(
  blocks: Block[],
  index: number,
  hash: string
): boolean {
  if (index === -1) {
    return hash === genesisHash;
  }

  let block = blocks[index];

  if (!block) {
    return false;
  }

  return (
    hashBlock(block) === hash &&
    validateBlock(blocks, index - 1, block.prevHash)
  );
}

export type LeaderMessage = {
  hash: string;
  nonce: string;
  prompt: string;
};

export type CountdownMessage = {
  targetTime: number; // milliseconds since epoch
};

export type TokenMessage = {
  tokenText: string;
};

export type MineableMessage = {
  currentHash: string;
  prevResponse: string;
};

export type AcceptedMessage = {
  prompt: string;
};

export type ServerMessage =
  | ({
      type: "leader";
    } & LeaderMessage)
  | ({
      type: "countdown";
    } & CountdownMessage)
  | ({
      type: "token";
    } & TokenMessage)
  | ({
      type: "mineable";
    } & MineableMessage)
  | ({
      type: "accepted";
    } & AcceptedMessage);
