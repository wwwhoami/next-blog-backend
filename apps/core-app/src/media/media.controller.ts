import {
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  HttpStatus,
  MaxFileSizeValidator,
  Param,
  ParseBoolPipe,
  ParseFilePipe,
  ParseUUIDPipe,
  Post,
  Query,
  Sse,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { MediaTarget, MediaType } from 'prisma/generated/enums';
import {
  Observable,
  filter,
  from,
  fromEvent,
  map,
  merge,
  take,
  timeout,
} from 'rxjs';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { ApiAccessTokenAuth } from '../common/decorators/api-access-token-auth.decorator';
import { UuidId } from '../common/decorators/id-type.decorator';
import { AccessTokenGuard } from '../common/guards/access-token.guard';
import { IsAdminOrAuthorGuard } from '../common/guards/is-admin-or-author.guard';
import { MAX_FILE_SIZE_BYTES } from './constants/media-processor.constants';
import { MediaDeletionConflictDto } from './dto/media-deletion-conflict.dto';
import { MediaReferencesDto } from './dto/media-references.dto';
import { UploadMediaDto } from './dto/upload-media.dto';
import {
  ListedMediaEntity,
  MediaDetailEntity,
  MediaEntity,
} from './entities/media.entity';
import {
  MediaEventsService,
  MediaVariantsStatusMsg,
} from './media-events.service';
import { MediaService } from './media.service';

@Controller('media')
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly events: MediaEventsService,
  ) {}

  @Post()
  @ApiCreatedResponse({
    description: 'Upload accepted and media record returned.',
    type: MediaEntity,
  })
  @ApiBadRequestResponse({
    description: 'Invalid multipart fields or upload metadata.',
  })
  @ApiNotFoundResponse({
    description:
      'The supplied draft does not exist, is inactive, or belongs to another user.',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'The image is missing or fails validation, or the draft-bound upload does not target a post.',
  })
  @ApiServiceUnavailableResponse({
    description:
      'The upload reservation or lock is temporarily unavailable. Retry the request.',
  })
  @ApiOperation({
    summary: 'Upload an image',
    description:
      'Send a multipart upload. Use the returned media ID to subscribe to `GET /media/{id}/stream` for the processing result.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'type', 'target'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Image file (jpeg, png, webp, or gif)',
        },
        type: {
          type: 'string',
          enum: [MediaType.IMAGE],
          description: "Uploaded media's type",
        },
        target: {
          type: 'string',
          enum: [
            MediaTarget.POST,
            MediaTarget.COMMENT,
            MediaTarget.USER_AVATAR,
          ],
          description: "Uploaded media's target",
        },
        draftId: {
          type: 'string',
          format: 'uuid',
          description: 'ID of an active draft you own. Requires target POST.',
        },
      },
    },
  })
  @ApiAccessTokenAuth()
  @UseGuards(AccessTokenGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({
            maxSize: MAX_FILE_SIZE_BYTES,
          }),
          new FileTypeValidator({
            fileType: /image\/(jpeg|png|webp|gif)/,
            skipMagicNumbersValidation: true,
          }),
        ],
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      }),
    )
    file: Express.Multer.File,
    @GetUser('id') userId: string,
    @Body() mediaMeta: UploadMediaDto,
  ) {
    return this.mediaService.upload(file, userId, mediaMeta);
  }

  @Sse(':id/stream')
  @ApiOperation({
    summary: 'Watch media processing status',
    description:
      'This public stream closes after the first `upload-status` event. The JSON event data reports `status` as `completed` or `failed`. A stored result can be sent immediately. An invalid UUID, lookup failure, or timeout produces an `error` event and closes the stream.',
  })
  @ApiProduces('text/event-stream')
  @ApiOkResponse({
    description: 'Server-sent event stream for the upload status.',
    schema: { type: 'string' },
  })
  stream(@Param('id', ParseUUIDPipe) id: string): Observable<MessageEvent> {
    // Check DB immediately for already-completed processing
    const immediateCheck$ = from(
      this.mediaService.getProcessingResult(id),
    ).pipe(
      filter(
        (result) => result.status === 'completed' || result.status === 'failed',
      ),
      map(
        (result) =>
          ({
            data: { status: result.status, ...result.payload },
            type: 'upload-status',
          }) as MessageEvent,
      ),
    );

    // Listen for live events
    const liveEvents$ = fromEvent(this.events, `upload.status.${id}`).pipe(
      map(
        (message: MediaVariantsStatusMsg) =>
          ({
            data: { status: message.status, ...message.payload },
            type: 'upload-status',
          }) as MessageEvent,
      ),
      timeout(1 * 60 * 1000), // 1 minute timeout
    );

    return merge(immediateCheck$, liveEvents$).pipe(
      take(1), // Close connection after first result
    );
  }

  @Get(':id/references')
  @ApiBadRequestResponse({ description: 'The media ID must be a UUID.' })
  @ApiNotFoundResponse({
    description: 'The media does not exist or belongs to another user.',
  })
  @ApiOperation({ summary: 'List references to your media' })
  @ApiOkResponse({
    description: 'References to the media returned.',
    type: MediaReferencesDto,
  })
  @ApiAccessTokenAuth()
  @UseGuards(AccessTokenGuard)
  references(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('id') ownerId: string,
  ): Promise<MediaReferencesDto> {
    return this.mediaService.findReferences(id, ownerId);
  }

  @Get(':id')
  @ApiOkResponse({
    description: 'Media and available variants returned.',
    type: MediaDetailEntity,
  })
  @ApiBadRequestResponse({ description: 'The media ID must be a UUID.' })
  @ApiNotFoundResponse({ description: 'The media does not exist.' })
  @ApiOperation({ summary: 'Get media and its generated variants' })
  async getMedia(@Param('id', ParseUUIDPipe) id: string) {
    return this.mediaService.getMediaWithVariants(id);
  }

  @Get()
  @ApiOkResponse({
    description: 'Owned media returned.',
    type: [ListedMediaEntity],
  })
  @ApiOperation({
    summary: 'List your media',
    description:
      'Omit `attached` to list all owned originals. Set `attached=true` to list originals referenced by a draft, post, comment, or active avatar. Any other supplied value, including `false`, lists unattached originals.',
  })
  @ApiQuery({ name: 'attached', required: false, type: Boolean })
  @ApiAccessTokenAuth()
  @UseGuards(AccessTokenGuard)
  list(
    @GetUser('id') ownerId: string,
    @Query('attached', new ParseBoolPipe({ optional: true }))
    attached?: boolean,
  ) {
    return this.mediaService.listOwnedMedia(ownerId, attached);
  }

  @Delete(':id')
  @ApiBadRequestResponse({ description: 'Invalid media ID or force flag.' })
  @ApiForbiddenResponse({
    description: 'Only the media owner or an administrator can delete it.',
  })
  @ApiNotFoundResponse({ description: 'The media does not exist.' })
  @ApiConflictResponse({
    description:
      '`MEDIA_IN_USE` indicates existing references. Only this code allows a retry with `force=true` after the user confirms that deletion may break saved images or covers and reset an active avatar. `MEDIA_DRAFT_PUBLISHING` blocks deletion while a draft is publishing. For `MEDIA_VARIANT`, delete the variant through its original.',
    type: MediaDeletionConflictDto,
  })
  @ApiOperation({
    summary: 'Delete media and its variants',
    description:
      'The media owner or an administrator can delete it. When a 409 response has `canForce` set to true, retry with `force=true` only after confirming the impact. A publishing draft blocks deletion.',
  })
  @ApiQuery({
    name: 'force',
    required: false,
    schema: { type: 'boolean', default: false },
  })
  @ApiServiceUnavailableResponse({
    description: 'Media references are changing. Retry the request.',
  })
  @ApiOkResponse({ description: 'Media deleted.', type: MediaEntity })
  @UuidId()
  @ApiAccessTokenAuth()
  @UseGuards(AccessTokenGuard, IsAdminOrAuthorGuard)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('force', new ParseBoolPipe({ optional: true })) force = false,
  ) {
    return this.mediaService.removeReference(id, force);
  }
}
