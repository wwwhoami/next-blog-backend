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

  @UseGuards(AccessTokenGuard, IsAuthorGuard)
  @Put()
  async update(@Body() post: UpdatePostDto): Promise<PostEntity | undefined> {
    return await this.postService.update(post);
  }

  @UseGuards(AccessTokenGuard)
  @Post()
  async create(
    @GetUser('id') userId: string,
    @Body() post: CreatePostDto,
  ): Promise<PostEntity> {
    return this.postService.create(post, userId);
  }

  @UseGuards(AccessTokenGuard, IsAuthorGuard)
  @Delete()
  async delete(@Body() post: DeletePostDto): Promise<PostEntity | undefined> {
    return this.postService.delete(post);
  }
}
