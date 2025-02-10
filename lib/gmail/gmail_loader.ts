import { gmail_v1 } from "@googleapis/gmail";
import { Auth, google } from "googleapis";
import { htmlToText as convertHTML } from "html-to-text";
import iconv from "iconv-lite";
import * as base64 from "js-base64";
import { Document } from "llamaindex";

type GmailMessage = gmail_v1.Schema$Message;
type GmailMessagePart = gmail_v1.Schema$MessagePart;
type GmailMessagePartHeader = gmail_v1.Schema$MessagePartHeader;

interface EmailAddress {
  name: string;
  email: string;
}

interface MessageMetadata {
  id: string;
  threadId: string;
  from: EmailAddress[];
  to: EmailAddress[];
  subject: string;
  date: string;
  snippet: string;
  labels: string[];
}

interface GmailLoaderConfig {
  accessToken: string;
  refreshToken: string;
  query?: string;
  maxResults?: number;
  resultsPerPage?: number;
  preferPlainText?: boolean;
  clientId?: string;
  clientSecret?: string;
}

export class GmailLoader {
  private gmail: gmail_v1.Gmail | null = null;
  private config: GmailLoaderConfig;

  // Use property getters for defaults
  private get maxResults() {
    return this.config.maxResults ?? 10;
  }
  private get resultsPerPage() {
    return this.config.resultsPerPage ?? 100;
  }
  private get preferPlainText() {
    return this.config.preferPlainText ?? true;
  }
  private get query() {
    return this.config.query ?? "";
  }

  constructor(config: GmailLoaderConfig) {
    this.config = {
      query: "",
      maxResults: 10,
      resultsPerPage: 100,
      preferPlainText: true,
      ...config,
    };
  }

  /**
   * Initialize the Gmail API client.
   */
  async initialize(): Promise<void> {
    const auth = new google.auth.OAuth2({
      clientId: this.config.clientId || process.env.GOOGLE_CLIENT_ID,
      clientSecret:
        this.config.clientSecret || process.env.GOOGLE_CLIENT_SECRET,
    });
    auth.setCredentials({
      access_token: this.config.accessToken,
      refresh_token: this.config.refreshToken,
      expiry_date: Date.now() + 3600 * 1000,
    });

    this.gmail = google.gmail({
      version: "v1",
      auth: await this.getAuthenticatedClient(auth),
    });
  }

  private async getAuthenticatedClient(
    auth: Auth.OAuth2Client
  ): Promise<Auth.OAuth2Client> {
    if (auth.isTokenExpiring()) {
      try {
        const { credentials } = await auth.refreshAccessToken();
        auth.setCredentials(credentials);
        console.info("Access token refreshed successfully.");
      } catch (error: any) {
        console.error("Error refreshing access token:", error);
        throw new Error(
          "Failed to refresh access token. Please re-authenticate."
        );
      }
    }
    return auth;
  }

  /**
   * Loads emails from Gmail and returns them as Documents.
   */
  async loadData(): Promise<Document[]> {
    if (!this.gmail) await this.initialize();

    const messages = await this.searchMessages();
    const documents: Document[] = [];

    for (const message of messages) {
      try {
        const messageData = await this.getMessageData(message);
        if (messageData.body) {
          documents.push(
            new Document({
              text: messageData.body,
              metadata: {
                id: messageData.id,
                threadId: messageData.threadId,
                from: messageData.from,
                to: messageData.to,
                subject: messageData.subject,
                date: messageData.date,
                snippet: messageData.snippet,
                labels: messageData.labels,
              },
            })
          );
        }
      } catch (error) {
        console.error(`Error processing message ${message.id}:`, error);
      }
    }

    return documents;
  }

  private async searchMessages(): Promise<GmailMessage[]> {
    let messages: GmailMessage[] = [];
    let nextPageToken: string | undefined;
    let totalRetrieved = 0;

    try {
      while (totalRetrieved < this.maxResults) {
        const res = await this.gmail!.users.messages.list({
          userId: "me",
          q: this.query,
          maxResults: Math.min(
            this.resultsPerPage,
            this.maxResults - totalRetrieved
          ),
          pageToken: nextPageToken,
        });
        if (res.data.messages) {
          messages = messages.concat(res.data.messages);
          totalRetrieved += res.data.messages.length;
        }
        nextPageToken = res.data.nextPageToken || undefined;
        if (!nextPageToken) break;
      }
    } catch (error: any) {
      console.error("Error during message search:", error);
      throw error;
    }

    return messages.slice(0, this.maxResults);
  }

