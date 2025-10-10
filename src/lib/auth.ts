import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "google") {
        const email = (profile as { email?: string } | null)?.email || "";
        const emailLowerCase = email.toLowerCase()
        return emailLowerCase.endsWith("@lamunpunit.com") || emailLowerCase.endsWith("@lmwn.com");
      }
      return false;
    },
    async session({ session }) {
      if (session?.user?.email) {
        session.user.email = session.user.email.toLowerCase();
      }
      return session;
    },
  },
};


