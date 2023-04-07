import { Module } from '@nestjs/common';
import { CategoryService } from './category.service';
import { CategoryController } from './category.controller';
import { PrismaModule } from '@core/src/prisma/prisma.module';
import { CategoryRepository } from './category.repository';
import { PostModule } from '@core/src/post/post.module';

@Module({
  controllers: [CategoryController],
  providers: [CategoryService, CategoryRepository],
  imports: [PrismaModule, PostModule],
})
export class CategoryModule {}
