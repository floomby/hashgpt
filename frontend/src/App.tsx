import { useEffect, useState } from "react";
import { Prompt } from "./components/Prompt";
import { Leader } from "./components/Leader";
import { CountdownTimer } from "./components/CountdownTimer";

function App() {
  // const [messages, setMessages] = useState<string[]>([]);

  // useEffect(() => {
  //   // Create an EventSource connection to the server's /events endpoint
  //   const eventSource = new EventSource("http://localhost:3000/events");

  //   eventSource.onmessage = (event) => {
  //     setMessages((prevMessages) => [...prevMessages, event.data]);
  //   };

  //   // Clean up the event source when the component is unmounted
  //   return () => {
  //     eventSource.close();
  //   };
  // }, []);

  const [targetDate, setTargetDate] = useState<Date>(
    new Date(Date.now() + 10000)
  );

  return (
    <div className="flex flex-col gap-4 align-start justify-center bg-slate-950 min-h-screen text-white">
      {/* <h1>Received Broadcasted Messages:</h1>
      <ul>
        {messages.map((message, index) => (
          <li key={index}>{message}</li>
        ))}
      </ul> */}
      <CountdownTimer targetDate={targetDate} />
      <Leader />
      <Prompt />
    </div>
  );
}

export default App;
