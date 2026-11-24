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
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { DraftService } from '../draft/draft.service';
import { DraftPublicationResponseDto } from '../draft/dto/draft-publication-response.dto';
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
  @ApiOkResponse({
    description: 'Published posts returned.',
    type: [PostEntityRanked],
  })
  @ApiBadRequestResponse({
    description: 'Invalid post filters or pagination parameters.',
  })
  @ApiOperation({ summary: 'List published posts' })
  posts(@Query() getPostsQuery: GetPostPublicDto): Promise<PostEntityRanked[]> {
    return this.postService.getMany({ ...getPostsQuery, published: true });
  }

  @Get('article/:slug')
  @ApiOkResponse({ description: 'Published post returned.', type: PostEntity })
  @ApiNotFoundResponse({ description: 'No published post matches the slug.' })
  @ApiOperation({ summary: 'Get a published post by slug' })
  getOnePublishedBySlug(@Param('slug') slug: string): Promise<PostEntity> {
    return this.postService.getOnePublishedBySlug(slug);
  }

  @Get('slug')
  @ApiOkResponse({
    description: 'Published post slugs returned.',
    type: [Slug],
  })
  @ApiOperation({ summary: 'List published post slugs' })
  getSlugsForPublished(): Promise<Slug[]> {
    return this.postService.getSlugsForPublished();
  }

  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard, IsAuthorGuard)
  @IntId()
  @Post(':id/draft')
  @ApiCreatedResponse({
    description: 'Revision draft created or existing revision returned.',
    type: DraftPublicationResponseDto,
  })
  @ApiBadRequestResponse({ description: 'The post ID must be an integer.' })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing, invalid, or expired.',
  })
  @ApiForbiddenResponse({
    description: 'Only the post author can open a revision.',
  })
  @ApiNotFoundResponse({ description: 'The post does not exist.' })
  @ApiConflictResponse({
    description: 'The existing revision is already publishing.',
  })
  @ApiOperation({
    summary: 'Open a revision draft for a post',
    description:
      'Only the post author can open a revision. Returns the existing revision when available. If it is already publishing, the response is 409 with the draft ID and status.',
  })
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
  @ApiOkResponse({
    description: 'Publication status updated and post returned.',
    type: PostEntity,
  })
  @ApiBadRequestResponse({
    description: 'Invalid post ID or publication flag.',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing, invalid, or expired.',
  })
  @ApiForbiddenResponse({ description: 'Administrator access is required.' })
  @ApiNotFoundResponse({ description: 'The post does not exist.' })
  @ApiPayloadTooLargeResponse({
    description: 'JSON body exceeds 100 KiB.',
  })
  @ApiOperation({
    summary: 'Change a post’s publication status',
    description:
      'Requires administrator access. Use the `published` flag to publish or unpublish an existing post.',
  })
  updatePublication(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePublicationDto,
  ): Promise<PostEntity | undefined> {
    return this.postService.updatePublication(id, dto.published);
  }

  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard, IsAdminGuard)
  @Post()
  @ApiCreatedResponse({ description: 'Post created.', type: PostEntity })
  @ApiBadRequestResponse({
    description: 'Invalid post fields, content, or media.',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing, invalid, or expired.',
  })
  @ApiForbiddenResponse({ description: 'Administrator access is required.' })
  @ApiConflictResponse({
    description:
      'The title or slug is already in use, or a category is listed more than once.',
  })
  @ApiPayloadTooLargeResponse({
    description: 'JSON body exceeds 100 KiB.',
  })
  @ApiOperation({
    summary: 'Create a complete post directly',
    description:
      'Requires administrator access. Use this route for imports, migrations, and other administrative work. The editor workflow creates and publishes drafts.',
  })
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
  @ApiOkResponse({
    description: 'Users who liked the post returned.',
    type: [UserNameImage],
  })
  @ApiBadRequestResponse({ description: 'The post ID must be an integer.' })
  @ApiNotFoundResponse({ description: 'The post does not exist.' })
  @ApiOperation({ summary: 'List users who liked a post' })
  getLikes(@Param('id', ParseIntPipe) id: number): Promise<UserNameImage[]> {
    return this.postService.getLikes(id);
  }

  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard)
  @Post(':id/likes')
  @ApiCreatedResponse({
    description: 'Like added and updated count returned.',
    type: PostLike,
  })
  @ApiBadRequestResponse({ description: 'The post ID must be an integer.' })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing, invalid, or expired.',
  })
  @ApiConflictResponse({ description: 'You already liked this post.' })
  @ApiUnprocessableEntityResponse({ description: 'The post does not exist.' })
  @ApiOperation({ summary: 'Like a post' })
  like(
    @Param('id', ParseIntPipe) id: number,
    @GetUser('id') userId: string,
  ): Promise<PostLike> {
    return this.postService.like(id, userId);
  }

  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard)
  @Delete(':id/likes')
  @ApiOkResponse({
    description: 'Like removed and updated count returned.',
    type: PostLike,
  })
  @ApiBadRequestResponse({ description: 'The post ID must be an integer.' })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing, invalid, or expired.',
  })
  @ApiNotFoundResponse({
    description: 'The post is missing or you have no like to remove.',
  })
  @ApiOperation({ summary: 'Remove your like from a post' })
  unlike(
    @Param('id', ParseIntPipe) id: number,
    @GetUser('id') userId: string,
  ): Promise<PostLike> {
    return this.postService.unlike(id, userId);
  }

  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard, IsAdminGuard)
  @Delete(':id')
  @ApiOkResponse({ description: 'Deleted post returned.', type: PostEntity })
  @ApiBadRequestResponse({ description: 'The post ID must be an integer.' })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing, invalid, or expired.',
  })
  @ApiForbiddenResponse({ description: 'Administrator access is required.' })
  @ApiNotFoundResponse({ description: 'The post does not exist.' })
  @ApiConflictResponse({ description: 'A revision of the post is publishing.' })
  @ApiOperation({
    summary: 'Delete a post',
    description: 'Requires administrator access.',
  })
  delete(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<PostEntity | undefined> {
    return this.postService.delete(id);
  }
}
