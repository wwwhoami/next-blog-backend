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
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
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
    description: 'Notifications returned.',
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
  @ApiBadRequestResponse({
    description: 'Invalid notification filters or pagination parameters.',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing, invalid, or expired.',
  })
  @ApiOperation({
    summary: 'List your notifications',
    description:
      'The response includes comment or post data depending on the notification type.',
  })
  getMany(
    @GetUser('id') userId: string,
    @Query() getNotificationsQuery: GetNotificationDto,
  ): Promise<NotificationMessage<CommentPayload | PostPayload>[]> {
    return this.notificationService.getMany(userId, getNotificationsQuery);
  }

  @ApiOkResponse({
    description: 'Notification marked as read and returned.',
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
  @ApiBadRequestResponse({
    description: 'The notification ID must be an integer.',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing, invalid, or expired.',
  })
  @ApiForbiddenResponse({
    description: 'The notification belongs to another user.',
  })
  @ApiNotFoundResponse({ description: 'The notification does not exist.' })
  @ApiOperation({ summary: 'Mark one of your notifications as read' })
  markAsRead(
    @Param('id', ParseIntPipe) id: number,
    @GetUser('id') userId: string,
  ): Promise<NotificationMessage<CommentPayload | PostPayload>> {
    return this.notificationService.markAsRead(id, userId);
  }
}
