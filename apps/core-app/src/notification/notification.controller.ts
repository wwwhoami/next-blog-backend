import { GetNotificationDto } from '@app/shared/dto';
import {
  CommentPayload,
  NotificationMessage,
  PostPayload,
} from '@app/shared/entities';
import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOkResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { AccessTokenGuard } from '../common/guards/access-token.guard';
import { NotificationService } from './notification.service';

@Controller('notification')
@ApiTags('notification')
@ApiExtraModels(NotificationMessage, CommentPayload, PostPayload)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @ApiOkResponse({
    schema: {
      type: 'array',
      items: {
        allOf: [
          { $ref: getSchemaPath(NotificationMessage) },
          {
            properties: {
              data: {
                oneOf: [
                  { $ref: getSchemaPath(CommentPayload) },
                  { $ref: getSchemaPath(PostPayload) },
                ],
              },
            },
          },
        ],
      },
    },
  })
  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard)
  @Get()
  getMany(
    @GetUser('id') userId: string,
    @Query() getNotificationsQuery: GetNotificationDto,
  ): Promise<NotificationMessage<CommentPayload | PostPayload>[]> {
    return this.notificationService.getMany(userId, getNotificationsQuery);
  }

  @ApiOkResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(NotificationMessage) },
        {
          properties: {
            data: {
              oneOf: [
                { $ref: getSchemaPath(CommentPayload) },
                { $ref: getSchemaPath(PostPayload) },
              ],
            },
          },
        },
      ],
    },
  })
  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard)
  @Patch(':id')
  markAsRead(
    @Param('id', ParseIntPipe) id: number,
    @GetUser('id') userId: string,
  ): Promise<NotificationMessage<CommentPayload | PostPayload>> {
    return this.notificationService.markAsRead(id, userId);
  }
}
