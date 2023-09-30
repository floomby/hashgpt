import { LeaderMessage, ServerMessage } from "common";
import React, {
  createContext,
  ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import BN from "bn.js";

export type ChatMessages = {
  id: number;
  prompt: string;
  response?: string;
};

export type PrevBlockComponents = {
  hash: string;
  response: string;
};

interface ServerEventsProviderProps {
  timeLeft: number | null;
  leaderBoard: LeaderMessage[];
  mineable: boolean;
  prevBlockComponents?: PrevBlockComponents;
  chatMessages: ChatMessages[];
  generating?: string;
  loadMoreHistory: () => void;
}

export const ServerEventsContext = createContext<ServerEventsProviderProps>({
  timeLeft: null,
  leaderBoard: [],
  mineable: false,
  prevBlockComponents: undefined,
  chatMessages: [],
  loadMoreHistory: () => {},
});

interface ServerEventsProps {
  children: ReactNode;
}

export const ServerEventsProvider: React.FC<ServerEventsProps> = ({
  children,
}) => {
  const [targetTime, setTargetTime] = useState<Date | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [mineable, setMineable] = useState<boolean>(false);
  const [generating, setGenerating] = useState<string>(""); // hash of the previous block

  useEffect(() => {
    if (targetTime === null) return;

    const intervalId = setInterval(() => {
      const now = new Date().getTime();
      const distance = targetTime.getTime() - now;

      if (distance <= 0) {
        clearInterval(intervalId);
        setTimeLeft(0);
      } else {
        setTimeLeft(distance);
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [targetTime]);

  const [leaderBoard, setLeaderBoard] = useState<LeaderMessage[]>([]);
  const [prevBlockComponents, setPrevBlockComponents] = useState<
    PrevBlockComponents | undefined
  >(undefined);

  const [chatMessages, setChatMessages] = useState<ChatMessages[]>([]);
  const loadMoreHistory = useCallback(() => {
    const earliestMessageId = chatMessages[0]?.id;

    let params = new URLSearchParams();
    if (earliestMessageId !== undefined) {
      params.append("from", (earliestMessageId - 4).toString());
      params.append("to", (earliestMessageId - 1).toString());
    }

    fetch(`${import.meta.env.VITE_API_BASE}/history?${params.toString()}`)
      .then((response) => response.json())
      .then((data) => {
        setChatMessages((prevChatMessages) => {
          return [...data, ...prevChatMessages];
        });
      })
      .catch(console.error);
  }, [setChatMessages, chatMessages]);

  useEffect(() => {
    // Create an EventSource connection to the server's /events endpoint
    const eventSource = new EventSource(`${import.meta.env.VITE_API_BASE}/events`);

    eventSource.onmessage = (event: MessageEvent<string>) => {
      const message = JSON.parse(event.data) as ServerMessage;
      switch (message.type) {
        case "leader":
          {
            const hashBN = new BN(message.hash, "hex");
            console.log("leader", message);
            let insertIndex = 0;
            while (insertIndex < leaderBoard.length) {
              const otherHashBN = new BN(leaderBoard[insertIndex].hash, "hex");
              if (hashBN.gt(otherHashBN)) {
                insertIndex++;
                continue;
              }
              break;
            }
            // Insert the new leader into the leaderboard
            setLeaderBoard((prevLeaderBoard) => {
              // remove anything in the leaderboard that has the same prompt
              prevLeaderBoard = prevLeaderBoard.filter(
                (leader) => leader.prompt !== message.prompt
              );

              console.log("prevLeaderBoard", prevLeaderBoard);
              return [
                ...prevLeaderBoard.slice(0, insertIndex),
                message,
                ...prevLeaderBoard.slice(insertIndex),
              ];
            });
          }
          break;
        case "countdown":
          {
            const targetTime = new Date(message.targetTime);
            setTargetTime(targetTime);
          }
          break;
        case "mineable":
          setMineable(true); // I don't like how this can get out of sync
          setPrevBlockComponents({
            hash: message.currentHash,
            response: message.prevResponse,
          });
          setLeaderBoard([]);
          break;
        case "accepted":
          setMineable(false);
          setGenerating(message.hash);
          console.log("accepted", message);
          setChatMessages((prevChatMessages) => {
            return [
              ...prevChatMessages,
              {
                id: message.id,
                prompt: message.prompt,
              },
            ];
          });
          break;
        case "token":
          setChatMessages((prevChatMessages) => {
            const lastMessage = prevChatMessages[prevChatMessages.length - 1];
            // TODO fix the poor performing code here
            return [
              ...prevChatMessages.slice(0, prevChatMessages.length - 1),
              {
                id: lastMessage.id,
                prompt: lastMessage.prompt,
                response: (lastMessage.response ?? "") + message.tokenText,
              },
            ];
          });
          break;
        default:
          break;
      }
    };

    // Clean up the event source when the component is unmounted
    return () => {
      eventSource.close();
    };
  }, []);

  return (
    <ServerEventsContext.Provider
      value={{
        timeLeft,
        leaderBoard,
        mineable,
        chatMessages,
        prevBlockComponents,
        generating,
        loadMoreHistory,
      }}
    >
      {children}
    </ServerEventsContext.Provider>
  );
};
