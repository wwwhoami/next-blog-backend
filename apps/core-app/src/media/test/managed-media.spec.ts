import { ConfigService } from '@nestjs/config';
import { ManagedMedia } from '../util/managed-media';

describe('ManagedMedia', () => {
  const media = new ManagedMedia(
    new ConfigService({
      MINIO_MEDIA_BUCKET: 'media',
      MINIO_ENDPOINT: 'http://localhost:9000',
      MINIO_PUBLIC_URL: 'https://storage.example.com',
      MEDIA_BASE_URL: 'https://cdn.example.com/blog/',
    }),
  );

  it.each([
    'http://localhost:9000/media/image/file_thumb.webp',
    'https://storage.example.com/%6dedia/image/file_thumb.webp',
    'https://cdn.example.com/blog/media/image/file%5Fthumb.webp?v=1#preview',
  ])('resolves the object key in %s', (url) => {
    expect(media.key(url)).toBe('image/file_thumb.webp');
  });

  it.each([
    'https://cdn.example.com/other/media/image/file.webp',
    'https://cdn.example.com/blog/media-other/image/file.webp',
    'https://other.example.com/blog/media/image/file.webp',
  ])('treats %s as external', (url) => {
    expect(media.key(url)).toBeUndefined();
  });

  it('resolves protocol-relative configured prefixes and their absolute forms', () => {
    const media = new ManagedMedia(
      new ConfigService({
        MINIO_MEDIA_BUCKET: 'media',
        MEDIA_BASE_URL: '//cdn.example.com/blog/',
      }),
    );
    for (const scheme of ['', 'https:', 'http:']) {
      expect(
        media.key(`${scheme}//cdn.example.com/blog/media/image.webp`),
      ).toBe('image.webp');
    }
    expect(
      media.key('//cdn.example.com:8080/blog/media/image.webp'),
    ).toBeUndefined();
  });
});
