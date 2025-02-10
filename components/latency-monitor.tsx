"use client";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { InfoIcon } from "lucide-react";

export const LatencyMonitor = ({
  metrics,
}: {
  metrics: { stt: number[]; tts: number[]; llm: number[] };
}) => {
  const calculateStats = (arr: number[]) => {
    if (arr.length === 0) return { avg: 0, min: 0, max: 0, p95: 0 };
    const sorted = [...arr].sort((a, b) => a - b);
    return {
      avg: sorted.reduce((a, b) => a + b, 0) / sorted.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p95: sorted[Math.floor(sorted.length * 0.95)],
    };
  };

  const formatNumber = (num: number) => Math.round(num * 10) / 10;

  const MetricCard = ({ type, values }: { type: string; values: number[] }) => {
    const { avg, min, max } = calculateStats(values);
    const lastFive = values.slice(-5).reverse();

    return (
      <HoverCard>
        <HoverCardTrigger>
          <div className="flex items-center gap-1 cursor-help ">
            <InfoIcon className="size-3 text-muted-foreground" />
            <span className="font-medium">{type}:</span>
            {formatNumber(avg)}ms
            <span className="text-muted-foreground">({values.length})</span>
          </div>
        </HoverCardTrigger>
        <HoverCardContent className="w-64">
          <div className="space-y-1 text-xs font-mono">
            <div className="flex justify-between">
              <span>Avg</span>
              <span className="bg-muted px-1 rounded-sm ">
                {formatNumber(avg)}ms
              </span>
            </div>
            <div className="flex justify-between text-orange-500 ">
              <span>Peak</span>
              <span className="bg-orange-500/10 px-1 rounded-sm  ">
                {formatNumber(max)}ms
              </span>
            </div>
            <div className="flex justify-between text-emerald-500 ">
              <span>Best</span>
              <span className="bg-emerald-500/10 px-1 rounded-sm   ">
                {formatNumber(min)}ms
              </span>
            </div>
            <div className="pt-2 border-t">
              <div className="text-muted-foreground mb-2">
                Recent readings (newest first):
              </div>
              <div className=" flex flex-col gap-1">
                {lastFive.map((v, i) => (
                  <span key={i}>
                    - {formatNumber(v)} ms
                    {i === 0 && (
                      <span className="text-muted-foreground"> now</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  };

  return (
    <div className="p-2 border-b text-xs bg-muted/50 flex gap-0.5 flex-col overflow-x-auto touch-pan-x font-mono">
      <div className="text-xs text-muted-foreground">
        {/* explain that this is latency monitor displayed in average format in ms */}
        Average latency in milliseconds
      </div>
      <div className="flex gap-2 justify-center">
        <MetricCard type="STT" values={metrics.stt} />
        <MetricCard type="LLM" values={metrics.llm} />
        <MetricCard type="TTS" values={metrics.tts} />
      </div>
    </div>
  );
};
