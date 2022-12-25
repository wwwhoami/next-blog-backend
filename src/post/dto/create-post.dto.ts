export class CreatePostDto {
  createdAt: Date;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  published: boolean;
  coverImage: string;
}
