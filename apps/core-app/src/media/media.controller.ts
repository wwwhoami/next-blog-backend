import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Sse,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Observable, filter, fromEvent, map } from 'rxjs';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { AccessTokenGuard } from '../common/guards/access-token.guard';
import { IsAdminOrAuthorGuard } from '../common/guards/is-admin-or-author.guard';
import { UploadMediaDto } from './dto/upload-media.dto';
import {
  MEDIA_VARIANTS_READY_EVENT,
  MediaEventsService,
  MediaVariantsReadyPayload,
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
    @UploadedFile() file: Express.Multer.File,
    @GetUser('id') userId: string,
    @Body() mediaMeta: UploadMediaDto,
  ) {
    return this.mediaService.upload(file, userId, mediaMeta);
  }

  // @Get()
  // @UseGuards(AccessTokenGuard, IsAdminOrAuthorGuard)
  // async list(@Query('userId') userId: string) {
  //   return this.mediaService.listByUser(userId);
  // }

  // @Get(':id/url')
  // async getPresignedUrl(@Param('id') id: string) {
  //   return { url: await this.mediaService.getPresignedUrl(id) };
  // }

  @Get(':id')
  async getMedia(@Param('id') id: string) {
    return await this.mediaService.getMediaWithVariants(id);
  }

  @Delete(':id')
  @UseGuards(AccessTokenGuard, IsAdminOrAuthorGuard)
  async remove(
    @Param('id') id: string,
    // @Query('userId') userId: string
  ) {
    return this.mediaService.removeReference(id);
  }

  @Sse(':id/stream')
  stream(@Param('id') id: string): Observable<MessageEvent> {
    // subscribe to local EventEmitter forwarded from Redis
    return fromEvent(this.events, MEDIA_VARIANTS_READY_EVENT).pipe(
      filter((payload: MediaVariantsReadyPayload) => payload.mediaId === id),
      map(
        (payload: MediaVariantsReadyPayload) =>
          ({ data: payload }) as MessageEvent,
      ),
    );
  }
}
