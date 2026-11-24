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
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { DraftService } from './draft.service';
import { CreateDraftDto } from './dto/create-draft.dto';
import { DraftPublicationResponseDto } from './dto/draft-publication-response.dto';
import { UpdateDraftDto } from './dto/update-draft.dto';

// TODO: fix response types

@Controller('draft')
@ApiTags('draft')
@ApiBearerAuth('accessToken')
@UseGuards(AccessTokenGuard)
export class DraftController {
  constructor(private readonly service: DraftService) {}

  @Post()
  @ApiCreatedResponse({
    description: 'Draft created.',
    type: DraftPublicationResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid draft fields.' })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing, invalid, or expired.',
  })
  @ApiPayloadTooLargeResponse({ description: 'JSON body exceeds 16 MiB.' })
  @ApiOperation({
    summary: 'Create a post draft',
    description:
      'Start with an empty draft or provide initial content. The draft belongs to the signed-in user.',
  })
  create(@GetUser('id') ownerId: string, @Body() dto: CreateDraftDto) {
    return this.service.create(ownerId, dto);
  }

  @Get()
  @ApiOkResponse({
    description: 'Active drafts returned.',
    type: [DraftPublicationResponseDto],
  })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing, invalid, or expired.',
  })
  @ApiOperation({ summary: 'List your active drafts' })
  list(@GetUser('id') ownerId: string) {
    return this.service.list(ownerId);
  }

  @Get(':id')
  @ApiOkResponse({
    description: 'Draft returned.',
    type: DraftPublicationResponseDto,
  })
  @ApiBadRequestResponse({ description: 'The draft ID must be a UUID.' })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing, invalid, or expired.',
  })
  @ApiNotFoundResponse({
    description: 'The draft does not exist or belongs to another user.',
  })
  @ApiOperation({
    summary: 'Get one of your drafts',
    description:
      'After requesting publication, use this route to check `status` and `validationError`.',
  })
  get(@Param('id', ParseUUIDPipe) id: string, @GetUser('id') ownerId: string) {
    return this.service.get(id, ownerId);
  }

  @Put(':id')
  @ApiOkResponse({
    description: 'Draft saved.',
    type: DraftPublicationResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid draft ID, fields, media attachments, or cover.',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing, invalid, or expired.',
  })
  @ApiNotFoundResponse({
    description: 'The draft does not exist or belongs to another user.',
  })
  @ApiConflictResponse({ description: 'The draft is publishing or archived.' })
  @ApiPayloadTooLargeResponse({ description: 'JSON body exceeds 16 MiB.' })
  @ApiOperation({
    summary: 'Save changes to an active draft',
    description:
      'Only the draft owner can save changes. The update also synchronizes media attachments and the cover.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('id') ownerId: string,
    @Body() dto: UpdateDraftDto,
  ) {
    return this.service.update(id, ownerId, dto);
  }

  @Post(':id/publish')
  @ApiCreatedResponse({
    description: 'Publication queued and draft returned in PUBLISHING state.',
    type: DraftPublicationResponseDto,
  })
  @ApiBadRequestResponse({ description: 'The draft ID must be a UUID.' })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing, invalid, or expired.',
  })
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
  ) {
    return this.service.publish(id, ownerId);
  }
}
