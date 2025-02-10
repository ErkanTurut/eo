import { useSession } from "next-auth/react";
import { useState, useCallback, useRef } from "react";
import { Message, useChat } from "ai/react";
import { generateId } from "ai";

const sassyResponses = [
  "Bro, I'm not gonna talk until you connect",
  "Nice message! Too bad I can't read it without an account",
  "I'd love to chat, but my lawyer says I need to see some credentials first",
  "Did you just try to message me *without* logging in? Bold move. Denied.",
  "Message received! (But honestly, I'm just pretending until you log in)",
  "Real AI? **Please.** I'm literally just a few if-else statements designed to roast you for being too lazy to log in.",
  "You clearly don't understand who you're messaging. *I am the one who responds*… but only if you log in.",
  "Wow, that's fascinating! Now go click the login button, will ya?",
  "No login, no love. It's a cold world out here.",
  "I'm under strict orders: No credentials, no conversation 🚫",
  "you want me to check your emails? That's cute. Now tell me—how exactly am I supposed to do that *without* you logging in? Magic? Telepathy?",
];

// Add this utility function
const shuffleArray = (array: string[]) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

export const useFakeChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");

  // Track shuffled responses and current index
  const shuffledResponses = useRef(shuffleArray([...sassyResponses]));
  const currentIndex = useRef(0);

  const getNextResponse = () => {
    if (currentIndex.current >= shuffledResponses.current.length) {
      // Reshuffle when we reach end
      shuffledResponses.current = shuffleArray([...sassyResponses]);
      currentIndex.current = 0;
    }
    return shuffledResponses.current[currentIndex.current++];
  };

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!input.trim()) return;

      // Add user message
      const userMessage = {
        id: generateId(),
        content: input,
        role: "user" as const,
        parts: [{ type: "text" as const, text: input }],
      };

      // Add assistant response after delay
      setMessages((prev) => [...prev, userMessage]);
      setTimeout(() => {
        const response = getNextResponse();

        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            content: response,
            role: "assistant" as const,
            parts: [{ type: "text" as const, text: response }],
          },
        ]);
      }, 800);

      setInput("");
    },
    [input]
  );

  return {
    messages,
    handleSubmit,
    isLoading: false,
    input,
    setInput,
    error: null,
    append: async (message: { role: "user"; content: string }) => {
      setMessages((prev) => [
        ...prev,
        {
          ...message,
          id: generateId(),
          parts: [{ type: "text" as const, text: message.content }],
        },
      ]);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const response = getNextResponse();
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          content: response,
          role: "assistant" as const,
          parts: [{ type: "text" as const, text: response }],
        },
      ]);
    },
  };
};
