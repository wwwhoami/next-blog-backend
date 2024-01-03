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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
  create(
    @GetUser('id') userId: string,
    @Body() createCommentDto: CreateCommentDto,
  ): Promise<CommentEntity> {
    return this.commentService.create(createCommentDto, userId);
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number): Promise<CommentEntity> {
    return this.commentService.getOne(id);
  }

  @Get(':id/replies')
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
  getLikes(@Param('id', ParseIntPipe) id: number): Promise<UserNameImage[]> {
    return this.commentService.getLikes(id);
  }

  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard)
  @Post(':id/likes')
  like(
    @Param('id', ParseIntPipe) id: number,
    @GetUser('id') userId: string,
  ): Promise<CommentLike> {
    return this.commentService.like(id, userId);
  }

  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard)
  @Delete(':id/likes')
  unlike(
    @Param('id', ParseIntPipe) id: number,
    @GetUser('id') userId: string,
  ): Promise<CommentLike> {
    return this.commentService.unlike(id, userId);
  }

  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard, IsAuthorGuard)
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() comment: UpdateCommentDto,
  ): Promise<CommentEntity> {
    return this.commentService.update(id, comment);
  }

  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard, IsAdminOrAuthorGuard)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<CommentEntity> {
    return this.commentService.softRemove(id);
  }
}
