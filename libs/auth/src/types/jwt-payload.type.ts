import { Role } from 'prisma/generated/client';

export type JwtPayload = {
  name: string;
  sub: string;
  role: Role;
  exp?: number;
};
