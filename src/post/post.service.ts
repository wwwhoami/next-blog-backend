import { Injectable } from '@nestjs/common';
import { EntityWithAuthorService } from 'src/common/entity-with-author.service';
import { UserNameImageEntity } from 'src/user/entities/user.entity';
import { CreatePostDto } from './dto/create-post.dto';
import { GetPostDto } from './dto/get-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostEntity } from './entities/post.entity';
import { PostRepository } from './post.repository';

@Injectable()
export class PostService implements EntityWithAuthorService {
  constructor(private postRepository: PostRepository) {}

  getAuthorId(idOrSlug: number | string): Promise<{ authorId: string }> {
    if (typeof idOrSlug === 'number')
      return this.postRepository.getAuthorById(idOrSlug);

    return this.postRepository.getAuthorBySlug(idOrSlug as string);
  }

  getIds(params: GetPostDto = {}): Promise<{ id: number }[]> {
    if (typeof params.searchTerm === 'string')
      return this.postRepository.findIds({
        ...params,
        searchTerm: params.searchTerm,
      });

    return this.postRepository.getIds(params);
  }

  getMany(params: GetPostDto = {}): Promise<PostEntity[]> {
    // if (typeof params.searchTerm === 'string') {
    //   if (typeof params.category === 'string')
    //     return this.postRepository.findManyByCategories({
    //       ...params,
    //       searchTerm: params.searchTerm,
    //       category: params.category,
    //     });

    //   return this.postRepository.findMany({
    //     ...params,
    //     searchTerm: params.searchTerm,
    //   });
    // }

    // if (typeof params.category === 'string')
    //   return this.postRepository.getManyByCategories({
    //     ...params,
    //     category: params.category,
    //   });

    return this.postRepository.getMany(params);
  }

  getSlugsForPublished(): Promise<{ slug: string }[]> {
    return this.postRepository.getSlugsForPublished();
  }

  getOnePublishedBySlug(slug: string): Promise<PostEntity> {
    return this.postRepository.getOnePublishedBySlug(slug);
  }

  getLikes(id: number): Promise<{ user: UserNameImageEntity }[]> {
    return this.postRepository.getLikes(id);
  }

  publishOneBySlug(slug: string): Promise<PostEntity> {
    return this.postRepository.publishOneBySlug(slug);
  }

  create(post: CreatePostDto, authorId: string): Promise<PostEntity> {
    return this.postRepository.create(post, authorId);
  }

  update(id: number, post: UpdatePostDto): Promise<PostEntity> {
    return this.postRepository.update(id, post);
  }

  like(
    id: number,
    userId: string,
  ): Promise<{ id: number; likesCount: number }> {
    return this.postRepository.like(id, userId);
  }

  unlike(
    id: number,
    userId: string,
  ): Promise<{ id: number; likesCount: number }> {
    return this.postRepository.unlike(id, userId);
  }

  delete(idOrSlug: number | string): Promise<PostEntity | undefined> {
    if (typeof idOrSlug === 'number')
      return this.postRepository.deleteById(idOrSlug);

    return this.postRepository.deleteBySlug(idOrSlug as string);
  }
}
