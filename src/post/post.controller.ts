import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { AccessTokenGuard } from 'src/common/guards/access-token.guard';
import { CreatePostDto } from './dto/create-post.dto';
import { GetPostDto } from './dto/get-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostEntity, Slug } from './entities/post.entity';
import { IsAdminOrAuthorGuard } from './guards/is-admin-or-author.guard';
import { PostService } from './post.service';

@Controller('post')
@ApiTags('post')
export class PostController {
  constructor(private readonly postService: PostService) {}

  @Get()
  posts(@Query() getPostsQuery: GetPostDto): Promise<PostEntity[]> {
    return this.postService.getMany(getPostsQuery);
  }

  @Get('article/:slug')
  async getOnePublishedBySlug(
    @Param('slug') slug: string,
  ): Promise<PostEntity> {
    return this.postService.getOnePublishedBySlug(slug);
  }

  @Get('slug')
  getSlugsForPublished(): Promise<Slug[]> {
    return this.postService.getSlugsForPublished();
  }

  @UseGuards(AccessTokenGuard, IsAdminOrAuthorGuard)
  @Put(':postId')
  async update(
    @Param('postId', ParseIntPipe) postId: number,
    @Body() post: UpdatePostDto,
  ): Promise<PostEntity | undefined> {
    return await this.postService.update(postId, post);
  }

  @UseGuards(AccessTokenGuard)
  @Post()
  async create(
    @GetUser('id') userId: string,
    @Body() post: CreatePostDto,
  ): Promise<PostEntity> {
    return this.postService.create(post, userId);
  }

  @UseGuards(AccessTokenGuard, IsAdminOrAuthorGuard)
  @Delete(':postId')
  async delete(
    @Param('postId', ParseIntPipe) postId: number,
  ): Promise<PostEntity | undefined> {
    return this.postService.delete(postId);
  }
}
