import dotenv from "dotenv";
import OpenAI from "openai";
import { getLastEntries } from "./db.js";

dotenv.config({ path: "../.env" });

const mocking = process.env.MOCK_LLM === "true";

const openai = new OpenAI();

// for in flight generation
export type LLMState = {
  prompt: string;
  response: string;
  hash: string;
};

const mockLLM = (
  prompt: string,
  hash: string,
  state: { llmState: LLMState },
  callback: (token: string) => void
) => {
  state.llmState = { prompt, response: "", hash };
  console.log("mocking llm");
  return new Promise<string>((resolve) => {
    let tokenCount = 20;
    const interval = setInterval(() => {
      if (tokenCount > 0) {
        tokenCount--;
        state.llmState.response += "blah ";
        callback("blah ");
      } else {
        clearInterval(interval);
        resolve(state.llmState.response);
      }
    }, 500);
  });
};

const getChatHistory = async (): Promise<
  { role: "user" | "assistant"; content: string }[][]
> =>
  (await getLastEntries(4)).map((entry) => [
    { role: "user", content: entry.prompt },
    { role: "assistant", content: entry.response },
  ]);

const generateLLM = async (
  prompt: string,
  hash: string,
  state: { llmState: LLMState },
  callback: (token: string) => void
) => {
  state.llmState = { prompt, response: "", hash };
  console.log("generate llm");
  const stream = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "system",
        content:
          "Keep your responses concise. If asked for a lengthy response provide a short answer instead.",
      },
      ...(await getChatHistory()).flat(),
      { role: "user", content: prompt },
    ],
    stream: true,
  });
  for await (const part of stream) {
    process.stdout.write(part.choices[0]?.delta?.content || "");
    callback(part.choices[0]?.delta?.content || "");
    state.llmState.response += part.choices[0]?.delta?.content || "";
  }
  return state.llmState.response;
};

export const callLLM = mocking ? mockLLM : generateLLM;
