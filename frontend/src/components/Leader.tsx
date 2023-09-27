import { type LeaderMessage } from "common";
import { useContext } from "react";
import { ServerEventsContext } from "../providers/ServerEvents";
import { MiningContext } from "../providers/Mining";

const Leader: React.FC = () => {
  const { leaderBoard, generating, mineable } = useContext(ServerEventsContext);
  const { currentPrompt } = useContext(MiningContext);

  return (
    <div className="min-h-[96px]">
      {leaderBoard
        .filter(
          (leader: LeaderMessage, index: number) =>
            (!mineable && leader.hash === generating) ||
            (mineable && (leader.prompt === currentPrompt || index < 2))
        )
        .map((leader: LeaderMessage) => (
          <div
            key={leader.hash}
            className={
              "m-2 flex flex-col rounded-lg ring-slate-400 ring-[1px] divide-y-[1px] divide-slate-400" +
              (generating === leader.hash
                ? " animate-pulse bg-green-700 bg-opacity-50"
                : currentPrompt === leader.prompt
                ? " animate-pulse bg-blue-700 bg-opacity-50"
                : "")
            }
          >
            <div className="flex flex-row gap-0 w-full rounded-t-lg p-2">
              <p>{leader.prompt}</p>
            </div>
            <div
              key={leader.hash}
              className="flex flex-row gap-0 w-full divide-x-[1px] divide-slate-400"
            >
              <div className="font-monospace p-2">{leader.hash}</div>
              <div className="font-monospace p-2">{leader.nonce}</div>
            </div>
          </div>
        ))}
    </div>
  );
};

export default Leader;
