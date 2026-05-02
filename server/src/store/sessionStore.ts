export interface Session {
  playerId: string;
  name: string;
  token: string;
  connectedAt: number;
}

class SessionStore {
  private sessions = new Map<string, Session>();

  createSession(playerId: string, name: string, token: string): Session {
    const session: Session = { playerId, name, token, connectedAt: Date.now() };
    this.sessions.set(playerId, session);
    return session;
  }

  getSession(playerId: string): Session | undefined {
    return this.sessions.get(playerId);
  }

  deleteSession(playerId: string): boolean {
    return this.sessions.delete(playerId);
  }

  getSessionByToken(token: string): Session | undefined {
    for (const session of this.sessions.values()) {
      if (session.token === token) return session;
    }
    return undefined;
  }
}

export const sessionStore = new SessionStore();
