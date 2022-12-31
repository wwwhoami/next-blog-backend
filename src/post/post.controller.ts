import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { AccessTokenGuard } from 'src/common/guards/access-token.guard';
import { CreatePostDto } from './dto/create-post.dto';
import { DeletePostDto } from './dto/delete-post.dto';
import { GetPostDto } from './dto/get-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostEntity, Slug } from './entities/post.entity';
import { IsAuthorGuard } from './guards/is-author.guard';
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
    return this.postService.getPublishedPostBySlug(slug);
  }

  @Get('slug')
  getPublishedPostsSlugs(): Promise<Slug[]> {
    return this.postService.getPublishedPostsSlugs();
  }

  @UseGuards(AccessTokenGuard, IsAuthorGuard)
  @Put()
  async updatePost(
    @Body() post: UpdatePostDto,
  ): Promise<PostEntity | undefined> {
    return await this.postService.updatePost(post);
  }

  @UseGuards(AccessTokenGuard)
  @Post()
  async createPost(
    @GetUser('id') userId: string,
    @Body() post: CreatePostDto,
  ): Promise<PostEntity> {
    return this.postService.createPost(post, userId);
  }

  @UseGuards(AccessTokenGuard, IsAuthorGuard)
  @Delete()
  async deletePost(
    @Body() post: DeletePostDto,
  ): Promise<PostEntity | undefined> {
    return this.postService.deletePost(post);
  }
}
