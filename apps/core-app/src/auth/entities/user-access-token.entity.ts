import { UserNoPasswordEntity } from '@core/src/user/entities/user.entity';

export class AuthenticatedUser extends UserNoPasswordEntity {
  accessToken: string;
}