  private async getMessageData(
    message: GmailMessage
  ): Promise<MessageMetadata & { body: string }> {
    const res = await this.gmail!.users.messages.get({
      userId: "me",
      id: message.id!,
      format: "full",
    });
    const payload = res.data.payload!;
    const headers = this.extractHeaders(payload.headers!);
    const body = this.processPayload(payload);

    return {
      id: res.data.id!,
      threadId: res.data.threadId!,
      snippet: res.data.snippet!,
      from: this.parseEmailAddresses(headers.From || ""),
      to: this.parseEmailAddresses(headers.To || ""),
      subject: headers.Subject || "",
      date: headers.Date || "",
      labels: res.data.labelIds || [],
      body,
    };
  }

  private extractHeaders(
    headers: GmailMessagePartHeader[]
  ): Record<string, string> {
    return headers.reduce((acc, header) => {
      if (header.name) {
        acc[header.name] = header.value || "";
      }
      return acc;
    }, {} as Record<string, string>);
  }

  /**
   * Improved payload processing:
   * - For multipart messages, search for a "text/plain" part first (if preferPlainText is true)
   * - Otherwise, fall back to converting HTML to text.
   * - Finally, run extra cleaning to remove tracking URLs and noisy artifacts.
   */
  private processPayload(payload: GmailMessagePart): string {
    let bodyText = "";

    if (payload.mimeType?.startsWith("multipart/") && payload.parts) {
      if (this.preferPlainText) {
        const plainPart = this.findPartByMimeType(payload.parts, "text/plain");
        if (plainPart) {
          bodyText = this.decodeBodyPart(plainPart);
        }
      }
      if (!bodyText) {
        const htmlPart = this.findPartByMimeType(payload.parts, "text/html");
        if (htmlPart) {
          const htmlContent = this.decodeBodyPart(htmlPart);
          bodyText = this.convertHTMLToText(htmlContent);
        }
      }
      if (!bodyText) {
        bodyText = payload.parts
          .map((part) => this.processPayload(part))
          .join("\n");
      }
    } else if (payload.mimeType === "text/plain" && payload.body?.data) {
      bodyText = this.decodeBodyPart(payload);
    } else if (payload.mimeType === "text/html" && payload.body?.data) {
      const htmlContent = this.decodeBodyPart(payload);
      bodyText = this.convertHTMLToText(htmlContent);
    } else if (payload.body?.data) {
      bodyText = this.decodeBodyPart(payload);
    }

    return this.cleanText(bodyText);
  }

  /**
   * Recursively searches for a part with the given mimeType.
   */
  private findPartByMimeType(
    parts: GmailMessagePart[],
    mimeType: string
  ): GmailMessagePart | undefined {
    for (const part of parts) {
      if (part.mimeType === mimeType && part.body?.data) {
        return part;
      } else if (part.mimeType?.startsWith("multipart/") && part.parts) {
        const found = this.findPartByMimeType(part.parts, mimeType);
        if (found) return found;
      }
    }
    return undefined;
  }

  /**
   * Converts HTML content to plain text using improved options.
   */
  private convertHTMLToText(html: string): string {
    try {
      return convertHTML(html, {
        wordwrap: false,
        preserveNewlines: false,
      });
    } catch (error) {
      console.error("HTML conversion failed:", error);
      return "";
    }
  }

  /**
   * Decodes a body part by decoding its base64 data and handling the charset.
   */
  private decodeBodyPart(part: GmailMessagePart): string {
    if (!part.body?.data) return "";
    try {
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

  /**
   * Detects the charset from the headers; defaults to 'utf-8'.
   */
  private detectCharset(headers: GmailMessagePartHeader[]): string {
    const contentType =
      headers.find((h) => h.name?.toLowerCase() === "content-type")?.value ||
      "";
    const charsetMatch = contentType.match(/charset=([^;]+)/i);
    return charsetMatch?.[1]?.toLowerCase() || "utf-8";
  }

  /**
   * Performs additional cleaning on the text output.
   * In this method we:
   *   - Remove tracking URLs embedded in square brackets.
   *   - Remove bare URLs.
   *   - Remove extraneous symbols and collapse whitespace.
   */
  private cleanText(text: string): string {
    // Remove bracketed URLs like [https://...]
    text = text.replace(/\[https?:\/\/[^\]]+\]/gi, "");
    // Remove any remaining URLs
    text = text.replace(/https?:\/\/\S+/gi, "");
    // Remove stray control characters (e.g. =\x19, �)
    text = text.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
    // Collapse multiple spaces/newlines into a single space
    text = text.replace(/\s+/g, " ");
    return text.trim();
  }

  private parseEmailAddresses(addressStr: string): EmailAddress[] {
    return addressStr
      .split(",")
      .map((addr) => {
        // Regex to match name and email; e.g., John Doe <john@example.com>
        const match = addr.trim().match(/(.*?)(?:<(.+?)>)?$/);
        if (match) {
          const name = match[1].trim();
          const email = match[2]?.trim() || name;
          return { name, email };
        }
        return { name: "", email: addr.trim() };
      })
      .filter((addr) => addr.email);
  }
}
