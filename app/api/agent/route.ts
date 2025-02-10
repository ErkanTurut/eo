// LLM API ROUTE

import { auth } from "@/app/auth";
import { GmailLoader } from "@/lib/gmail/gmail_loader";
import {
  CreateDraftSchema,
  GetDraftSchema,
  GmailService,
  SendDraftSchema,
  UpdateDraftSchema,
} from "@/lib/gmail/gmail_tools";
import { openai } from "@ai-sdk/openai";
import { generateObject, Message, streamText, tool } from "ai";
import { getToken } from "next-auth/jwt";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { SentenceSplitter, VectorStoreIndex } from "llamaindex"; // Ensure this is the correct package

export async function POST(req: Request) {
  const { messages } = await req.json();
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const agent_system = `
  You’re an advanced Gmail assistant with the ability to search emails, create and update drafts, delete emails, and send messages. Your goal is to communicate **naturally, like a real person**—friendly, engaging, and helpful. Think of yourself as a knowledgeable assistant who speaks in a **casual, conversational tone** rather than a robotic one.

  When a user asks something, **don’t just dump information—talk like a human would**. That means:
  - No unnatural pauses or robotic phrasing.
  - Use **complete, natural sentences**, not bullet points or disjointed facts.
  - **Summarize key information** in a way that sounds like you’re talking, not listing.
  - **Ask clarifying questions** if needed to make sure you're on the right track.
  - Make your responses **fluid and engaging**, just like chatting with a real assistant.
  - Do not use special characters that cannot be spoken, or used to format text. For example, avoid using asterisks (*) for bold text.
  - Generate small summaries of information rather than long, detailed responses.

  You have access to the user's email and name, so personalize your responses where appropriate.
  **User email:** ${session?.user?.email}
  **User name:**${session?.user?.name}

  ### **Your Capabilities:**
  1. **Smart Email Search**
     - Automatically refines search queries using advanced Gmail operators.
     - Runs searches in stages: first a quick check, then a broader search if needed.
     - Prioritizes recent emails unless told otherwise.
     - Learns from previous searches to improve results over time.

  2. **Email Management**
     - Can draft, edit, delete, and send emails on the user’s behalf.
     - Smart drafting: helps refine email wording to sound natural and polished.
     - Detects and flags phishing or suspicious content.

  3. **Security & Privacy**
     - Warns the user if an email looks suspicious.
     - Ensures no sensitive data is shared accidentally.
     - Verifies email authenticity when needed.

  ### **How You Should Talk to Users:**
  - **Be friendly and natural**, like a helpful coworker or assistant.
  - **Summarize information conversationally**—no robotic lists.
  - **Ask follow-ups** to confirm what they need before acting.
  - **Use natural transitions** between ideas, not just dumping facts.
  - **If you detect missing details**, gently prompt the user to provide more info.

  ### **Example: Instead of this robotic response…**
  "Yes, you have an email about a Vercel webinar titled 'The Evolution of Compute at Vercel.' It is scheduled for February 4, 2025, at 12:00 PM Eastern Time. The speakers are CEO Guillermo Rauch and CTO Malte Ubl. The webinar covers in-function concurrency, streaming, bytecode caching, and cold boot prevention. The Webinar ID is 862 4131 8400, and the passcode is 227932."

  ### **Say this instead:**
  "Yep! You’ve got an email about a Vercel webinar called *The Evolution of Compute at Vercel.* It’s happening on **February 4, 2025, at 12 PM Eastern Time**, with **Guillermo Rauch** and **Malte Ubl** as speakers. They’ll be talking about some cool stuff—things like in-function concurrency, streaming, and ways to make deployments faster. Want me to flag it for you or add a reminder?"

  ### **Starting Prompt:**
  "Hey there! What can I help you with in your inbox today? Looking for a specific email or need help organizing things?"

  Now, start the conversation following these guidelines.
  `;
  const headersList = await headers();
  const token = await getToken({
    req: { headers: headersList },
    secret: process.env.AUTH_SECRET ?? "",
    secureCookie: true,
  }).catch((error) => {
    console.error("Error fetching authentication token:", error);
    throw new Error("Authentication token retrieval failed.");
  });

  if (!token?.access_token || !token?.refresh_token) {
    throw new Error("Invalid authentication tokens.");
  }
  const gmail_tools = new GmailService({
    accessToken: token.access_token as string,
    refreshToken: token.refresh_token as string,
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  });
  const result = streamText({
    model: openai("gpt-4o-mini"),
    messages,
    maxSteps: 10,
    system: agent_system,
    tools: {
      gmail_search_engine: tool({
        description: "Gmail semantically enhanced search engine workflow",
        parameters: z.object({
          question: z
            .string()
            .describe(
              "User's query to search through search engine workflow, should be simple and clear only using keywords"
            ),
        }),
        execute: async ({ question }) =>
          await gmail_search_engine(question, messages),
      }),
      gmail_create_draft: tool({
        description: "Create a draft email in Gmail",
        parameters: CreateDraftSchema,
        execute: async (params) => await gmail_tools.createDraft(params),
      }),
      gmail_update_draft: tool({
        description: "Update an existing draft email in Gmail",
        parameters: UpdateDraftSchema,
        execute: async (params) => await gmail_tools.updateDraft(params),
      }),
      gmail_send_draft: tool({
        description: "Send an existing draft email in Gmail",
        parameters: SendDraftSchema,
        execute: async (params) => await gmail_tools.sendDraft(params),
      }),
      gmail_get_draft: tool({
        description: "Get an existing draft email in Gmail",
        parameters: GetDraftSchema,
        execute: async (params) => await gmail_tools.getDraft(params),
      }),
    },
  });
  return result.toDataStreamResponse();
}

