// import Graphemer from "graphemer";
import { get_encoding } from "@dqbd/tiktoken";

const encoder = get_encoding("cl100k_base");
// const textDecoder = new TextDecoder();
// const graphemer = new Graphemer();

// for gpt-3.5-turbo (and gpt-4 I think)
export const countTokens = (text: string) => {
  const encoding = encoder.encode(text, "all");

  return encoding.length;
};
