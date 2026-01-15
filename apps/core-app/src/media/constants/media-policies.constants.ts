import { MediaTarget, MediaType } from 'prisma/generated/client';

export type MediaPolicyKey = `${MediaTarget}_${MediaType}`;

export type ImageFormat = 'webp' | 'jpeg' | 'png' | 'gif' | 'avif' | 'tiff';

export interface MediaPolicy {
  maxWidth: number;
  maxHeight: number;
  resizeTo: number;
  formats: readonly ImageFormat[];
  maxFileSize: number;
  multipleAllowed: boolean;
}

export const MEDIA_POLICIES = {
  POST_IMAGE: {
    maxWidth: 2000,
    maxHeight: 2000,
    resizeTo: 1200,
    formats: ['webp', 'jpeg', 'png', 'gif'] as const,
    maxFileSize: 5 * 1024 * 1024,
    multipleAllowed: true,
  },
  COMMENT_IMAGE: {
    maxWidth: 1000,
    maxHeight: 1000,
    resizeTo: 800,
    formats: ['webp', 'jpeg', 'png', 'gif'] as const,
    maxFileSize: 2 * 1024 * 1024,
    multipleAllowed: true,
  },
  USER_AVATAR_IMAGE: {
    maxWidth: 500,
    maxHeight: 500,
    resizeTo: 256,
    formats: ['webp', 'jpeg', 'png', 'gif'] as const,
    maxFileSize: 1 * 1024 * 1024,
    multipleAllowed: false,
  },
} as const satisfies Record<MediaPolicyKey, MediaPolicy>;
