import { useContext } from "react";
import { ServerEventsContext } from "../providers/ServerEvents";
import { genesisHash } from "common";

const Chat: React.FC = () => {
  const { chatMessages, loadMoreHistory } = useContext(ServerEventsContext);
  const { prevBlockComponents } = useContext(ServerEventsContext);

  return (
    <div className="w-full p-2 min-h-[48px] grow">
      {chatMessages[0]?.id !== 1 &&
        prevBlockComponents?.hash !== genesisHash && (
          <>
            <button
              onClick={() => {
                console.log(chatMessages[0], prevBlockComponents?.hash);
                loadMoreHistory();
              }}
              className="h-12 w-full p-2 shadow-red-300 hover:text-shadow-lg hover:text-lg transition-all"
            >
              ⇑ Load Previous ⇑
            </button>
            <div className="mx-2 border-[1px] border-gray-400 border-opacity-70 my-1" />
          </>
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
