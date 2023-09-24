import { LeaderMessage, ServerMessage } from "common";
import React, { createContext, ReactNode, useEffect, useState } from "react";
import BN from "bn.js";

interface ServerEventsProviderProps {
  timeLeft: number | null;
  leaderBoard: LeaderMessage[];
}

export const ServerEventsContext = createContext<ServerEventsProviderProps>({
  timeLeft: null,
  leaderBoard: [],
});

interface ServerEventsProps {
  children: ReactNode;
}

export const ServerEventsProvider: React.FC<ServerEventsProps> = ({
  children,
}) => {
  const [targetTime, setTargetTime] = useState<Date | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

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
    <ServerEventsContext.Provider value={{ timeLeft, leaderBoard }}>
      {children}
    </ServerEventsContext.Provider>
  );
};
