import { EntityWithAuthorService } from '@core/src/common/entity-with-author.service';
import { UserNameImageEntity } from '@core/src/user/entities/user.entity';
import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { NOTIFICATION_SERVICE } from '../kafka-client/kafka.constants';
import { CreatePostDto } from './dto/create-post.dto';
import { GetPostDto } from './dto/get-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostEntity, PostLike } from './entities/post.entity';
import { PostRepository } from './post.repository';

@Injectable()
export class PostService implements EntityWithAuthorService {
  constructor(
    private postRepository: PostRepository,
    @Inject(NOTIFICATION_SERVICE) private readonly client: ClientProxy,
  ) {}

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

  async like(id: number, userId: string): Promise<PostLike> {
    const liked = await this.postRepository.like(id, userId);

    const { authorId } = await this.postRepository.getAuthorById(id);

    this.client.emit('post_like', {
      actor: userId,
      target: authorId,
      data: liked,
    });

    return liked;
  }

  async unlike(id: number, userId: string): Promise<PostLike> {
    const unliked = await this.postRepository.unlike(id, userId);

    const { authorId } = await this.postRepository.getAuthorById(id);

    this.client.emit('post_unlike', {
      actor: userId,
      target: authorId,
      data: unliked,
    });

    return unliked;
  }

  delete(idOrSlug: number | string): Promise<PostEntity | undefined> {
    if (typeof idOrSlug === 'number')
      return this.postRepository.deleteById(idOrSlug);

    return this.postRepository.deleteBySlug(idOrSlug as string);
  }
}
