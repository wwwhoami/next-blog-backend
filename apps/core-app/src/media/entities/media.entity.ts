export type MediaType = 'IMAGE';
export type MediaTarget = 'POST' | 'COMMENT' | 'USER_AVATAR';

export class Media {
  id: string;
  userId: string;
  mediaType: MediaType;
  bucket: string;
  key: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  hash: string;
  references: number;
  createdAt: Date;
  deletedAt?: Date;
}
