import { PartialType } from '@nestjs/mapped-types';
import { CreatePostData } from './create-post.dto';

export class UpdatePostDto extends PartialType(CreatePostData) {}
