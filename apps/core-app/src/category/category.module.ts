import { PrismaModule } from '@app/prisma';
import { PostModule } from '@core/src/post/post.module';
import { Module } from '@nestjs/common';
import { CategoryController } from './category.controller';
import { CategoryRepository } from './category.repository';
import { CategoryService } from './category.service';

@Module({
  controllers: [CategoryController],
  providers: [CategoryService, CategoryRepository],
  imports: [PrismaModule, PostModule],
})
export class CategoryModule {}
