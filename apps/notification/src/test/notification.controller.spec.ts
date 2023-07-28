import { Test, TestingModule } from '@nestjs/testing';
import { NotificationController } from '../notification.controller';
import { NotificationService } from '../notification.service';
import { MockProxy, mock } from 'jest-mock-extended';
import { NotificationMessage } from '@app/shared/entities';
import { CommentEntity } from '@core/src/comment/entities/comment.entity';
import { PostLike } from '@core/src/post/entities/post.entity';
import { GetNotificationDto } from '@app/shared/dto';

const commentMessage: NotificationMessage<CommentEntity> = {
  target: 'target',
  actor: 'actor',
  data: {
    id: 1,
    postId: 1,
    ancestorId: null,
    content: 'content',
    createdAt: new Date(),
    updatedAt: new Date(),
    authorId: 'authorId',
    isDeleted: false,
    likesCount: 0,
  },
};

const postLikeMessage: NotificationMessage<PostLike> = {
  target: 'target',
  actor: 'actor',
  data: {
    id: 1,
    likesCount: 0,
  },
};

describe('NotificationController', () => {
  let notificationController: NotificationController;
  let notificationService: MockProxy<NotificationService>;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [NotificationController],
      providers: [
        { provide: NotificationService, useValue: mock<NotificationService>() },
      ],
    }).compile();

    notificationService = app.get(NotificationService);
    notificationController = app.get<NotificationController>(
      NotificationController,
    );
  });

  describe('comment_create', () => {
    it('should call commentNotification with message provided', () => {
      const message: NotificationMessage<CommentEntity> = commentMessage;

      notificationController.commentCreate(message);

      expect(notificationService.commentNotification).toHaveBeenCalledWith(
        message,
        'COMMENT_CREATE',
      );
    });
  });

  describe('comment_like', () => {
    it('should call commentNotification with message provided', () => {
      const message: NotificationMessage<CommentEntity> = commentMessage;

      notificationController.commentLike(message);

      expect(notificationService.commentNotification).toHaveBeenCalledWith(
        message,
        'COMMENT_LIKE',
      );
    });
  });

  describe('comment_unlike', () => {
    it('should call commentNotification with message provided', () => {
      const message: NotificationMessage<CommentEntity> = commentMessage;

      notificationController.commentUnlike(message);

      expect(notificationService.commentNotification).toHaveBeenCalledWith(
        message,
        'COMMENT_UNLIKE',
      );
    });
  });

  describe('post_like', () => {
    it('should call postNotification with message provided', () => {
      const message: NotificationMessage<PostLike> = postLikeMessage;

      notificationController.postLike(message);

      expect(notificationService.postNotification).toHaveBeenCalledWith(
        message,
        'POST_LIKE',
      );
    });
  });

  describe('post_unlike', () => {
    it('should call postNotification with message provided', () => {
      const message: NotificationMessage<PostLike> = postLikeMessage;

      notificationController.postUnlike(message);

      expect(notificationService.postNotification).toHaveBeenCalledWith(
        message,
        'POST_UNLIKE',
      );
    });
  });

  describe('mark_as_read', () => {
    it('should call markAsRead with message provided', () => {
      const message = { userId: 'userId', id: 1 };

      notificationController.markAsRead(message);

      expect(notificationService.markAsRead).toHaveBeenCalledWith(
        message.userId,
        message.id,
      );
    });
  });

  describe('get_notifications', () => {
    it('should call getNotifications with message provided', () => {
      const userId = 'userId';
      const options: GetNotificationDto = {};

      notificationController.getNotifications(userId, options);

      expect(notificationService.getManyForUser).toHaveBeenCalledWith(
        userId,
        options,
      );
    });
  });
});
