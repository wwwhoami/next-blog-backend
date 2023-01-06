import { Injectable } from '@nestjs/common';
import { CreatePostDto } from './dto/create-post.dto';
import { GetPostDto } from './dto/get-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostEntity } from './entities/post.entity';
import { PostRepository } from './post.repository';

@Injectable()
export class PostService {
  constructor(private postRepository: PostRepository) {}

  async getAuthorId(idOrSlug: number | string): Promise<{ authorId: string }> {
    if (typeof idOrSlug === 'number')
      return this.postRepository.getAuthorById(idOrSlug);

    return this.postRepository.getAuthorBySlug(idOrSlug as string);
  }

  async getIds(params: GetPostDto): Promise<{ id: number }[]> {
    if (typeof params.searchTerm === 'string')
      return this.postRepository.findIds({
        ...params,
        searchTerm: params.searchTerm,
      });

    return this.postRepository.getIds(params);
  }

  async getMany(params: GetPostDto): Promise<PostEntity[]> {
    if (typeof params.searchTerm === 'string') {
      if (typeof params.category === 'string')
        return this.postRepository.findManyByCategories({
          ...params,
          searchTerm: params.searchTerm,
          category: params.category,
        });

      return this.postRepository.findMany({
        ...params,
        searchTerm: params.searchTerm,
      });
    }

    if (typeof params.category === 'string')
      return this.postRepository.getManyByCategories({
        ...params,
        category: params.category,
      });

    return this.postRepository.getMany(params);
  }

  async getSlugsForPublished(): Promise<{ slug: string }[]> {
    return this.postRepository.getSlugsForPublished();
  }

  async getOnePublishedBySlug(slug: string): Promise<PostEntity> {
    return this.postRepository.getOnePublishedBySlug(slug);
  }

  async publishOneBySlug(slug: string): Promise<PostEntity> {
    return this.postRepository.publishOneBySlug(slug);
  }

  async create(post: CreatePostDto, authorId: string): Promise<PostEntity> {
    return this.postRepository.create(post, authorId);
  }

  async update(id: number, post: UpdatePostDto): Promise<PostEntity> {
    return this.postRepository.update(id, post);
  }

  /**
   *
   * @param {Object} param0 - Params to delete the post by, one of should be defined, finding by name being prioritized.
   * @param {string} param0.id - Post's id.
   * @param {string} param0.slug - Post's slug.
   * @returns Post Entity or undefined inside promise
   */
  async delete(idOrSlug: number | string): Promise<PostEntity | undefined> {
    if (typeof idOrSlug === 'number')
      return this.postRepository.deleteById(idOrSlug);

    return this.postRepository.deleteBySlug(idOrSlug as string);
  }
}
