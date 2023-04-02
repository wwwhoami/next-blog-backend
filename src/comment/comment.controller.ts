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
import { ApiTags } from '@nestjs/swagger';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { AccessTokenGuard } from 'src/common/guards/access-token.guard';
import { IsAdminOrAuthorGuard } from 'src/common/guards/is-admin-or-author.guard';
import { IsAuthorGuard } from 'src/common/guards/is-author.guard';
import { CommentService } from './comment.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { GetCommentDto } from './dto/get-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { UserNameImageEntity } from 'src/user/entities/user.entity';
import {
  CommentEntity,
  CommentEntityWithChildrenCount,
} from './entities/comment.entity';

@Controller('comment')
@ApiTags('comment')
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

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
  getLikes(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ user: UserNameImageEntity }[]> {
    return this.commentService.getLikes(id);
  }

  @UseGuards(AccessTokenGuard)
  @Post(':id/likes')
  like(
    @Param('id', ParseIntPipe) id: number,
    @GetUser('id') userId: string,
  ): Promise<{ id: number; likesCount: number }> {
    return this.commentService.like(id, userId);
  }

  @UseGuards(AccessTokenGuard)
  @Delete(':id/likes')
  unlike(
    @Param('id', ParseIntPipe) id: number,
    @GetUser('id') userId: string,
  ): Promise<{ id: number; likesCount: number }> {
    return this.commentService.unlike(id, userId);
  }

  @UseGuards(AccessTokenGuard, IsAuthorGuard)
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() comment: UpdateCommentDto,
  ): Promise<CommentEntity> {
    return this.commentService.update(id, comment);
  }

  @UseGuards(AccessTokenGuard, IsAdminOrAuthorGuard)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<CommentEntity> {
    return this.commentService.softRemove(id);
  }
}
