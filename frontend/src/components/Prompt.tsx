import { useContext, useState } from "react";

import pickaxe from "../assets/pickaxe.svg";

import { MiningContext } from "../providers/Mining";
import { ServerEventsContext } from "../providers/ServerEvents";

const Prompt: React.FC = () => {
  const [prompt, setPrompt] = useState<string>("");

  const { setMiningPrompt, setMining } = useContext(MiningContext);
  const { mineable } = useContext(ServerEventsContext);

  return (
    <div className="flex flex-row p-2 w-full h-fit">
      <input
        className="border border-gray-400 rounded-l-lg px-2 py-2 text-black grow min-h-[20px]"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setMiningPrompt(prompt);
            setMining(true);
          }
        }}
      />
      <button
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold rounded-r-lg flex flex-row items-center px-2 py-1 disabled:opacity-30 disabled:cursor-not-allowed"
        onClick={() => {
          setMiningPrompt(prompt);
          setMining(true);
        }}
        disabled={!mineable}
      >
        <img className="h-8" src={pickaxe} alt="Mine Prompt" />
      </button>
    </div>
  );
};

export default Prompt;
