import express, { Request, Response } from "express";
import cors from "cors";
import fs from "fs";
import BN from "bn.js";
import bodyParser from "body-parser";
import EventEmitter from "events";

import {
  type Block,
  genesisHash,
  genesisResponse,
  hashBlock,
  bnToNetString,
  LeaderMessage,
  ServerMessage,
} from "common";

class Timer extends EventEmitter {
  private initialDuration: number;
  private duration: number;
  private interval: NodeJS.Timeout | null;

  constructor(duration: number) {
    super();
    this.initialDuration = duration;
    this.duration = duration;
    this.interval = null;
  }

  start() {
    if (this.interval) this.stop();

    this.interval = setInterval(() => {
      this.duration -= 1000;

      if (this.duration <= 0) {
        this.emit("end");
        this.stop();
      }
    }, 1000);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  reset() {
    this.stop();
    this.duration = this.initialDuration;
  }

  getTimeRemaining() {
    return this.duration;
  }
}

// config
const PORT = 3000;
const duration = 5 * 60 * 1000;

const app = express();

// type Entry = {
//   hash: string;
//   nonce: string;
//   prompt: string;
//   response: string;
// };

// just use a file as the "database"
const dbFile = "./entries.csv";

// TODO handle restart from valid state and from a crash

// create a write stream to append to the file, making the file if it does not yet exist
const writeStream = fs.createWriteStream(dbFile, { flags: "a" });

enum ChainState {
  ACCEPTING,
  PROMPTING,
}

const sendCurrentLeader = (client: Response) => {
  if (state.candidateBlock) {
    client.write(
      `data:${JSON.stringify({
        type: "leader",
        hash: bnToNetString(state.candidateBlock.hash),
        nonce: state.candidateBlock.nonce,
        prompt: state.candidateBlock.prompt,
      } as ServerMessage)}\n\n`
    );
  }
};

const sendCountdownReset = (client: Response) => {
  client.write(
    `data:${JSON.stringify({
      type: "reset-countdown",
      milliseconds: duration,
    } as ServerMessage)}\n\n`
  );
}


type State = {
  state: ChainState;
  prevHash: string;
  prevResponse: string;
  candidateBlock?: {
    hash: BN;
    nonce: string;
    prompt: string;
  };
  timer: Timer;
  clients: Response[];
};

// TODO pull from file
const initialState = (): State => {
  const timer = new Timer(duration);
  timer.start();

  const clients: Response[] = [];

  timer.on("end", () => {
    timer.reset();

    for (const client of clients) {
      sendCountdownReset(client);
    }
  });

  return {
    state: ChainState.ACCEPTING,
    prevHash: genesisHash,
    prevResponse: genesisResponse,
    timer,
    clients,
  };
};

const validateBlockAgainstState = (
  block: Pick<Block, "prevHash" | "prevResponse">,
  state: State
): boolean => {
  if (state.state === ChainState.ACCEPTING) {
    return (
      block.prevHash === state.prevHash &&
      block.prevResponse === state.prevResponse
    );
  }
  return false;
};

const state = initialState();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get("/events", (req: Request, res: Response) => {
  // Set headers for SSE
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Add this client to the clients list
  state.clients.push(res);

  // Handle client disconnect
  req.on("close", () => {
    const index = state.clients.indexOf(res);
    if (index !== -1) {
      state.clients.splice(index, 1);
    }
  });
});

type SubmitParams = {
  prompt: string;
  nonce: string;
  prevHash: string;
};

app.post("/submit", (req: Request, res: Response) => {
  const { prompt, nonce, prevHash } = req.body as SubmitParams;

  // check the parameters are present
  if (!prompt || !nonce || !prevHash) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  // check prompt is a string
  if (typeof prompt !== "string") {
    return res.status(400).json({ error: "Prompt must be a string" });
  }

  // check nonce is a hex string of length 64
  if (
    typeof nonce !== "string" ||
    nonce.length !== 64 ||
    !/^[0-9a-fA-F]+$/.test(nonce)
  ) {
    return res.status(400).json({ error: "Nonce must be a hex string" });
  }

  // check prevHash is a hex string of length 64
  if (
    typeof prevHash !== "string" ||
    prevHash.length !== 64 ||
    !/^[0-9a-fA-F]+$/.test(prevHash)
  ) {
    return res.status(400).json({ error: "PrevHash must be a hex string" });
  }

  const nonceBN = new BN(nonce, "hex");

  const hash = hashBlock({
    prompt,
    nonce: nonceBN,
    prevHash,
    prevResponse: state.prevResponse,
  });

  const hashBN = new BN(hash, "hex");

  if (
    !validateBlockAgainstState(
      { prevHash, prevResponse: state.prevResponse },
      state
    )
  ) {
    return res
      .status(400)
      .json({ error: `Invalid block - expected prevHash ${state.prevHash}` });
  }

  if (!state.candidateBlock) {
    state.candidateBlock = { hash: hashBN, nonce, prompt };
    res.status(200).json({ message: "Block accepted" });

    // broadcast the new leader
    for (const client of state.clients) {
      sendCurrentLeader(client);
    }
  } else {
    if (hashBN.lt(state.candidateBlock.hash)) {
      state.candidateBlock = { hash: hashBN, nonce, prompt };
      res.status(200).json({ message: "Block accepted" });

      // broadcast the new leader
      for (const client of state.clients) {
        sendCurrentLeader(client);
      }
    } else {
      return res.status(400).json({
        error: `Invalid block - hash ${hash} is not less than ${bnToNetString(
          state.candidateBlock.hash
        )}`,
      });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
