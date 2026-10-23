export interface AuthenticatedUser {
  id: string;
  displayName: string;
  email: string;
  roles: string[];
  sessionId?: string;
  activeStoreId?: string | null;
}

export interface AuthenticatedRequest {
  headers: { cookie?: string };
  socket?: { remoteAddress?: string };
  user?: AuthenticatedUser;
}
