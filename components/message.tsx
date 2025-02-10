"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { BotIcon, Info, UserIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import { Fragment } from "react";
import { Markdown } from "./markdown";

import type { Message } from "ai";

interface MessageIconProps {
  isUser: boolean;
  hasTools: boolean;
  userImage?: string | null;
}

const messageStyles = {
  container: "flex gap-1 items-center px-4 w-full md:px-0 first-of-type:pt-20",
  iconWrapper:
    "size-6 flex flex-col justify-center items-center flex-shrink-0 text-zinc-400",
  toolInvocation:
    "flex items-center gap-2 text-sm text-muted-foreground border border-dashed rounded-sm max-w-min",
  toolName: "bg-yellow-100 m-0.5 rounded-sm",
  content: "rounded-sm p-1 px-2 text-sm ",
  label: "text-xs text-muted-foreground px-2",
} as const;

const MessageIcon = ({ isUser, hasTools, userImage }: MessageIconProps) => {
  if (isUser) {
    return (
      <Avatar className="size-6 border">
        <AvatarImage src={userImage ?? ""} alt="User" />
        <AvatarFallback>
          <UserIcon className="size-4 text-primary" />
        </AvatarFallback>
      </Avatar>
    );
  }

  return (
    <Avatar className="size-6 border">
      <AvatarFallback>
        {hasTools ? (
          <Info className="size-4 text-primary" />
        ) : (
          <BotIcon className="size-4 text-primary " />
        )}
      </AvatarFallback>
    </Avatar>
  );
};

export const PreviewMessage = ({
  role,
  content,
  toolInvocations = [],
}: Partial<Message>) => {
  const { data: session } = useSession();
  const isUser = role === "user";
  const hasTools = toolInvocations.length > 0;
  const messageClass = cn(
    messageStyles.container,
    isUser ? "flex-row-reverse" : "flex-row"
  );
  const contentClass = cn(
    messageStyles.content,
    isUser
      ? "bg-foreground text-background"
      : hasTools
      ? "bg-transparent"
      : "bg-muted"
  );

  return (
    <motion.div
      className={messageClass}
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
    >
      <div className={messageStyles.iconWrapper}>
        <MessageIcon
          isUser={isUser}
          hasTools={hasTools}
          userImage={session?.user?.image}
        />
      </div>
      <div className={contentClass}>
        {hasTools && (
          <div className={messageStyles.toolInvocation}>
            {toolInvocations.map((tool, index) => (
              <Fragment key={`tool-${index}`}>
                <code className={messageStyles.toolName}>{tool.toolName}</code>
                {index < toolInvocations.length - 1 && ", "}
              </Fragment>
            ))}
          </div>
        )}
        <Markdown>{content as string}</Markdown>
      </div>
    </motion.div>
  );
};
