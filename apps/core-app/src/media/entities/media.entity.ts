import { MediaTarget, MediaType, MediaVariant } from 'prisma/generated/client';

export class MediaEntity {
  id: string;
  key: string;
  ownerId: string;
  parentId: string | null;
  postId: number | null;
  commentId: number | null;
  type: MediaType;
  target: MediaTarget;
  variant: MediaVariant;
  mimeType: string;
  sizeBytes: string;
  bucket: string;
  publicUrl: string;
  hash: string | null;
  refCount: number;
  createdAt: Date;
  deletedAt: Date | null;
}
