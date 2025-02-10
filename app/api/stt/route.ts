// STT API

import { auth } from "@/app/auth";
import { getToken } from "next-auth/jwt";
import { z } from "zod";
import { zfd } from "zod-form-data";
import { type NextRequest } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq();

const schema = zfd.formData({
  input: z.union([zfd.text(), zfd.file()]),
  message: zfd.repeatableOfType(
    zfd.json(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
  ),
});

export async function POST(request: NextRequest) {
  const session = await auth();
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? "",
  }).catch((error) => {
    console.error("Error fetching authentication token:", error);
    throw new Error("Authentication token retrieval failed.");
  });

  if (!session || !token) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { data, success } = schema.safeParse(await request.formData());
  if (!success) return new Response("Invalid request", { status: 400 });
  const transcript = await getTranscript(data.input);
  if (!transcript) return new Response("Invalid audio", { status: 400 });
  return new Response(transcript);
}

async function getTranscript(input: string | File) {
  if (typeof input === "string") return input;

  try {
    const { text } = await groq.audio.transcriptions.create({
      file: input,
      model: "whisper-large-v3-turbo",
    });

    return text.trim() || null;
  } catch {
    return null; // Empty audio file
  }
}
