import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UnauthorizedError } from 'src/common/errors/unauthorized.error';
import { CreatePostDto } from './dto/create-post.dto';
import { GetPostDto } from './dto/get-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostEntity } from './entities/post.entity';
import { PostRepository } from './post.repository';

@Injectable()
export class PostService {
  constructor(private postRepository: PostRepository) {}

  async getPostIds(params: GetPostDto): Promise<{ id: number }[]> {
    if (typeof params.searchTerm === 'string')
      return this.postRepository.findPostIds({
        ...params,
        searchTerm: params.searchTerm,
      });

    return this.postRepository.getPostIds(params);
  }

  async getPosts(params: GetPostDto): Promise<PostEntity[]> {
    if (typeof params.searchTerm === 'string') {
      if (typeof params.category === 'string')
        return this.postRepository.findPostsByCategories({
          ...params,
          searchTerm: params.searchTerm,
          category: params.category,
        });

      return this.postRepository.findPosts({
        ...params,
        searchTerm: params.searchTerm,
      });
    }

    if (typeof params.category === 'string')
      return this.postRepository.getPostsByCategories({
        ...params,
        category: params.category,
      });

    return this.postRepository.getPosts(params);
  }

  async getPublishedPostsSlugs(): Promise<{ slug: string }[]> {
    return this.postRepository.getPublishedPostsSlugs();
  }

  async getPublishedPostBySlug(slug: string): Promise<PostEntity | null> {
    return this.postRepository.getPublishedPostBySlug(slug);
  }

  async publishPostBySlug(slug: string): Promise<PostEntity> {
    return this.postRepository.publishPostBySlug(slug);
  }

  async createPost(post: CreatePostDto, authorId: string): Promise<PostEntity> {
    return this.postRepository.createPost(post, authorId);
  }

  async updatePost(post: UpdatePostDto, userId: string): Promise<PostEntity> {
    const { authorId } = await this.postRepository.getPostAuthorById(
      post.post.id,
    );
    const isAuthor = userId === authorId;

    if (!isAuthor)
      throw new UnauthorizedError('User is not author of the post');

    return this.postRepository.updatePost(post);
  }

  async deletePostBySlug(slug: string): Promise<PostEntity> {
    try {
      return await this.postRepository.deletePostBySlug(slug);
    } catch (error) {
      if (
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2025') ||
        error.name === 'NotFoundError'
      )
        throw new NotFoundException(`Post with slug ${slug} not found`);

      throw new InternalServerErrorException();
    }
  }
}
