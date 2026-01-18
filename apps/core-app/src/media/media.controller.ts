import {
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  HttpStatus,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  ParseUUIDPipe,
  Post,
  Sse,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiProperty,
  ApiResponse,
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
import { UuidId } from '../common/decorators/id-type.decorator';
import { AccessTokenGuard } from '../common/guards/access-token.guard';
import { IsAdminOrAuthorGuard } from '../common/guards/is-admin-or-author.guard';
import { MAX_FILE_SIZE_BYTES } from './constants/media-processor.constants';
import { UploadMediaDto } from './dto/upload-media.dto';
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
  @ApiOperation({ summary: 'Upload media file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
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
      },
    },
  })
  @ApiProperty({ type: UploadMediaDto })
  @ApiBearerAuth('accessToken')
  @ApiResponse({ status: 201, description: 'File uploaded successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 422, description: 'Invalid file type or size' })
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

  @Get(':id')
  async getMedia(@Param('id', ParseUUIDPipe) id: string) {
    return this.mediaService.getMediaWithVariants(id);
  }

  @Delete(':id')
  @UuidId()
  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard, IsAdminOrAuthorGuard)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.mediaService.removeReference(id);
  }
}
