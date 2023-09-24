import { ServerMessage, type LeaderMessage } from "common";
import { useEffect, useState } from "react";

export const Leader: React.FC = () => {
  const [leader, setLeader] = useState<LeaderMessage | null>(null);

  useEffect(() => {
    // Create an EventSource connection to the server's /events endpoint
    const eventSource = new EventSource("http://localhost:3000/events");

    eventSource.onmessage = (event: MessageEvent<string>) => {
      const message = JSON.parse(event.data) as ServerMessage;
      switch (message.type) {
        case "leader":
          console.log("leader");
          setLeader(message);
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
    <div className="flex flex-col gap-4 align-start justify-center">
      <h1 className="text-2xl font-bold">Current leader</h1>
      <p className="text-xl font-bold">{leader?.hash}</p>
      <p className="text-xl font-bold">{leader?.nonce}</p>
      <p className="text-xl font-bold">{leader?.prompt}</p>
    </div>
  );
};
