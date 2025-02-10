import Google from "next-auth/providers/google";

import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";

export const providers: Provider[] = [
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    authorization: {
      params: {
        prompt: "consent",
        access_type: "offline",
        response_type: "code",
        scope: [
          "openid",
          "https://www.googleapis.com/auth/gmail.readonly",
          "https://www.googleapis.com/auth/gmail.send",
          "https://www.googleapis.com/auth/gmail.compose",
          "https://www.googleapis.com/auth/gmail.modify",
          "https://www.googleapis.com/auth/userinfo.profile",
          "https://www.googleapis.com/auth/userinfo.email",
        ].join(" "),
      },
    },
  }),
];

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers,
  trustHost: true,
  callbacks: {
    async jwt({ token, account, user }) {
      if (user) {
        token.user = user;
      }
      if (account) {
        return {
          ...token,
          ...user,
          ...account,
        };
      } else if (Date.now() < token.expires_at * 1000) {
        return token;
      } else {
        if (!token.refresh_token) throw new TypeError("Missing refresh_token");
        try {
          const response = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            body: new URLSearchParams({
              client_id: process.env.AUTH_GOOGLE_ID!,
              client_secret: process.env.AUTH_GOOGLE_SECRET!,
              grant_type: "refresh_token",
              refresh_token: token.refresh_token!,
            }),
          });

          const tokensOrError = await response.json();

          if (!response.ok) throw tokensOrError;

          const newTokens = tokensOrError as {
            access_token: string;
            expires_in: number;
            refresh_token?: string;
          };

          return {
            ...token,
            access_token: newTokens.access_token,
            expires_at: Math.floor(Date.now() / 1000 + newTokens.expires_in),
            refresh_token: newTokens.refresh_token
              ? newTokens.refresh_token
              : token.refresh_token,
          };
        } catch (error) {
          console.error("Error refreshing access_token", error);
          // If we fail to refresh the token, return an error so we can handle it on the page
          token.error = "RefreshTokenError";
          return token;
        }
      }
    },
    async session({ session, token }) {
      session.error = token.error;
      return session;
    },
  },
});
