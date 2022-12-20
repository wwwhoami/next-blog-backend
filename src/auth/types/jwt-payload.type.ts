export type JwtPayload = {
  name: string;
  sub: string;
  exp?: number;
};
