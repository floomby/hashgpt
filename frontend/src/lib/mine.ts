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

  while (true) {
    const hashBN = new BN(hashBlock(block), "hex");
    console.log(
      "hashing - (nonce): ",
      block.nonce.toString("hex"),
      " (hash): ",
      hashBN.toString("hex")
    );
    if (hashBN.lt(target)) {
      callback(
        block.nonce.toString("hex").padStart(64, "0"),
        block.prevHash,
        block.prompt
      );
      break;
    }
    block.nonce.iaddn(1);
  }
};
