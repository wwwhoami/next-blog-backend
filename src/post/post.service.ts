import { Injectable } from '@nestjs/common';
import { WrongParamsError } from 'src/common/errors/wrong-params.error';
import { CreatePostDto } from './dto/create-post.dto';
import { DeletePostDto } from './dto/delete-post.dto';
import { GetPostDto } from './dto/get-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostEntity } from './entities/post.entity';
import { PostRepository } from './post.repository';

@Injectable()
export class PostService {
  constructor(private postRepository: PostRepository) {}

  async getPostAuthorId({
    id,
    slug,
  }: DeletePostDto): Promise<{ authorId: string }> {
    if (id) return this.postRepository.getPostAuthorById(id);
    else if (slug) return this.postRepository.getPostAuthorBySlug(slug);

    throw new WrongParamsError('Neither of { id, slug } parameters provided');
  }

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

  async getPublishedPostBySlug(slug: string): Promise<PostEntity> {
    return this.postRepository.getPublishedPostBySlug(slug);
  }

  async publishPostBySlug(slug: string): Promise<PostEntity> {
    return this.postRepository.publishPostBySlug(slug);
  }

  async createPost(post: CreatePostDto, authorId: string): Promise<PostEntity> {
    return this.postRepository.createPost(post, authorId);
  }

  async updatePost(post: UpdatePostDto): Promise<PostEntity> {
    return this.postRepository.updatePost(post);
  }

  /**
   *
   * @param {Object} param0 - Params to delete the post by, one of should be defined, finding by name being prioritized.
   * @param {string} param0.id - Post's id.
   * @param {string} param0.slug - Post's slug.
   * @returns Post Entity or undefined inside promise
   */
  async deletePost({
    id,
    slug,
  }: DeletePostDto): Promise<PostEntity | undefined> {
    if (id) return this.postRepository.deletePostById(id);
    else if (slug) return this.postRepository.deletePostBySlug(slug);

    throw new WrongParamsError('Neither of { id, slug } parameters provided');
  }
}
