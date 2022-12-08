import path from 'path';
import fs from 'fs';
import matter from 'gray-matter';
import { Frontmatter } from './frontmatter.type';

const postsPath = path.join('data/posts');

export async function getMockSlugs() {
  const files = fs.readdirSync(path.join(postsPath));

  return files.map((filename) => filename.replace(/\.mdx$/, ''));
}

export async function getPostMockFromSlugForDb(slug: string) {
  const postDir = path.join(postsPath, `${slug}.mdx`);
  const source = fs.readFileSync(postDir, 'utf-8');
  const { content, data } = matter(source);
  const frontmatter = data as Frontmatter;

  return {
    content,
    frontmatter,
  };
}

export async function getRandomPostMockContent(slugs: string[], count: number) {
  if (count <= 0) throw new Error('Count should be positive integer');
  const postDirs = slugs.map((slug) => path.join(postsPath, `${slug}.mdx`));
  const postContents: string[] = [];
  while (count > 0) {
    const randPostDir = postDirs[Math.floor(Math.random() * postDirs.length)];
    const source = fs.readFileSync(randPostDir, 'utf-8');
    const { content } = matter(source);
    postContents.push(content);
    count--;
  }

  return postContents;
}
