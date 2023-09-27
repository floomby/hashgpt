// TODO this really could use some refactoring (it is confusing and there is also a very unlikely to occur race)
// TODO fix the unresponsiveness when mining (idk the exact cause) - consider just using a webworker (it would be better anyways)
// TODO buffer rotation to keep the gpu fully busy while the cpu has the result buffer mapped and stuff

import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import BN from "bn.js";
import { ServerEventsContext } from "./ServerEvents";

import MineWorker from "../lib/miningWorker?worker";
import { type MiningWorkerMessage } from "../lib/miningWorker";

interface MiningProviderProps {
  setMiningPrompt: (miningPrompt: string) => void;
  mining: boolean;
  setMining: React.Dispatch<React.SetStateAction<boolean>>;
  hashRate: number;
}

export const MiningContext = createContext<MiningProviderProps>({
  setMiningPrompt: () => {},
  mining: false,
  setMining: () => {},
  hashRate: 0,
});

interface MiningProps {
  children: ReactNode;
}

export const MiningProvider: React.FC<MiningProps> = ({ children }) => {
  const [mining, setMining] = useState<boolean>(false);
  const [hashRate, setHashRate] = useState<number>(0);
  const [ready, setReady] = useState<boolean>(false);

  const { prevBlockComponents, leaderBoard, mineable } =
    useContext(ServerEventsContext);

  const minerWorkerRef = useRef<Worker | null>();

  useEffect(() => {
    minerWorkerRef.current = new MineWorker();
    minerWorkerRef.current.onmessage = (
      event: MessageEvent<MiningWorkerMessage>
    ) => {
      console.log(event.data);
      switch (event.data.type) {
        case "ready":
          setReady(true);
          let target =
            "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
          if (leaderBoard[0]?.hash) {
            target = leaderBoard[0].hash;
          }
          minerWorkerRef.current?.postMessage({
            type: "setTarget",
            target,
          } as MiningWorkerMessage);

          if (prevBlockComponents) {
            minerWorkerRef.current?.postMessage({
              type: "setPrevBlockComponents",
              prevHash: prevBlockComponents.hash,
              prevResponse: prevBlockComponents.response,
            } as MiningWorkerMessage);
          }
          break;
        default:
          console.log(event.data);
      }
    };
  }, []);

  const setMiningPrompt = useCallback((prompt: string) => {
    minerWorkerRef.current?.postMessage({
      type: "setPrompt",
      prompt,
    } as MiningWorkerMessage);
    minerWorkerRef.current?.postMessage({
      type: "start",
    } as MiningWorkerMessage);
  }, []);

  useEffect(() => {
    if (mineable === false) {
      minerWorkerRef.current?.postMessage({
        type: "stop",
      } as MiningWorkerMessage);
    }
  }, [mineable]);

  useEffect(() => {
    let target =
      "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    if (leaderBoard[0]?.hash) {
      target = leaderBoard[0].hash;
    }
    minerWorkerRef.current?.postMessage({
      type: "setTarget",
      target,
    } as MiningWorkerMessage);
  }, [leaderBoard]);

  useEffect(() => {
    if (prevBlockComponents) {
      minerWorkerRef.current?.postMessage({
        type: "setPrevBlockComponents",
        prevHash: prevBlockComponents.hash,
        prevResponse: prevBlockComponents.response,
      } as MiningWorkerMessage);
    }
  }, [prevBlockComponents]);

  return (
    <MiningContext.Provider
      value={{
        setMiningPrompt,
        mining,
        setMining,
        hashRate,
      }}
    >
      {children}
    </MiningContext.Provider>
  );
};
