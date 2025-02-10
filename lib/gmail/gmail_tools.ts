import { google, Auth, gmail_v1 } from "googleapis";
import { z } from "zod";
import * as base64 from "js-base64";
import iconv from "iconv-lite";

const EmailBaseSchema = z.object({
  to: z.array(z.string().email()).min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  threadId: z.string().optional(),
});

export const CreateDraftSchema = EmailBaseSchema;
export const UpdateDraftSchema = EmailBaseSchema.partial().extend({
  draftId: z.string().min(1),
});
export const SendDraftSchema = z.object({ draftId: z.string().min(1) });
export const GetDraftSchema = z.object({ draftId: z.string().min(1) });

type GmailDraft = gmail_v1.Schema$Draft;
type GmailMessagePart = gmail_v1.Schema$MessagePart;

export class GmailService {
  private gmail: gmail_v1.Gmail;
  private auth: Auth.OAuth2Client;

  constructor(
    private readonly config: {
      accessToken: string;
      refreshToken: string;
      clientId: string;
      clientSecret: string;
    }
  ) {
    this.auth = new google.auth.OAuth2({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });
    this.auth.setCredentials({
      access_token: config.accessToken,
      refresh_token: config.refreshToken,
    });
    this.gmail = google.gmail({ version: "v1", auth: this.auth });
  }

  async createDraft(
    params: z.infer<typeof CreateDraftSchema>
  ): Promise<GmailDraft> {
    try {
      const rawMessage = this.buildMimeMessage(params);
      const { data } = await this.gmail.users.drafts.create({
        userId: "me",
        requestBody: { message: { raw: rawMessage } },
      });
      return data;
    } catch (error: any) {
      throw this.handleError("Failed to create draft", error);
    }
  }

  async updateDraft(
    params: z.infer<typeof UpdateDraftSchema>
  ): Promise<GmailDraft> {
    try {
      const existing = await this.getDraft({ draftId: params.draftId });
      const mergedParams = this.mergeDraftParams(existing, params);
      const rawMessage = this.buildMimeMessage(mergedParams);
      const { data } = await this.gmail.users.drafts.update({
        userId: "me",
        id: params.draftId,
        requestBody: { message: { raw: rawMessage } },
      });
      return data;
    } catch (error: any) {
      throw this.handleError("Failed to update draft", error);
    }
  }

  async getDraft(params: z.infer<typeof GetDraftSchema>): Promise<GmailDraft> {
    try {
      const { data } = await this.gmail.users.drafts.get({
        userId: "me",
        id: params.draftId,
        format: "full",
      });
      return data;
    } catch (error: any) {
      throw this.handleError("Failed to get draft", error);
    }
  }

  async sendDraft(
    params: z.infer<typeof SendDraftSchema>
  ): Promise<GmailDraft> {
    try {
      const { data } = await this.gmail.users.drafts.send({
        userId: "me",
        requestBody: { id: params.draftId },
      });
      return data;
    } catch (error: any) {
      throw this.handleError("Failed to send draft", error);
    }
  }

  private buildMimeMessage(params: z.infer<typeof EmailBaseSchema>): string {
    // Build MIME headers and message body
    const headers = [
      `To: ${params.to.join(", ")}`,
      ...(params.cc ? [`Cc: ${params.cc.join(", ")}`] : []),
      ...(params.bcc ? [`Bcc: ${params.bcc.join(", ")}`] : []),
      `Subject: ${params.subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: quoted-printable",
    ].join("\n");

    const fullMessage = `${headers}\n\n${params.body}`;
    // Use Buffer to encode and return URL-safe base64 encoded string
    return base64.encodeURI(fullMessage);
  }

  private mergeDraftParams(
    existing: GmailDraft,
    updates: Partial<z.infer<typeof EmailBaseSchema>>
  ): z.infer<typeof EmailBaseSchema> {
    const existingHeaders = existing.message?.payload?.headers?.reduce(
      (acc, header) => {
        if (header.name && header.value) {
          acc[header.name.toLowerCase()] = header.value;
        }
        return acc;
      },
      {} as Record<string, string>
    );

    return {
      to: updates.to || existingHeaders?.["to"]?.split(", ") || [],
      subject: updates.subject || existingHeaders?.["subject"] || "",
      body:
        updates.body ||
        this.extractBodyContent(existing.message?.payload) ||
        "",
      cc: updates.cc || existingHeaders?.["cc"]?.split(", ") || [],
      bcc: updates.bcc || existingHeaders?.["bcc"]?.split(", ") || [],
      threadId: updates.threadId,
    };
  }

  private extractBodyContent(payload?: GmailMessagePart): string {
    if (!payload) return "";
    if (payload.body?.data) {
      return this.decodeBodyPart(payload);
    }
    if (payload.parts) {
      const textPart = payload.parts.find((p) => p.mimeType === "text/plain");
      return textPart ? this.decodeBodyPart(textPart) : "";
    }
    return "";
  }

  private decodeBodyPart(part: GmailMessagePart): string {
    try {
      if (!part.body?.data) return "";
      const decoded = base64.decode(
        part.body.data.replace(/-/g, "+").replace(/_/g, "/")
      );
      const charset = this.detectCharset(part.headers || []);
      return iconv.decode(Buffer.from(decoded, "binary"), charset);
    } catch (error) {
      console.error("Part decoding failed:", error);
      return "";
    }
  }

  private detectCharset(headers: gmail_v1.Schema$MessagePartHeader[]): string {
    const contentType =
      headers.find((h) => h.name?.toLowerCase() === "content-type")?.value ||
      "";
    const charsetMatch = contentType.match(/charset=([^;]+)/i);
    return charsetMatch?.[1]?.toLowerCase() || "utf-8";
  }

  private handleError(message: string, error: any): Error {
    console.error(`${message}:`, error);
    return new Error(`${message}: ${error.message}`);
  }
}
