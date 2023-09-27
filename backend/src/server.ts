import express, { Request, Response } from "express";
import cors from "cors";
import fs from "fs";
import readline from "readline";
import BN from "bn.js";
import bodyParser from "body-parser";
import EventEmitter from "events";

import {
  type Block,
  genesisHash,
  genesisResponse,
  hashBlock,
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
        this.duration = 0;
        this.stop();
        this.emit("end");
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
const duration = 20 * 1000;
// just use a file as the "database"
const dbFile = "./dbfile";

const app = express();

type Entry = {
  hash: string;
  nonce: string;
  prompt: string;
  response: string;
};

enum ChainState {
  ACCEPTING, // this means that it is mineable
  PROMPTING,
}

const sendCurrentLeader = (client: Response) => {
  if (state.candidateBlock) {
    client.write(
      `data:${JSON.stringify({
        type: "leader",
        hash: state.candidateBlock.hash.toString("hex").padStart(64, "0"),
        nonce: state.candidateBlock.nonce,
        prompt: state.candidateBlock.prompt,
      } as ServerMessage)}\n\n`
    );
  }
};

const sendCountdown = (client: Response, targetTime: number) => {
  client.write(
    `data:${JSON.stringify({
      type: "countdown",
      targetTime,
    } as ServerMessage)}\n\n`
  );
};

const sendMineable = (
  client: Response,
  currentHash: string,
  prevResponse: string
) => {
  client.write(
    `data:${JSON.stringify({
      type: "mineable",
      currentHash,
      prevResponse,
    } as ServerMessage)}\n\n`
  );
};

const sendAccepted = (client: Response, prompt: string) => {
  client.write(
    `data:${JSON.stringify({
      type: "accepted",
      prompt,
    } as ServerMessage)}\n\n`
  );
};

const sendToken = (client: Response, tokenText: string) => {
  client.write(
    `data:${JSON.stringify({
      type: "token",
      tokenText,
    } as ServerMessage)}\n\n`
  );
};

type State = {
  prevHash: string;
  prevResponse: string;
  count: number;
  state: ChainState;
  candidateBlock?: {
    hash: BN;
    nonce: string;
    prompt: string;
  };
  timer: Timer;
  clients: Response[];
  // needed to solve mid stream client joining
  llmState?: {
    prompt: string;
    response: string;
  };
};

// TODO implement this
const mockllm = (prompt: string, callback: (token: string) => void) => {
  state.llmState = { prompt, response: "" };
  console.log("mocking llm");
  return new Promise<string>((resolve) => {
    let tokenCount = 20;
    const interval = setInterval(() => {
      if (tokenCount > 0) {
        tokenCount--;
        state.llmState!.response += "blah ";
        callback("blah ");
      } else {
        clearInterval(interval);
        resolve(state.llmState!.response);
      }
    }, 500);
  });
};

const initialState = async (): Promise<State> => {
  // touch the db file if it does not exist
  if (!fs.existsSync(dbFile)) {
    fs.writeFileSync(dbFile, "");
  }

  let count = 0;
  let prevHash = genesisHash;
  let prevResponse = genesisResponse;

  const readStream = fs.createReadStream(dbFile);

  await new Promise((resolve, reject) => {
    const reader = readline.createInterface({
      input: readStream,
      crlfDelay: Infinity,
    });

    reader.on("line", (line) => {
      const entry: Entry = JSON.parse(line);
      count++;
      prevHash = entry.hash;
      prevResponse = entry.response;
    });

    reader.on("close", () => {
      console.log("completed loading db file");
      resolve(null);
    });

    reader.on("error", (err) => {
      reject(err);
    });
  });

  // create a write stream to append to the file, making the file if it does not yet exist
  const writeStream = fs.createWriteStream(dbFile, { flags: "a" });

  const writeEntry = (entry: Entry) => {
    writeStream.write(JSON.stringify(entry) + "\n");
    state.count++;
  };

  const timer = new Timer(duration);
  timer.start();

  const clients: Response[] = [];

  timer.on("end", async () => {
    console.log("updating chain", state.candidateBlock, clients.length);
    if (!state.candidateBlock) {
      console.log("no candidate block");
      timer.reset();
      timer.start();
      for (const client of clients) {
        console.log("sending countdown to client");
        sendCountdown(client, Date.now() + timer.getTimeRemaining());
      }
      return;
    }

    state.state = ChainState.PROMPTING;
    state.llmState = {
      prompt: state.candidateBlock.prompt,
      response: state.prevResponse,
    };

    for (const client of clients) {
      sendAccepted(client, state.candidateBlock.prompt);
    }
    state.prevHash = state.candidateBlock.hash
      .toString("hex")
      .padStart(64, "0");

    const response = await mockllm(state.candidateBlock.prompt, (token) => {
      for (const client of clients) {
        sendToken(client, token);
      }
    });

    state.prevHash = state.candidateBlock.hash
      .toString("hex")
      .padStart(64, "0");
    state.prevResponse = response;
    writeEntry({
      hash: state.prevHash,
      nonce: state.candidateBlock.nonce,
      prompt: state.candidateBlock.prompt,
      response,
    });
    state.state = ChainState.ACCEPTING;
    state.candidateBlock = undefined;
    timer.reset();
    timer.start();
    for (const client of clients) {
      sendCountdown(client, Date.now() + timer.getTimeRemaining());
      sendMineable(client, state.prevHash, state.prevResponse);
    }
  });

  return {
    prevHash, // TODO load from file
    prevResponse, // TODO load from file
    count, // TODO load from file
    state: ChainState.ACCEPTING,
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

const state = await initialState();

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

    console.log(
      "client disconnected, clients remaining: ",
      state.clients.length
    );
  });

  // Send the current leader and countdown
  sendCurrentLeader(res);
  if (state.state === ChainState.ACCEPTING) {
    sendMineable(res, state.prevHash, state.prevResponse);
  } else {
    if (!state.llmState) {
      throw new Error("llmState is undefined (indicates a bug)");
    }
    sendAccepted(res, state.llmState!.prompt);
    sendToken(res, state.llmState!.response);
  }

  console.log("time remaining: ", state.timer.getTimeRemaining());
  sendCountdown(res, Date.now() + state.timer.getTimeRemaining());
});

