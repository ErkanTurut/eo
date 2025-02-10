"use client";
import { LoadingIcon } from "@/components/icons";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

const loadingMessages = {
  gmail_search_engine: [
    "Diving into your inbox ocean...",
    "Searching through digital letters...",
    "Playing hide and seek with emails...",
  ],
  gmail_create_draft: [
    "Warming up the digital pen...",
    "Preparing your masterpiece...",
    "Setting up your virtual stationery...",
  ],
  gmail_update_draft: [
    "Giving your draft a makeover...",
    "Polishing your words...",
    "Making your email even better...",
  ],
  gmail_send_draft: [
    "Preparing for takeoff...",
    "Training carrier pigeons...",
    "Getting ready to press send...",
  ],
  gmail_get_draft: [
    "Retrieving your work of art...",
    "Fetching your draft from the cloud...",
    "Looking for your email blueprint...",
  ],
  addResource: [
    "Adding knowledge to the vault...",
    "Making your database smarter...",
    "Storing valuable insights...",
  ],
  default: [
    "Brewing some code...",
    "Connecting the dots...",
    "Processing thoughts...",
  ],
};
const useRotatingMessage = (messages: string[], interval = 2000) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % messages.length);
    }, interval);
    return () => clearInterval(timer);
  }, [messages, interval]);

  return messages[index];
};

export const Loading = ({ tool }: { tool?: string }) => {
  const messages = tool
    ? loadingMessages[tool as keyof typeof loadingMessages]
    : loadingMessages.default;
  const message = useRotatingMessage(messages);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ type: "spring" }}
        className="overflow-hidden flex justify-start items-center"
      >
        <div className="flex flex-row gap-2 items-center">
          <div className="animate-spin text-muted-foreground">
            <LoadingIcon />
          </div>
          <div className="text-muted-foreground text-sm">{message}</div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
