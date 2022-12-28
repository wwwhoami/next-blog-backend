import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { UnauthorizedError } from 'src/common/errors/unauthorized.error';
import { AccessTokenGuard } from 'src/common/guards/access-token.guard';
import { CreatePostDto } from './dto/create-post.dto';
import { GetPostDto } from './dto/get-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostEntity, Slug } from './entities/post.entity';
import { PostService } from './post.service';

@Controller('post')
@ApiTags('post')
export class PostController {
  constructor(private readonly postService: PostService) {}

  @Get()
  getPosts(@Query() getPostsQuery: GetPostDto): Promise<PostEntity[]> {
    return this.postService.getPosts(getPostsQuery);
  }

  @Get('article/:slug')
  async getPublishedPostBySlug(
    @Param('slug') slug: string,
  ): Promise<PostEntity> {
    const post = await this.postService.getPublishedPostBySlug(slug);

    if (!post) throw new NotFoundException(`Post with slug ${slug} not found`);

    return post;
  }

  @Get('slug')
  getPublishedPostsSlugs(): Promise<Slug[]> {
    return this.postService.getPublishedPostsSlugs();
  }

  @UseGuards(AccessTokenGuard)
  @Put()
  async updatePost(
    @GetUser('id') userId: string,
    @Body() post: UpdatePostDto,
  ): Promise<PostEntity | undefined> {
    try {
      return await this.postService.updatePost(post, userId);
    } catch (error) {
      if (error instanceof UnauthorizedError)
        throw new UnauthorizedException(error.message);
      if (
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2025') ||
        error.name === 'NotFoundError'
      )
        throw new NotFoundException(`Post with id ${post.post.id} not found`);
    }
  }

  @UseGuards(AccessTokenGuard)
  @Post()
  async createPost(
    @GetUser('id') userId: string,
    @Body() post: CreatePostDto,
  ): Promise<PostEntity> {
    return this.postService.createPost(post, userId);
  }
}