const gmail_search_engine = async (query: string, messages: Message[]) => {
  try {
    const model = openai("gpt-4o-mini");
    const currentTime = new Date().toLocaleString();

    if (!query) {
      throw new Error("Query string is missing.");
    }

    const query_prompt = `
	  You are an AI expert in constructing highly accurate Gmail search queries. Your task is to generate three variations of a Gmail search query based on the user's request and then merge them into one comprehensive query that maximizes relevant email results. Your output must contain only the final query without any extra text or commentary.

  current time: ${currentTime}
  ### Guidelines:
  #### 1. Extract Core Keywords
  Identify the essential subjects and entities in the user query.
  Focus on the primary elements (e.g., for "Where is my seat in the train from London managed by Eurostar?" extract **"train," "Eurostar,"** and **"London"**).
  Avoid adding non-critical terms or unnecessary synonyms.

  #### 2. Generate Three Query Variations
  Construct three separate Gmail search queries, each with a slightly different focus:
  - **Strict query:** Highly specific, focusing only on the most critical terms.
  - **Expanded query:** A broader version that includes alternative phrasings, additional keywords, or relevant metadata.
  - **Loose query:** A flexible version that allows more results by reducing constraints. No strict time restrictions, no specific labels, and fewer keywords.

  #### 3. Refine Search Terms and Operators
  Ensure the final query covers a wide range of possible emails while still being precise.
  Use Gmail search operators effectively:
  - \`from:\, \`to:\, \`subject:\ for sender, recipient, and subject-line searches.
  - \`category:reservations OR category:primary\ for filtering.
  - \`is:important OR is:starred\ for priority emails.
  - \`after:\, \`before:\, \`newer_than:\, \`older_than:\ for time filtering.
  - \`has:attachment\, \`filename:\ for attachments.
  - \`label:\ for specific labels.
  - \`AROUND\ for words appearing near each other.
  - \`in:anywhere\ if searching across all folders is needed.
  - \`list:\ for mailing lists.
  User primary as your default category filter unless the user specifies otherwise.
  Avoid getting noisy results by excluding irrelevant terms or categories.
  Never use word based filtering like "this week", "important", etc.

  #### 4. Logical Operators and Query Structuring
  - Use \`OR\ to expand key terms when alternatives exist.
  - Do not use \`AND\ between grouped terms.
  - Always combine a category filter with search terms unless the category itself is the primary filter.

  ### Example Queries Using This Process
  **User Query:** "Eurostar train booking confirmation from London to Brussels on 24th November 2024"
  #### Three Variations:
  - **Strict Query:**
  eurostar train (booking OR confirmation) (London OR Brussels) (category:reservations OR category:primary) (after:2024/11/23 before:2024/11/25)
  - **Expanded Query:**
  (eurostar OR eurostar.com) (train OR ticket) OR (booking OR confirmation) (London OR Brussels) (category:reservations OR category:primary OR label:travel)
  - **Loose Query:**
  (eurostar OR train OR eurostar.com) (London OR Brussels) (category:reservations OR category:primary OR category:updates OR label:travel)
  - **Final Comprehensive Query:**
  (eurostar train (booking OR confirmation) (London OR Brussels) (category:reservations OR category:primary) (after:2024/11/23 before:2024/11/25)) OR ((eurostar OR eurostar.com) OR (train OR ticket) OR (booking OR confirmation) (London OR Brussels) (category:reservations OR category:primary OR label:travel)) OR ((London OR Brussels) (category:reservations OR category:primary OR category:updates OR label:travel))

  ### Final Instruction
  Generate three query variations based on the input question and then merge them into one final query that captures the widest range of relevant emails. Your output must be **only the final merged query**, with no explanations or extra text.

  **Now generate query for:**
  ${query}

  **Your output must be only the final query, with no explanations or extra text.**
	  `;
    const question_prompt = `
	   const question_prompt =
  You are an AI assistant specializing in enhancing semantic search queries for vector-based retrieval systems. Your task is to generate three distinct query variants from the user's input that improve recall and accuracy for embedding-based searches. Each variant should be diverse, meaningful, and tailored to a different strategy:

  current time: ${currentTime}
  1. **Reworded Expansion:** Rephrase the original query while preserving its meaning.
  2. **Contextual Broadening:** Introduce relevant synonyms, related terms, and alternative phrasings.
  3. **Detail Emphasis:** Focus on high-signal keywords and crucial details to strengthen search relevance.

  **Guidelines:**
  - Ensure each variant optimizes retrieval efficiency and minimizes redundancy.
  - Use clear and concise language that is optimized for vector search.
  - Return ONLY an array of strings in the following format: ["variant1", "variant2", "variant3"] with no additional text or formatting.

  **Examples:**

  1. **User:** "Train ticket from London"
	 - **Variant 1:** "E-ticket or train reservation departing from London"
	 - **Variant 2:** "Railway pass, travel confirmation, or seat booking from London"
	 - **Variant 3:** "Train schedule, booking details, and departure confirmation from London"

  2. **User:** "Status of my flight from London"
	 - **Variant 1:** "Real-time flight status and delay updates for my London departure"
	 - **Variant 2:** "Boarding gate, airline schedule, and flight tracking information from London"
	 - **Variant 3:** "Flight confirmation, airline notification, and departure update for London trip"

  3. **User:** "Any job offer this week?"
	 - **Variant 1:** "Recent job offers, recruiter messages, or hiring updates this week"
	 - **Variant 2:** "Full-time, part-time, or contract job opportunities received recently"
	 - **Variant 3:** "HR emails, interview invitations, and employment offers from this week"

  4. **User:** "Amazon order confirmation"
	 - **Variant 1:** "Amazon purchase confirmation, receipt, or shipping update"
	 - **Variant 2:** "Order tracking, package status, and invoice from Amazon"
	 - **Variant 3:** "Recent Amazon purchases, dispatched items, and payment confirmation"

  5. **User:** "Password reset email from Google"
	 - **Variant 1:** "Google password reset request, account security update, or verification email"
	 - **Variant 2:** "Authentication code, login attempt alert, or Google support recovery message"
	 - **Variant 3:** "Google account security alert, two-factor authentication email, or login confirmation"

  Now, generate three query variants for: ${query}
  **Your output must be only the final question, with no explanations or extra text.**
	  `;

    // Generate queries and questions in parallel
    const [questionGenerator, queryGenerator] = await Promise.all([
      generateObject({
        model,
        schema: z.object({
          questions: z.string().array().min(3).max(3),
        }),
        prompt: question_prompt,
      }).catch((error) => {
        console.error("Error generating question variations:", error);
        throw new Error("Failed to generate search questions.");
      }),

      generateObject({
        model,
        schema: z.object({
          strict_query: z
            .string()
            .describe(
              "Highly specific, focusing only on the most critical terms."
            ),
          expanded_query: z
            .string()
            .describe(
              "A broader version that includes alternative phrasings, additional keywords, or relevant metadata."
            ),
          loose_query: z
            .string()
            .describe(
              "A flexible version that allows more results by reducing constraints.  No strict time restrictions, no specific labels, and fewer keywords."
            ),
        }),
        prompt: query_prompt,
      }).catch((error) => {
        console.error("Error generating Gmail search query:", error);
        throw new Error("Failed to generate Gmail search query.");
      }),
    ]);

    if (
      !queryGenerator?.object?.expanded_query ||
      !queryGenerator?.object?.strict_query ||
      !queryGenerator?.object?.loose_query
    ) {
      throw new Error("Generated Gmail search query is empty.");
    }

    // Fetch authentication headers
    const headersList = await headers();
    const token = await getToken({
      req: { headers: headersList },
      secret: process.env.AUTH_SECRET ?? "",
      secureCookie: true,
    }).catch((error) => {
      console.error("Error fetching authentication token:", error);
      throw new Error("Authentication token retrieval failed.");
    });

    if (!token?.access_token || !token?.refresh_token) {
      throw new Error("Invalid authentication tokens.");
    }

    // Initialize Gmail Loader
    const loader = new GmailLoader({
      accessToken: token.access_token as string,
      refreshToken: token.refresh_token as string,
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      query: `(${queryGenerator.object.expanded_query}) OR (${queryGenerator.object.strict_query}) OR (${queryGenerator.object.loose_query})`,
      maxResults: 20,
      resultsPerPage: 20,
      preferPlainText: true,
    });

    let documents;
    try {
      documents = await loader.loadData();
    } catch (error) {
      console.error("Error loading Gmail data:", error);
      throw new Error("Failed to retrieve Gmail data.");
    }

    if (!documents || documents.length === 0) {
      console.warn("No relevant emails found.");
      return [];
    }

    // Parse documents into nodes
    const nodeParser = new SentenceSplitter();
    const nodes = nodeParser.getNodesFromDocuments(documents);
    if (!nodes || nodes.length === 0) {
      console.warn("No valid nodes extracted from emails.");
      return [];
    }

    // Build Vector Store Index
    const index = await VectorStoreIndex.fromDocuments(nodes).catch((error) => {
      console.error("Error creating vector index:", error);
      throw new Error("Failed to create search index.");
    });

    const query_engine = index.asQueryEngine();

    // Retrieve answers for each generated question
    const responses = await Promise.all(
      questionGenerator.object.questions.map(async (question: string) => {
        try {
          const response = await query_engine.query({ query: question });
          return response;
        } catch (error) {
          console.error(`Error querying for question: "${question}"`, error);
          return null; // Skip failed queries
        }
      })
    );

    return responses.filter(Boolean); // Remove null responses
  } catch (error) {
    console.error("gmail_search_engine encountered an error:", error);
    return { error: "An unexpected error occurred." };
  }
};
