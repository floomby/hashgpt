import { useContext } from "react";
import { ServerEventsContext } from "../providers/ServerEvents";
import { genesisHash } from "common";

const Chat: React.FC = () => {
  const { chatMessages, loadMoreHistory } = useContext(ServerEventsContext);
  const { prevBlockComponents } = useContext(ServerEventsContext);

  return (
    <div className="w-full p-2 min-h-[48px] grow">
      {chatMessages[0]?.id !== 1 && prevBlockComponents?.hash !== genesisHash && (
        <button
          onClick={() => {
            console.log(chatMessages[0], prevBlockComponents?.hash);
            loadMoreHistory();
          }}
          className="w-full p-2 bg-gray-200 hover:bg-gray-300 rounded-md text-black"
        >
          Load Previous
        </button>
      )}
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
