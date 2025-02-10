"use server";

import { auth } from "@/app/auth";
import { CartesiaClient } from "@cartesia/cartesia-js";

export async function POST(req: Request) {
  const { text } = await req.json();
  const session = await auth();

  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const client = new CartesiaClient({
    apiKey: process.env.CARTESIA_API_KEY,
  });

  const voice = await client.tts.bytes({
    modelId: "sonic",
    transcript: text,
    voice: {
      mode: "id",
      id: "794f9389-aac1-45b6-b726-9d9369183238",
    },
    language: "en",
    outputFormat: {
      container: "raw",
      sampleRate: 24000,
      encoding: "pcm_f32le",
    },
  });

  if (!voice) {
    return new Response("Voice synthesis failed", { status: 500 });
  }

  return new Response(voice, {
    headers: { "Content-Type": "audio/pcm_f32le" },
  });
}