type SubmitParams = {
  prompt: string;
  nonce: string;
  prevHash: string;
  expectedHash: string;
};

const valid256String = (str: string): boolean => {
  return (
    typeof str === "string" &&
    str.length === 64 &&
    /^[0-9a-fA-F]+$/.test(str)
  );
}

app.post("/submit", (req: Request, res: Response) => {
  const { prompt, nonce, prevHash, expectedHash } = req.body as SubmitParams;

  // check the parameters are present
  if (!prompt || !nonce || !prevHash) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  // check prompt is a string
  if (typeof prompt !== "string") {
    return res.status(400).json({ error: "prompt must be a string" });
  }

  // check nonce is a hex string of length 64
  if (!valid256String(nonce)) {
    return res.status(400).json({ error: "nonce must be a hex string" });
  }

  // check prevHash is a hex string of length 64
  if (!valid256String(prevHash)) {
    return res.status(400).json({ error: "prevHash must be a hex string" });
  }

  // check expectedHash is a hex string of length 64
  if (!valid256String(expectedHash)) {
    return res.status(400).json({ error: "expectedHash must be a hex string" });
  }

  const nonceBN = new BN(nonce, "hex");

  const hash = hashBlock({
    prompt,
    nonce: nonceBN,
    prevHash,
    prevResponse: state.prevResponse,
  });

  console.log("hash: ", hash, " expectedHash: ", expectedHash);

  // check the expected hash is correct
  if (hash !== expectedHash) {
    return res.status(400).json({ error: "Incorrect hash" });
  }

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
  const hashBN = new BN(hash, "hex");

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
      return res.status(409).json({
        error: `Invalid block - hash ${hash} is not less than ${state.candidateBlock.hash
          .toString("hex")
          .padStart(64, "0")}`,
      });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
