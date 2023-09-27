import React from "react";
import Prompt from "./components/Prompt";
import Leader from "./components/Leader";
import CountdownTimer from "./components/CountdownTimer";
import Chat from "./components/Chat";
import { ServerEventsProvider } from "./providers/ServerEvents";
import { MiningProvider } from "./providers/Mining";

const App: React.FC = () => {
  return (
    <ServerEventsProvider>
      <MiningProvider>
        <React.StrictMode>
          <div className="flex flex-col gap-4 align-start justify-center bg-slate-950 min-h-screen text-white">
            <CountdownTimer />
            <Leader />
            <div className="m-2 border-[1px] border-slate-400"></div>
            <Chat />
            <Prompt />
          </div>
        </React.StrictMode>
      </MiningProvider>
    </ServerEventsProvider>
  );
};

export default App;
