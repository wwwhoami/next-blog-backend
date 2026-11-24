import { Prisma } from 'prisma/generated/client';

export function postConflictMessage(
  error: Prisma.PrismaClientKnownRequestError,
) {
  const adapter = error.meta?.driverAdapterError as
    | { cause?: { constraint?: { fields?: string[] } } }
    | undefined;
  const target = adapter?.cause?.constraint?.fields ?? error.meta?.target;
  const fields = String(target ?? '').toLowerCase();
  if (fields.includes('category'))
    return 'This category is already attached to the post';
  if (fields.includes('slug'))
    return 'A post with this URL slug already exists';
  if (fields.includes('title')) return 'A post with this title already exists';
  return 'Publication conflicts with an existing record';
}
