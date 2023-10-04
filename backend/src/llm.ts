import OpenAI from "openai";
import { getLastEntries } from "./db.js";

import env from "./env.js";
import { countTokens } from "./tokenize.js";

const mocking = env.MOCK_LLM === "true";

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

// for in flight generation
export type LLMState = {
  prompt: string;
  response: string;
  hash: string;
};

const mockLlm = (
  prompt: string,
  hash: string,
  state: { llmState: LLMState },
  callback: (token: string) => void
) => {
  state.llmState = { prompt, response: "", hash };
  console.log("mocking llm");
  return new Promise<string>((resolve) => {
    let tokenCount = 5;
    const interval = setInterval(() => {
      if (tokenCount > 0) {
        tokenCount--;
        state.llmState.response += "blah ";
        callback("blah ");
      } else {
        clearInterval(interval);
        resolve(state.llmState.response);
      }
    }, 200);
  });
};

const getChatHistory_ = async (
  entryCount: number
): Promise<{ role: "user" | "assistant"; content: string }[][]> =>
  (await getLastEntries(entryCount)).map((entry) => [
    { role: "user", content: entry.prompt },
    { role: "assistant", content: entry.response },
  ]);

const getChatHistory = async (maxTokens: number) => {
  const history = (await getChatHistory_(5)).flat();
  const ret: { role: "user" | "assistant"; content: string }[] = [];

  let totalTokens = 0;

  if (history.length === 0) {
    return [];
  }

  console.log("chat history", history);
  let currentCount = countTokens(history[history.length - 1].content);

  while (totalTokens + currentCount < maxTokens) {
    totalTokens += currentCount;
    ret.push(history.pop()!);
    if (history.length === 0) {
      break;
    }
    currentCount = countTokens(history[history.length - 1].content);
  }

  console.log("chat history", ret);

  return ret;
};

const generateLlm = async (
  prompt: string,
  hash: string,
  state: { llmState: LLMState },
  callback: (token: string) => void
) => {
  state.llmState = { prompt, response: "", hash };
  console.log("generate llm");
  const stream = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    max_tokens: 1024,
    messages: [
      {
        role: "system",
        content:
          "Give good answers and try to be funny if you think of any jokes.",
      },
      ...(await getChatHistory(1024)),
      { role: "user", content: prompt },
    ],
    stream: true,
  });
  for await (const part of stream) {
    callback(part.choices[0]?.delta?.content || "");
    state.llmState.response += part.choices[0]?.delta?.content || "";
  }
  return state.llmState.response;
};

export const callLlm = mocking ? mockLlm : generateLlm;
