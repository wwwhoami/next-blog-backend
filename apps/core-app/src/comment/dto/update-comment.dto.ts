import { PartialType, PickType } from '@nestjs/swagger';
import { CreateCommentDto } from './create-comment.dto';

export class UpdateCommentDto extends PartialType(
  PickType(CreateCommentDto, ['content', 'mediaIds']),
  { skipNullProperties: false },
) {}
