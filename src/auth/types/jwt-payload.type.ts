import { Role } from '@prisma/client';

export type JwtPayload = {
  name: string;
  sub: string;
  role: Role;
  exp?: number;
};
