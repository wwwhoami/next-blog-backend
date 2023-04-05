import { UserNoPasswordEntity } from 'src/user/entities/user.entity';

export type AccessRefreshTokens = {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiry: number;
};

export type SignedUpUser = UserNoPasswordEntity & AccessRefreshTokens;
