import { MediaTarget, MediaType, MediaVariant } from 'prisma/generated/client';

export class MediaEntity {
  id: string;
  key: string;
  ownerId: string;
  parentId: string | null;
  type: MediaType;
  target: MediaTarget;
  variant: MediaVariant;
  mimeType: string;
  sizeBytes: string;
  bucket: string;
  publicUrl: string;
  hash: string | null;
  createdAt: Date;
  deletedAt: Date | null;
}
