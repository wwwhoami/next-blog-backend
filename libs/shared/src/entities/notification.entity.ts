import { NotificationType } from '@prisma/client';

export class Notification<PayloadType> {
  id: number;
  actor: string;
  target: string;
  data: PayloadType;
  isRead: boolean;
  createdAt: Date;
  type: NotificationType;
}
