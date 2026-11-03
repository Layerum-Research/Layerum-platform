export type VerifiedAccessToken = {
  userId: string;
  sessionId: string | null;
};

export abstract class AccessTokenVerifier {
  abstract verify(token: string): Promise<VerifiedAccessToken>;
}
