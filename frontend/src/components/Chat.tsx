import { useContext } from "react";
import { ServerEventsContext } from "../providers/ServerEvents";

const Chat: React.FC = () => {
  const { chatMessages } = useContext(ServerEventsContext);

  return (
    <div className="w-full p-2 min-h-[48px]">
      {chatMessages.map((message, index) => {
        return (
          <div key={index} className="flex flex-col gap-1">
            <p>{message.prompt}</p>
            {message.response !== undefined ? <p>{message.response}</p> : null}
          </div>
        );
      })}
    </div>
  );
};

export default Chat;