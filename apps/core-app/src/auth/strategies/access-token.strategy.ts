import { JwtPayload } from '@app/auth/types';
import { UserEntity } from '@core/src/user/entities/user.entity';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class AccessTokenStrategy extends PassportStrategy(
  Strategy,
  'jwt-access',
) {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.getOrThrow<string>('ACCESS_JWT_SECRET'),
      ignoreExpiration: false,
    });
  }

  async validate({
    sub,
    name,
    role,
  }: JwtPayload): Promise<Pick<UserEntity, 'id' | 'name' | 'role'>> {
    return { id: sub, name, role };
  }
}
