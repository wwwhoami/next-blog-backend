import { Role } from 'prisma/generated/client';

export type AuthUser = {
  id: string;
  name: string;
  role: Role;
};
