"use client";
import { PreviewMessage } from "@/components/message";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useFakeChat } from "@/lib/hooks/use-fake-chat";
import { useScrollToBottom } from "@/lib/hooks/use-scroll-to-bottom";
import { usePlayer } from "@/lib/hooks/usePlayer";
import { useMicVAD, utils as vadUtils } from "@ricky0123/vad-react";
import { useChat } from "ai/react";
import { Mic, MicOff, Send } from "lucide-react";
import { useSession } from "next-auth/react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { LatencyMonitor } from "./latency-monitor";
import { Loading } from "./loading";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
export function Chat() {
  const { data: session } = useSession();
  const isAuthenticated = !!session?.user;

  const [toolCall, setToolCall] = useState<{
    toolName: string;
    args: unknown;
  }>();
  const [latencyMetrics, setLatencyMetrics] = useState<{
    stt: number[];
    tts: number[];
    llm: number[];
  }>({ stt: [], tts: [], llm: [] });
  const player = usePlayer();
  const llmStartTime = useRef<number>(0);
  const vad = useMicVAD({
    startOnLoad: false,
    onSpeechEnd: async (audio) => {
      try {
        const sttStart = performance.now();
        const wav = vadUtils.encodeWAV(audio);
        const blob = new Blob([wav], { type: "audio/wav" });
        const formData = new FormData();
        formData.append("input", blob, "audio.wav");
        const sttResp = await fetch("/api/stt", {
          method: "POST",
          body: formData,
        });
        const transcript = await sttResp.text();
        if (!transcript) {
          toast.error("Could not transcribe audio.");
          return;
        }
        append({
          role: "user",
          content: transcript,
          annotations: [
            {
              toolName: "speech-to-text",
            },
          ],
        });

        // Record STT latency
        setLatencyMetrics((prev) => ({
          ...prev,
          stt: [...prev.stt, performance.now() - sttStart],
        }));
      } catch (error) {
        console.error("STT error:", error);
        toast.error("Speech recognition failed.");
      }
    },
    positiveSpeechThreshold: 0.6,
    minSpeechFrames: 4,
  });

  const chatImplementation = isAuthenticated ? useChat : useFakeChat;

  const { messages, handleSubmit, input, setInput, append, isLoading } =
    chatImplementation({
      onToolCall({ toolCall }) {
        setToolCall({ ...toolCall });
      },
      onResponse: () => {
        llmStartTime.current = performance.now();
      },
      onError: () => {
        toast.error("You've been rate limited, please try again later!");
      },
      onFinish: (finalMessage) => {
        if (llmStartTime.current) {
          const llmDuration = performance.now() - llmStartTime.current;
          setLatencyMetrics((prev) => ({
            ...prev,
            llm: [...prev.llm, llmDuration],
          }));
        }

        if (
          finalMessage &&
          finalMessage.role === "assistant" &&
          finalMessage.content
        ) {
          (async () => {
            try {
              const ttsStart = performance.now();
              if (!vad.listening) return;
              const ttsResp = await fetch("/api/tts", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ text: finalMessage.content }),
              });
              if (!ttsResp.ok || !ttsResp.body) {
                toast.error("Text-to-speech failed.");
                return;
              }
              player.play(ttsResp.body, () => {
                const isFirefox = navigator.userAgent.includes("Firefox");
                if (isFirefox) vad.start();
              });
              setLatencyMetrics((prev) => ({
                ...prev,
                tts: [...prev.tts, performance.now() - ttsStart],
              }));
            } catch (error) {
              console.error("TTS error:", error);
              toast.error("Text-to-speech error.");
            }
          })();
        }
      },
      api: "/api/agent",
    });

  const [messagesContainerRef, messagesEndRef] =
    useScrollToBottom<HTMLDivElement>();
  const currentToolCall = useMemo(() => {
    const tools = messages?.slice(-1)[0]?.toolInvocations;
    if (tools && toolCall?.toolName === tools[0].toolName) {
      return tools[0].toolName;
    } else {
      return undefined;
    }
  }, [toolCall, messages]);

  return (
    <TooltipProvider>
      <div className="md:border h-full w-full flex flex-col rounded-none overflow-hidden bg-background">
        {isAuthenticated && <LatencyMonitor metrics={latencyMetrics} />}
        <div className="overflow-hidden flex-grow">
          <ScrollArea
            ref={messagesContainerRef}
            className="flex-1 h-full py-0 px-2"
          >
            <div className="flex flex-col gap-2">
              {messages.map((message) =>
                message.parts.map((part, index) => {
                  if (part.type === "text") {
                    return (
                      <PreviewMessage
                        key={`${message.id}-text-${index}`}
                        role={message.role}
                        content={part.text}
                      />
                    );
                  }
                  if (part.type === "tool-invocation") {
                    return (
                      <PreviewMessage
                        key={`${message.id}-tool-${index}`}
                        role={message.role}
                        toolInvocations={[part.toolInvocation]}
                      />
                    );
                  }
                  return null;
                })
              )}
              {currentToolCall && isLoading && (
                <div className="px-2 min-h-12">
                  <Loading tool={currentToolCall} />
                </div>
              )}
            </div>
            <div
              ref={messagesEndRef}
              className="flex-shrink-0 min-w-[24px] min-h-[24px]"
            />
          </ScrollArea>
        </div>
        <form
          onSubmit={handleSubmit}
          className="flex p-2 bg-muted border-t gap-2 w-full"
        >
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e as any);
              }
            }}
            placeholder="Type your message..."
            className="flex-grow bg-background shadow-none focus-visible:ring-0 rounded-sm  max-h-24 "
          />
          <Tooltip>
            <TooltipContent className="bg-background border text-foreground rounded-sm">
              <p>Send your message</p>
            </TooltipContent>
            <TooltipTrigger asChild>
              <Button
                type="submit"
                size="icon"
                variant="ghost"
                className="hover:shadow-inner transition-all  shrink-0 duration-500 ease-in"
              >
                <Send className="h-4 w-4 text-muted-foreground " />
              </Button>
            </TooltipTrigger>
          </Tooltip>
          {isAuthenticated && (
            <Tooltip>
              <TooltipContent className="bg-background border text-foreground rounded-sm">
                {vad.listening
                  ? "Stop listening"
                  : "Start listening for voice input"}
              </TooltipContent>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant={"ghost"}
                  onClick={vad.toggle}
                  className={cn(
                    "shrink-0 hover:shadow-inner border border-transparent transition-all duration-500 ease-in",
                    vad.listening && "shadow-inner border-zinc-500"
                  )}
                >
                  {vad.listening ? (
                    <Mic className="h-4 w-4" />
                  ) : (
                    <MicOff className="h-4 w-4 text-muted-foreground " />
                  )}
                </Button>
              </TooltipTrigger>
            </Tooltip>
          )}
        </form>
      </div>
    </TooltipProvider>
  );
}
