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
import { Observable, filter, from, fromEvent, map, merge, take } from 'rxjs';
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
      filter((result) => result.status === 'completed'),
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
    );

    return merge(immediateCheck$, liveEvents$).pipe(
      take(1), // Close connection after first result
    );
  }

  @Get(':id')
  async getMedia(@Param('id', ParseUUIDPipe) id: string) {
    return await this.mediaService.getMediaWithVariants(id);
  }

  @Delete(':id')
  @UuidId()
  @UseGuards(AccessTokenGuard, IsAdminOrAuthorGuard)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.mediaService.removeReference(id);
  }
}
