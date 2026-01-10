import { MediaTarget, MediaType, MediaVariant } from '@prisma/client';

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
  postId?: number;
  commentId?: number;
  parentId?: string;
  hash?: string | null;
};
