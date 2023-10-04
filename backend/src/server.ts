import express, { Request, Response } from "express";
import cors from "cors";
import BN from "bn.js";
import bodyParser from "body-parser";

import { type Block, hashBlock, ServerMessage } from "common";

import Timer from "./timer.js";
import { lastState, writeEntry, getChatHistory, getLastEntries } from "./db.js";
import { type LLMState, callLlm } from "./llm.js";

import env from "./env.js";
import { enforceAdmin } from "./middleware.js";
import { countTokens } from "./tokenize.js";

const app = express();

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

const sendAccepted = (
  client: Response,
  prompt: string,
  hash: string,
  id: number
) => {
  client.write(
    `data:${JSON.stringify({
      type: "accepted",
      prompt,
      hash,
      id,
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
  llmState: LLMState;
};

const initialState = async (): Promise<State> => {
  const { count, prevHash, prevResponse } = await lastState();

  const timer = new Timer(env.ROUND_TIME * 1000);
  timer.start();

  const clients: Response[] = [];

  timer.on("end", async () => {
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
      hash: state.candidateBlock.hash.toString("hex").padStart(64, "0"),
    };

    const hashString = state.candidateBlock.hash
      .toString("hex")
      .padStart(64, "0");

    state.count++;
    for (const client of clients) {
      sendAccepted(
        client,
        state.candidateBlock.prompt,
        hashString,
        state.count
      );
    }
    state.prevHash = state.candidateBlock.hash
      .toString("hex")
      .padStart(64, "0");

    const response = await callLlm(
      state.candidateBlock.prompt,
      hashString,
      state,
      (token) => {
        for (const client of clients) {
          sendToken(client, token);
        }
      }
    );

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
    prevHash,
    prevResponse,
    count,
    state: ChainState.ACCEPTING,
    timer,
    clients,
    llmState: {
      prompt: "",
      response: "",
      hash: "",
    },
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
    sendAccepted(
      res,
      state.llmState!.prompt,
      state.llmState!.hash,
      state.count
    );
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
    typeof str === "string" && str.length === 64 && /^[0-9a-fA-F]+$/.test(str)
  );
};

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

app.get("/history", async (req: Request, res: Response) => {
  const { from, to } = req.query as { from: string; to: string };

  if (!from && !to) {
    // use default values
    const entries = await getChatHistory(state.count - 4, state.count);
    return res.status(200).json(entries);
  }

  if (!from || !to) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  const fromInt = parseInt(from);

  if (isNaN(fromInt)) {
    return res.status(400).json({ error: "from must be a number" });
  }

  const toInt = parseInt(to);

  if (isNaN(toInt)) {
    return res.status(400).json({ error: "to must be a number" });
  }

  const entries = await getChatHistory(fromInt, toInt);

  res.status(200).json(entries);
});

app.post("/duration", enforceAdmin, (req, res) => {
  const { duration } = req.body;

  console.log("setting duration to ", duration);

  if (!duration) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  const durationInt = parseInt(duration);

  if (isNaN(durationInt) || durationInt <= 0) {
    return res
      .status(400)
      .json({ error: "duration must be a positive number" });
  }

  state.timer.changeResetDuration(durationInt * 1000);

  res.status(200).json({ message: "Round duration set" });
});

app.get("/debug", (req, res) => {
  getLastEntries(10).then((entries) => {
    countTokens(entries[0].response);
  });
  res.status(200).json({ message: "debug" });
});

app.listen(env.PORT, () => {
  console.log(`Backend listening on port ${env.PORT}`);
});
