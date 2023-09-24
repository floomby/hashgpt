import { useCallback, useState } from "react";
import { BN } from "bn.js";

import { bnToNetString, genesisHash } from "common";

const dummyNonce = new BN(0);

export const Prompt: React.FC = () => {
  const [prompt, setPrompt] = useState<string>("");

  const submit = useCallback(async () => {
    fetch(`http://localhost:3000/submit`, {
      method: "POST",
      body: JSON.stringify({
        nonce: bnToNetString(dummyNonce),
        prevHash: genesisHash,
        prompt: prompt,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => response.json())
      .then((data) => console.log(data))
      .catch((error) => console.error(error));
  }, [prompt]);

  return (
    <div className="flex flex-row pl-8">
      <input
        className="border border-gray-400 rounded px-4 py-2 w-1/2 text-black"
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <button
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        onClick={submit}
      >
        Submit
      </button>
    </div>
  );
};
