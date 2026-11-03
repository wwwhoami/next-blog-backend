import { GetUser } from '@core/src/auth/decorators/get-user.decorator';
import { IntId } from '@core/src/common/decorators/id-type.decorator';
import { AccessTokenGuard } from '@core/src/common/guards/access-token.guard';
import { IsAdminGuard } from '@core/src/common/guards/is-admin.guard';
import { IsAuthorGuard } from '@core/src/common/guards/is-author.guard';
import { UserNameImage } from '@core/src/user/entities/user.entity';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DraftService } from '../draft/draft.service';
import { CreatePostDto } from './dto/create-post.dto';
import { GetPostPublicDto } from './dto/get-post.dto';
import { UpdatePublicationDto } from './dto/update-publication.dto';
import {
  PostEntity,
  PostEntityRanked,
  PostLike,
  Slug,
} from './entities/post.entity';
import { PostService } from './post.service';

@Controller('post')
@ApiTags('post')
export class PostController {
  constructor(
    private readonly postService: PostService,
    private readonly draftService: DraftService,
  ) {}

  // Can get only published posts from this endpoint
  @Get()
  posts(@Query() getPostsQuery: GetPostPublicDto): Promise<PostEntityRanked[]> {
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
  @UseGuards(AccessTokenGuard, IsAuthorGuard)
  @IntId()
  @Post(':id/draft')
  createRevision(
    @Param('id', ParseIntPipe) id: number,
    @GetUser('id') ownerId: string,
  ) {
    return this.draftService.createRevision(id, ownerId);
  }

  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard, IsAdminGuard)
  @IntId()
  @Patch(':id/publication')
  updatePublication(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePublicationDto,
  ): Promise<PostEntity | undefined> {
    return this.postService.updatePublication(id, dto.published);
  }

  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard, IsAdminGuard)
  @Post()
  /**
   * Creates a complete post for trusted administrative, import, and migration
   * workflows. The editor workflow must use drafts and publish them instead.
   *
   * @param {string} userId - Authenticated administrator's user id
   * @param {CreatePostDto} post - Complete post data
   * @returns {Promise<PostEntity>} The created post
   */
  create(
    @GetUser('id') userId: string,
    @Body() post: CreatePostDto,
  ): Promise<PostEntity> {
    return this.postService.create(post, userId);
  }

  @Get(':id/likes')
  getLikes(@Param('id', ParseIntPipe) id: number): Promise<UserNameImage[]> {
    return this.postService.getLikes(id);
  }

  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard)
  @Post(':id/likes')
  like(
    @Param('id', ParseIntPipe) id: number,
    @GetUser('id') userId: string,
  ): Promise<PostLike> {
    return this.postService.like(id, userId);
  }

  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard)
  @Delete(':id/likes')
  unlike(
    @Param('id', ParseIntPipe) id: number,
    @GetUser('id') userId: string,
  ): Promise<PostLike> {
    return this.postService.unlike(id, userId);
  }

  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard, IsAdminGuard)
  @Delete(':id')
  delete(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PostEntity | undefined> {
    return this.postService.delete(id);
  }
}
