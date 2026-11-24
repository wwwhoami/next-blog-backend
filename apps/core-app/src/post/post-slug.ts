import { randomUUID } from 'node:crypto';
import slugify from 'slugify';

export function postSlug(title: string) {
  const slug = slugify(title, { lower: true });
  return slug && slug !== '.' && slug !== '..' ? slug : randomUUID();
}
