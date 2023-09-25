import { useContext, useEffect, useState } from "react";
import { ServerEventsContext } from "../providers/ServerEvents";

const CountdownTimer: React.FC = () => {
  const { timeLeft } = useContext(ServerEventsContext);

  // Convert the time left to hours, minutes, and seconds for display
  const hours =
    timeLeft != null
      ? Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      : 0;
  const minutes =
    timeLeft != null
      ? Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60))
      : 0;
  const seconds =
    timeLeft != null ? Math.floor((timeLeft % (1000 * 60)) / 1000) : 0;
  
  return (
    <div className={
      `w-full flex justify-center text-6xl font-bold font-mono text-purple-400 shadow-red-300 text-shadow ${
        timeLeft === null || timeLeft > 0 ? "" : "animate-pulse"
      }`
    }>
      {hours < 10 ? `0${hours}` : hours}:
      {minutes < 10 ? `0${minutes}` : minutes}:
      {seconds < 10 ? `0${seconds}` : seconds}
    </div>
  );
};

export default CountdownTimer;
