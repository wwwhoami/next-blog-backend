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
import { IsAdminOrAuthorGuard } from 'src/common/guards/is-admin-or-author.guard';
import { CreatePostDto } from './dto/create-post.dto';
import { GetPostPublicDto } from './dto/get-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostEntity, Slug } from './entities/post.entity';
import { PostService } from './post.service';

@Controller('post')
@ApiTags('post')
export class PostController {
  constructor(private readonly postService: PostService) {}

  // Can get only published posts from this endpoint
  @Get()
  posts(@Query() getPostsQuery: GetPostPublicDto): Promise<PostEntity[]> {
    return this.postService.getMany({ ...getPostsQuery, published: true });
  }

  @Get('article/:slug')
  getOnePublishedBySlug(@Param('slug') slug: string): Promise<PostEntity> {
    return this.postService.getOnePublishedBySlug(slug);
  }

  @Get('slug')
  getSlugsForPublished(): Promise<Slug[]> {
    return this.postService.getSlugsForPublished();
  }

  @UseGuards(AccessTokenGuard, IsAdminOrAuthorGuard)
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() post: UpdatePostDto,
  ): Promise<PostEntity | undefined> {
    return this.postService.update(id, post);
  }

  @UseGuards(AccessTokenGuard)
  @Post()
  create(
    @GetUser('id') userId: string,
    @Body() post: CreatePostDto,
  ): Promise<PostEntity> {
    return this.postService.create(post, userId);
  }

  @UseGuards(AccessTokenGuard, IsAdminOrAuthorGuard)
  @Delete(':id')
  delete(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PostEntity | undefined> {
    return this.postService.delete(id);
  }
}
