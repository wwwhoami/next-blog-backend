import { Prisma } from '@prisma/client';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import slugify from 'slugify';
import { Frontmatter } from './frontmatter.type';
import { getMockSlugs, getPostMockFromSlugForDb } from './mdx';

type PostFromFile = Frontmatter & {
  content: string;
  slug: string;
};

dayjs.extend(utc);

export async function getMockPostData() {
  const slugs = await getMockSlugs();

  const posts: PostFromFile[] = [];
  for (const slug of slugs) {
    const { frontmatter, content } = await getPostMockFromSlugForDb(slug);
    posts.push({ ...frontmatter, slug, content });
  }

  const postData: Prisma.PostUncheckedCreateInput[] = posts.map(
    (post, index) => ({
      id: index + 1,
      createdAt: dayjs.utc(post.date, 'YYYY-MM-DD').format(),
      title: post.title,
      slug: slugify(post.title, { lower: true }),
      excerpt: post.excerpt,
      content: post.content,
      published: true,
      coverImage: post.cover_image,
      authorId: 'ab182222-5603-4b01-909b-a68fbb3a2153',
      categories: {
        create: {
          category: {
            connect: {
              name: post.category,
            },
          },
        },
      },
    }),
  );

  return postData;
}
