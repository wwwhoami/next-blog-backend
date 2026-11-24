import { GetUser } from '@core/src/auth/decorators/get-user.decorator';
import { AccessTokenGuard } from '@core/src/common/guards/access-token.guard';
import { IsAdminOrAuthorGuard } from '@core/src/common/guards/is-admin-or-author.guard';
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
import { CommentService } from './comment.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { GetCommentDto } from './dto/get-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import {
  CommentEntity,
  CommentEntityWithChildrenCount,
  CommentLike,
} from './entities/comment.entity';

@Controller('comment')
@ApiTags('comment')
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard)
  @Post()
  @ApiCreatedResponse({
    description: 'Comment or reply created.',
    type: CommentEntity,
  })
  @ApiBadRequestResponse({
    description: 'Invalid comment fields or media attachments.',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing, invalid, or expired.',
  })
  @ApiNotFoundResponse({ description: 'The parent comment does not exist.' })
  @ApiConflictResponse({
    description:
      'The parent comment was deleted or belongs to a different post.',
  })
  @ApiPayloadTooLargeResponse({
    description: 'JSON body exceeds 100 KiB.',
  })
  @ApiUnprocessableEntityResponse({
    description: 'The referenced post does not exist.',
  })
  @ApiOperation({ summary: 'Add a comment or reply' })
  create(
    @GetUser('id') userId: string,
    @Body() createCommentDto: CreateCommentDto,
  ): Promise<CommentEntity> {
    return this.commentService.create(createCommentDto, userId);
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Comment returned.', type: CommentEntity })
  @ApiBadRequestResponse({ description: 'The comment ID must be an integer.' })
  @ApiNotFoundResponse({ description: 'The comment does not exist.' })
  @ApiOperation({ summary: 'Get a comment by ID' })
  getOne(@Param('id', ParseIntPipe) id: number): Promise<CommentEntity> {
    return this.commentService.getOne(id);
  }

  @Get(':id/replies')
  @ApiOkResponse({
    description: 'Replies returned.',
    type: [CommentEntityWithChildrenCount],
  })
  @ApiBadRequestResponse({
    description: 'Invalid comment ID, depth, or sorting parameters.',
  })
  @ApiNotFoundResponse({ description: 'The parent comment does not exist.' })
  @ApiOperation({
    summary: 'List replies to a comment',
    description:
      'Returns descendants up to the requested depth, which defaults to 5. Items at the depth limit include a count of their descendants.',
  })
  getReplies(
    @Param('id', ParseIntPipe) id: number,
    @Query() getCommentQuery: GetCommentDto,
  ): Promise<CommentEntityWithChildrenCount[]> {
    return this.commentService.getDescendantsWithChildrenCount(
      id,
      getCommentQuery,
    );
  }

  @Get('article/:articleId')
  @ApiOkResponse({
    description: 'Post comments returned.',
    type: [CommentEntityWithChildrenCount],
  })
  @ApiBadRequestResponse({
    description: 'Invalid post ID, depth, or sorting parameters.',
  })
  @ApiNotFoundResponse({ description: 'The post does not exist.' })
  @ApiOperation({
    summary: 'List comments on a post',
    description:
      'Returns comments for `articleId` up to the requested depth, which defaults to 5. Items at the depth limit include a count of their descendants.',
  })
  getForPost(
    @Param('articleId', ParseIntPipe) postId: number,
    @Query() getCommentQuery: GetCommentDto,
  ): Promise<CommentEntityWithChildrenCount[]> {
    return this.commentService.getManyForPostWithChildrenCount(
      postId,
      getCommentQuery,
    );
  }

  @Get(':id/likes')
  @ApiOkResponse({
    description: 'Users who liked the comment returned.',
    type: [UserNameImage],
  })
  @ApiBadRequestResponse({ description: 'The comment ID must be an integer.' })
  @ApiNotFoundResponse({ description: 'The comment does not exist.' })
  @ApiOperation({ summary: 'List users who liked a comment' })
  getLikes(@Param('id', ParseIntPipe) id: number): Promise<UserNameImage[]> {
    return this.commentService.getLikes(id);
  }

  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard)
  @Post(':id/likes')
  @ApiCreatedResponse({
    description: 'Like added and updated count returned.',
    type: CommentLike,
  })
  @ApiBadRequestResponse({ description: 'The comment ID must be an integer.' })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing, invalid, or expired.',
  })
  @ApiConflictResponse({ description: 'You already liked this comment.' })
  @ApiUnprocessableEntityResponse({
    description: 'The comment does not exist or was deleted.',
  })
  @ApiOperation({ summary: 'Like a comment' })
  like(
    @Param('id', ParseIntPipe) id: number,
    @GetUser('id') userId: string,
  ): Promise<CommentLike> {
    return this.commentService.like(id, userId);
  }

  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard)
  @Delete(':id/likes')
  @ApiOkResponse({
    description: 'Like removed and updated count returned.',
    type: CommentLike,
  })
  @ApiBadRequestResponse({ description: 'The comment ID must be an integer.' })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing, invalid, or expired.',
  })
  @ApiNotFoundResponse({
    description: 'The comment is missing or you have no like to remove.',
  })
  @ApiOperation({ summary: 'Remove your like from a comment' })
  unlike(
    @Param('id', ParseIntPipe) id: number,
    @GetUser('id') userId: string,
  ): Promise<CommentLike> {
    return this.commentService.unlike(id, userId);
  }

  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard, IsAuthorGuard)
  @Patch(':id')
  @ApiOkResponse({
    description: 'Updated comment returned.',
    type: CommentEntity,
  })
  @ApiBadRequestResponse({
    description: 'Invalid comment ID, update fields, or media attachments.',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing, invalid, or expired.',
  })
  @ApiForbiddenResponse({
    description: 'Only the author can edit this comment.',
  })
  @ApiNotFoundResponse({
    description: 'The comment does not exist or is deleted.',
  })
  @ApiPayloadTooLargeResponse({
    description: 'JSON body exceeds 100 KiB.',
  })
  @ApiOperation({
    summary: 'Edit a comment',
    description: 'Only the comment author can edit it.',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() comment: UpdateCommentDto,
  ): Promise<CommentEntity> {
    return this.commentService.update(id, comment);
  }

  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard, IsAdminOrAuthorGuard)
  @Delete(':id')
  @ApiOkResponse({
    description: 'Soft-deleted comment returned.',
    type: CommentEntity,
  })
  @ApiBadRequestResponse({ description: 'The comment ID must be an integer.' })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing, invalid, or expired.',
  })
  @ApiForbiddenResponse({
    description: 'Only the author or an administrator can delete this comment.',
  })
  @ApiNotFoundResponse({ description: 'The comment does not exist.' })
  @ApiOperation({
    summary: 'Delete a comment',
    description:
      'The comment author or an administrator can delete it. The comment is soft-deleted, and its likes and media links are removed.',
  })
  remove(@Param('id', ParseIntPipe) id: number): Promise<CommentEntity> {
    return this.commentService.softRemove(id);
  }
}
