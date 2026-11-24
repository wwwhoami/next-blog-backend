import { GetUser } from '@core/src/auth/decorators/get-user.decorator';
import { AccessTokenGuard } from '@core/src/common/guards/access-token.guard';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiAccessTokenAuth } from '../common/decorators/api-access-token-auth.decorator';
import { ApiJsonBodyLimit } from '../common/decorators/api-json-body-limit.decorator';
import { DraftService } from './draft.service';
import { CreateDraftDto } from './dto/create-draft.dto';
import { UpdateDraftDto } from './dto/update-draft.dto';
import { DraftEntity } from './entities/draft.entity';

@Controller('draft')
@ApiTags('draft')
@ApiAccessTokenAuth()
@UseGuards(AccessTokenGuard)
export class DraftController {
  constructor(private readonly service: DraftService) {}

  @Post()
  @ApiCreatedResponse({
    description: 'Draft created.',
    type: DraftEntity,
  })
  @ApiBadRequestResponse({ description: 'Invalid draft fields.' })
  @ApiJsonBodyLimit('16 MiB')
  @ApiOperation({
    summary: 'Create a post draft',
    description:
      'Start with an empty draft or provide initial content. The draft belongs to the signed-in user.',
  })
  create(
    @GetUser('id') ownerId: string,
    @Body() dto: CreateDraftDto,
  ): Promise<DraftEntity> {
    return this.service.create(ownerId, dto);
  }

  @Get()
  @ApiOkResponse({
    description: 'Active drafts returned.',
    type: [DraftEntity],
  })
  @ApiOperation({ summary: 'List your active drafts' })
  list(@GetUser('id') ownerId: string): Promise<DraftEntity[]> {
    return this.service.list(ownerId);
  }

  @Get(':id')
  @ApiOkResponse({
    description: 'Draft returned.',
    type: DraftEntity,
  })
  @ApiBadRequestResponse({ description: 'The draft ID must be a UUID.' })
  @ApiNotFoundResponse({
    description: 'The draft does not exist or belongs to another user.',
  })
  @ApiOperation({
    summary: 'Get one of your drafts',
    description:
      'After requesting publication, use this route to check `status` and `validationError`.',
  })
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('id') ownerId: string,
  ): Promise<DraftEntity> {
    return this.service.get(id, ownerId);
  }

  @Put(':id')
  @ApiOkResponse({
    description: 'Draft saved.',
    type: DraftEntity,
  })
  @ApiBadRequestResponse({
    description: 'Invalid draft ID, fields, media attachments, or cover.',
  })
  @ApiNotFoundResponse({
    description: 'The draft does not exist or belongs to another user.',
  })
  @ApiConflictResponse({ description: 'The draft is publishing or archived.' })
  @ApiJsonBodyLimit('16 MiB')
  @ApiOperation({
    summary: 'Save changes to an active draft',
    description:
      'Only the draft owner can save changes. The update also synchronizes media attachments and the cover.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('id') ownerId: string,
    @Body() dto: UpdateDraftDto,
  ): Promise<DraftEntity> {
    return this.service.update(id, ownerId, dto);
  }

  @Post(':id/publish')
  @ApiCreatedResponse({
    description: 'Publication queued and draft returned in PUBLISHING state.',
    type: DraftEntity,
  })
  @ApiBadRequestResponse({ description: 'The draft ID must be a UUID.' })
  @ApiNotFoundResponse({
    description: 'The draft does not exist or belongs to another user.',
  })
  @ApiConflictResponse({
    description: 'The draft is already publishing or is archived.',
  })
  @ApiOperation({
    summary: 'Queue a draft for publication',
    description:
      'Only the owner can publish an active draft. The response returns the draft in `PUBLISHING` state. Poll `GET /draft/{id}` for `ARCHIVED` on success or `ACTIVE` with a recorded error on failure.',
  })
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('id') ownerId: string,
  ): Promise<DraftEntity> {
    return this.service.publish(id, ownerId);
  }
}
