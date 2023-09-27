import {
  LeaderMessage,
  ServerMessage,
  genesisHash,
  genesisResponse,
} from "common";
import React, { createContext, ReactNode, useEffect, useState } from "react";
import BN from "bn.js";

export type ChatMessages = {
  prompt: string;
  response?: string;
};

interface ServerEventsProviderProps {
  timeLeft: number | null;
  leaderBoard: LeaderMessage[];
  mineable: boolean;
  currentHash: string;
  prevResponse: string;
  chatMessages: ChatMessages[];
}

export const ServerEventsContext = createContext<ServerEventsProviderProps>({
  timeLeft: null,
  leaderBoard: [],
  mineable: false,
  currentHash: genesisHash, // idk if I like this default initialization here?
  prevResponse: genesisResponse,
  chatMessages: [],
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
  const [currentHash, setCurrentHash] = useState<string>(genesisHash);
  const [prevResponse, setPrevResponse] = useState<string>(genesisResponse);
  // TODO get the chat history!
  const [chatMessages, setChatMessages] = useState<ChatMessages[]>([]);

  useEffect(() => {
    // Create an EventSource connection to the server's /events endpoint
    const eventSource = new EventSource("http://localhost:3000/events");

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
          setCurrentHash(message.currentHash);
          setPrevResponse(message.prevResponse);
          setLeaderBoard([]);
          break;
        case "accepted":
          setMineable(false);
          setChatMessages((prevChatMessages) => {
            return [
              ...prevChatMessages,
              {
                prompt: message.prompt,
              },
            ];
          });
          break;
        case "token":
          console.log("token", message);
          setChatMessages((prevChatMessages) => {
            const lastMessage = prevChatMessages[prevChatMessages.length - 1];
            // TODO fix the poor performing code here
            return [
              ...prevChatMessages.slice(0, prevChatMessages.length - 1),
              {
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
        currentHash,
        chatMessages,
        prevResponse,
      }}
    >
      {children}
    </ServerEventsContext.Provider>
  );
};
