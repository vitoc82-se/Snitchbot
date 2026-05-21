import NextAuth from 'next-auth';
import DiscordProvider from 'next-auth/providers/discord';
import sql from '../../../lib/db';

export const authOptions = {
  providers: [
    DiscordProvider({
      clientId:     process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async signIn({ user, account }) {
      const rows = await sql`
        INSERT INTO users (discord_id, discord_name, discord_avatar)
        VALUES (${account.providerAccountId}, ${user.name}, ${user.image})
        ON CONFLICT (discord_id) DO UPDATE
          SET discord_name   = EXCLUDED.discord_name,
              discord_avatar = EXCLUDED.discord_avatar
        RETURNING id
      `;
      user.dbId = rows[0].id;
      return true;
    },
    async jwt({ token, user, account }) {
      if (user?.dbId) {
        token.dbId     = user.dbId;
        token.discordId = account?.providerAccountId;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id        = token.dbId;
      session.user.discordId = token.discordId;
      return session;
    },
  },
};

export default NextAuth(authOptions);
