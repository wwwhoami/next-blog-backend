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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { AccessTokenGuard } from 'src/common/guards/access-token.guard';
import { IsAdminOrAuthorGuard } from 'src/common/guards/is-admin-or-author.guard';
import { UserNameImageEntity } from 'src/user/entities/user.entity';
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

  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard, IsAdminOrAuthorGuard)
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() post: UpdatePostDto,
  ): Promise<PostEntity | undefined> {
    return this.postService.update(id, post);
  }

  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard)
  @Post()
  create(
    @GetUser('id') userId: string,
    @Body() post: CreatePostDto,
  ): Promise<PostEntity> {
    return this.postService.create(post, userId);
  }

  @Get(':id/likes')
  getLikes(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ user: UserNameImageEntity }[]> {
    return this.postService.getLikes(id);
  }

  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard)
  @Post(':id/likes')
  like(
    @Param('id', ParseIntPipe) id: number,
    @GetUser('id') userId: string,
  ): Promise<{ id: number; likesCount: number }> {
    return this.postService.like(id, userId);
  }

  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard)
  @Delete(':id/likes')
  unlike(
    @Param('id', ParseIntPipe) id: number,
    @GetUser('id') userId: string,
  ): Promise<{ id: number; likesCount: number }> {
    return this.postService.unlike(id, userId);
  }

  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard, IsAdminOrAuthorGuard)
  @Delete(':id')
  delete(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PostEntity | undefined> {
    return this.postService.delete(id);
  }
}
