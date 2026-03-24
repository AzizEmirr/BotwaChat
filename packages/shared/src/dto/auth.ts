export type RegisterRequestDTO = {
  email: string;
  username: string;
  password: string;
};

export type LoginRequestDTO = {
  emailOrUsername: string;
  password: string;
};

export type AuthTokensDTO = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
};
