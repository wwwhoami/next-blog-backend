import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GetPostDto, SearchPostsByCategoriesDto } from './dto/get-post.dto';
import { PostEntity, Slug } from './entities/post.entity';
import { PostService } from './post.service';

@Controller('post')
@ApiTags('post')
export class PostController {
  constructor(private readonly postService: PostService) {}

  @Get()
  getPosts(@Query() getPostsQuery: GetPostDto): Promise<PostEntity[]> {
    return this.postService.getPosts(getPostsQuery);
  }

  @Get('article/:slug')
  getPublishedPostBySlug(@Param('slug') slug: string): Promise<PostEntity> {
    return this.postService.getPublishedPostBySlug(slug);
  }

  @Get('slug')
  getPublishedPostsSlugs(): Promise<Slug[]> {
    return this.postService.getPublishedPostsSlugs();
  }

  @Get('search')
  searchPost(
    @Query() searchPostQuery: SearchPostsByCategoriesDto,
  ): Promise<PostEntity[]> {
    if (!searchPostQuery.category)
      return this.postService.findPosts(searchPostQuery);

    return this.postService.findPostsByCategories(searchPostQuery);
  }
}
