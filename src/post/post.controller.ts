import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { AccessTokenGuard } from 'src/common/guards/access-token.guard';
import { CreatePostDto } from './dto/create-post.dto';
import { GetPostDto } from './dto/get-post.dto';
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
  @Post()
  async createPost(
    @GetUser('id') userId: string,
    @Body() post: CreatePostDto,
  ): Promise<PostEntity> {
    return this.postService.createPost(post, userId);
  }
}
