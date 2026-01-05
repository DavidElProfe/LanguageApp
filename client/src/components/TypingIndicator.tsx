export function TypingIndicator() {
  return (
    <div className="flex items-center space-x-1 p-4 bg-gray-100 rounded-2xl rounded-tl-none w-fit shadow-sm border border-gray-200 animate-fade-in">
      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
    </div>
  );
}
