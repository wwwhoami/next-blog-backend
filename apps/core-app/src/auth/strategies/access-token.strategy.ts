import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserNoPasswordEntity } from '@core/src/user/entities/user.entity';
import { UserService } from '@core/src/user/user.service';
import { JwtPayload } from '../types/jwt-payload.type';

@Injectable()
export class AccessTokenStrategy extends PassportStrategy(
  Strategy,
  'jwt-access',
) {
  constructor(
    private configService: ConfigService,
    private userService: UserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get<string>('ACCESS_JWT_SECRET'),
      ignoreExpiration: false,
      signOptions: {
        expiresIn: configService.get<string>('ACCESS_JWT_EXPIRATION'),
      },
    });
  }

  async validate(payload: JwtPayload): Promise<UserNoPasswordEntity | null> {
    const { sub: id } = payload;

    const user = await this.userService.get({ id }, { id: true });

    if (!user) throw new UnauthorizedException();

    return user;
  }
}
