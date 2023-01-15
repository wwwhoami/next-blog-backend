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

@Controller('comment')
@ApiTags('comment')
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @UseGuards(AccessTokenGuard)
  @Post()
  create(
    @GetUser('id') userId: string,
    @Body() createCommentDto: CreateCommentDto,
  ) {
    return this.commentService.create(createCommentDto, userId);
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.commentService.getOne(id);
  }

  @Get(':id/replies')
  getReplies(
    @Param('id', ParseIntPipe) id: number,
    @Query() getCommentQuery: GetCommentDto,
  ) {
    return this.commentService.getDescendantsWithChildrenCount(
      id,
      getCommentQuery,
    );
  }

  @Get('article/:articleId')
  getForPost(
    @Param('articleId', ParseIntPipe) postId: number,
    @Query() getCommentQuery: GetCommentDto,
  ) {
    return this.commentService.getManyForPostWithChildrenCount(
      postId,
      getCommentQuery,
    );
  }

  @UseGuards(IsAuthorGuard)
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() comment: UpdateCommentDto,
  ) {
    return this.commentService.update(id, comment);
  }

  @UseGuards(IsAdminOrAuthorGuard)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.commentService.softRemove(id);
  }
}
