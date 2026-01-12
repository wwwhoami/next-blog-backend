import { MediaVariant } from 'prisma/generated/client';

export const MEDIA_PROCESSOR_QUEUE = 'media-processor';

export interface VariantConfig {
  variant: MediaVariant;
  width?: number;
  quality?: number;
  suffix: string;
}

export const VARIANT_CONFIGS: VariantConfig[] = [
  {
    variant: MediaVariant.THUMBNAIL,
    width: 300,
    quality: 65,
    suffix: 'thumb',
  },
  {
    variant: MediaVariant.MEDIUM,
    width: 800,
    quality: 75,
    suffix: 'medium',
  },
  {
    variant: MediaVariant.LARGE,
    width: 1600,
    quality: 80,
    suffix: 'large',
  },
];

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const SUPPORTED_IMAGE_FORMATS = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/tiff',
  'image/avif',
];
