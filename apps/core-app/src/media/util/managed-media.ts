import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaTarget, MediaVariant, Prisma } from 'prisma/generated/client';

export const originalMedia = {
  deletedAt: null,
  parentId: null,
  variant: MediaVariant.ORIGINAL,
} as const;

/** Recognizes URLs for the configured media bucket and resolves them to eligible originals. */
export class ManagedMedia {
  private readonly prefixes: URL[];

  /**
   * Builds bucket prefixes from the storage endpoint, public URL, and media
   * base URL. Protocol-relative bases match both HTTP and HTTPS. Longer paths
   * are checked first so a nested prefix takes precedence.
   *
   * @param config - Storage configuration. A missing bucket disables URL matching.
   */
  constructor(config?: ConfigService) {
    const bucket = config?.get<string>('MINIO_MEDIA_BUCKET');
    this.prefixes = bucket
      ? ['MINIO_ENDPOINT', 'MINIO_PUBLIC_URL', 'MEDIA_BASE_URL']
          .map((name) => config?.get<string>(name))
          .filter((base): base is string => Boolean(base))
          .flatMap((base) => {
            const prefix = `${base.replace(/\/+$/, '')}/${bucket}/`;
            return base.startsWith('//')
              ? [new URL(`https:${prefix}`), new URL(`http:${prefix}`)]
              : [new URL(prefix)];
          })
          .sort((a, b) => b.pathname.length - a.pathname.length)
      : [];
  }

  /**
   * Extracts the decoded object key from a URL matching a configured bucket
   * prefix. Protocol-relative URLs use the prefix's scheme. Query strings and
   * fragments are ignored.
   *
   * @returns The object key, or `undefined` if the URL matches no prefix.
   * @throws {BadRequestException} If a recognized managed URL has invalid percent encoding.
   */
  key(url: string) {
    const value = url.trim();
    for (const prefix of this.prefixes) {
      let candidate: URL;
      try {
        candidate = new URL(
          value.startsWith('//') ? prefix.protocol + value : value,
        );
      } catch {
        return undefined;
      }
      if (candidate.origin !== prefix.origin) continue;

      try {
        const base = decodeURIComponent(prefix.pathname);
        const path = decodeURIComponent(candidate.pathname);
        if (path.startsWith(base)) return path.slice(base.length);
      } catch {
        if (candidate.pathname.startsWith(prefix.pathname)) {
          throw new BadRequestException('Invalid managed image URL');
        }
      }
    }
  }

  /** Extracts distinct managed object keys in first-seen order. */
  keys(urls: string[]) {
    return [
      ...new Set(
        urls.map((url) => this.key(url)).filter((key) => key !== undefined),
      ),
    ];
  }

  /**
   * Resolves distinct object keys to a deduplicated list of eligible original
   * IDs. Fails if any key is missing or resolves to an ineligible original.
   */
  async resolve(
    tx: Prisma.TransactionClient,
    keys: string[],
    ownerId: string,
    target: MediaTarget,
  ) {
    return [
      ...new Set((await this.resolveByKey(tx, keys, ownerId, target)).values()),
    ];
  }

  /**
   * Maps each storage key to its eligible original ID. A variant key resolves
   * to its parent original, whose ownership and target determine eligibility.
   *
   * @param tx - Prisma client used for the lookup.
   * @param keys - Distinct object keys extracted from managed URLs.
   * @param ownerId - Required owner of each original.
   * @param target - Required media target of each original.
   * @param options - Set `allowMissing` to omit missing keys when opening a repair draft.
   * @returns A map from object keys to original IDs.
   * @throws {BadRequestException} If an original is ineligible or a required key is missing.
   */
  async resolveByKey(
    tx: Prisma.TransactionClient,
    keys: string[],
    ownerId: string,
    target: MediaTarget,
    { allowMissing = false } = {},
  ) {
    const ids = new Map<string, string>();
    if (!keys.length) return ids;
    const members = await tx.media.findMany({
      where: { key: { in: keys }, deletedAt: null },
      select: {
        key: true,
        id: true,
        deletedAt: true,
        parentId: true,
        variant: true,
        ownerId: true,
        target: true,
        parent: {
          select: {
            id: true,
            deletedAt: true,
            parentId: true,
            variant: true,
            ownerId: true,
            target: true,
          },
        },
      },
    });
    if (!allowMissing && members.length !== keys.length) {
      throw new BadRequestException(
        'Managed image is unavailable for this use',
      );
    }
    for (const member of members) {
      const original = member.parent ?? member;
      if (
        original.deletedAt != null ||
        original.parentId !== null ||
        original.variant !== MediaVariant.ORIGINAL ||
        original.ownerId !== ownerId.toLowerCase() ||
        original.target !== target
      ) {
        throw new BadRequestException(
          'Managed image is unavailable for this use',
        );
      }
      ids.set(member.key, original.id);
    }
    return ids;
  }

  /**
   * Resolves keys, locks the originals, and repeats validation under the locks.
   * Use the same transaction for attachment checks and writes.
   *
   * @returns Distinct original IDs validated under lock.
   * @throws {BadRequestException} If a key becomes unavailable, ineligible, or resolves to an unlocked original.
   */
  async lockAndResolve(
    tx: Prisma.TransactionClient,
    keys: string[],
    ownerId: string,
    target: MediaTarget,
  ) {
    const ids = await this.resolve(tx, keys, ownerId, target);
    await lockOriginalMedia(tx, ids);
    const current = await this.resolve(tx, keys, ownerId, target);
    if (current.some((id) => !ids.includes(id))) {
      throw new BadRequestException(
        'Managed image changed. Retry the request.',
      );
    }
    return current;
  }
}

/**
 * Locks matching original rows in ID order until the transaction ends.
 * Callers verify eligibility and confirm that all requested IDs exist.
 *
 * @param tx - Transaction that holds the row locks.
 * @param ids - Original media UUIDs to lock.
 */
export async function lockOriginalMedia(
  tx: Prisma.TransactionClient,
  ids: string[],
) {
  if (!ids.length) return;
  await tx.$queryRaw`
    SELECT "id" FROM "Media" WHERE "id" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
      AND "parentId" IS NULL AND "media_variant" = 'ORIGINAL'
    ORDER BY "id" FOR UPDATE
  `;
}
