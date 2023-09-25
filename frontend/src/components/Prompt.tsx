import { useCallback, useContext, useState } from "react";
import { BN } from "bn.js";

import pickaxe from "../assets/pickaxe.svg";

import { ServerEventsContext } from "../providers/ServerEvents";
import { mine } from "../lib/mine";

const submit = (nonce: string, prevHash: string, prompt: string) => {
  fetch(`http://localhost:3000/submit`, {
    method: "POST",
    body: JSON.stringify({
      nonce,
      prevHash,
      prompt,
    }),
    headers: {
      "Content-Type": "application/json",
    },
  })
    .then((response) => response.json())
    .then((data) => console.log(data))
    .catch((error) => console.error(error));
};

const Prompt: React.FC = () => {
  const [prompt, setPrompt] = useState<string>("");

  const { mineable, currentHash, prevResponse, leaderBoard } =
    useContext(ServerEventsContext);

  const minePrompt = useCallback(() => {
    mine(
      prompt,
      currentHash,
      prevResponse,
      new BN(
        leaderBoard[0]?.hash ??
          "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
        "hex"
      ),
      submit
    );
  }, [prompt, currentHash, prevResponse, leaderBoard]);

  return (
    <div className="flex flex-row px-2 w-full">
      <input
        className="border border-gray-400 rounded-l-lg px-2 py-2 text-black grow"
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <button
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold rounded-r-lg flex flex-row items-center px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={minePrompt}
        disabled={!mineable}
      >
        <img className="h-8" src={pickaxe} alt="Mine Prompt" />
      </button>
    </div>
  );
};

export default Prompt;
