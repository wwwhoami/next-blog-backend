import { MediaTarget, MediaType, MediaVariant } from 'prisma/generated/client';

export type MediaCreate = {
  key: string;
  bucket: string;
  type: MediaType;
  target: MediaTarget;
  variant: MediaVariant;
  mimeType: string;
  publicUrl: string;
  sizeBytes: bigint | number;
  ownerId: string;
  parentId?: string;
  hash?: string | null;
};
