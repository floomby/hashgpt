import { ServerMessage, type LeaderMessage } from "common";
import { useContext, useEffect, useState } from "react";
import { ServerEventsContext } from "../providers/ServerEvents";

const Leader: React.FC = () => {
  const { leaderBoard } = useContext(ServerEventsContext);

  return (
    <table className="table-auto">
      <thead>
        <tr>
          <th className="px-4 py-2">Hash</th>
          <th className="px-4 py-2">Nonce</th>
          <th className="px-4 py-2">Prompt</th>
        </tr>
      </thead>
      <tbody>
        {leaderBoard.map((leader: LeaderMessage) => (
          <tr key={leader.hash}>
            <td className="border px-4 py-2">{leader.hash}</td>
            <td className="border px-4 py-2">{leader.nonce}</td>
            <td className="border px-4 py-2">{leader.prompt}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default Leader;
