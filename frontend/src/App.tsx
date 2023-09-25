import Prompt from "./components/Prompt";
import Leader from "./components/Leader";
import CountdownTimer from "./components/CountdownTimer";
import Chat from "./components/Chat";
import { ServerEventsProvider } from "./providers/ServerEvents";

const App: React.FC = () => {
  return (
    <ServerEventsProvider>
      <div className="flex flex-col gap-4 align-start justify-center bg-slate-950 min-h-screen text-white">
        <CountdownTimer />
        <Leader />
        <Chat />
        <Prompt />
      </div>
    </ServerEventsProvider>
  );
};

export default App;
