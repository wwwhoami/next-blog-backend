import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserNoPasswordEntity } from 'src/user/entities/user.entity';
import { UserRepository } from 'src/user/user.repository';
import { JwtPayload } from '../types/jwt-payload.type';

@Injectable()
export class AccessTokenStrategy extends PassportStrategy(
  Strategy,
  'jwt-access',
) {
  constructor(
    private configService: ConfigService,
    private userRepository: UserRepository,
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

    const user = await this.userRepository.getByUuid(id, { id: true });

    if (!user) throw new UnauthorizedException();

    return user;
  }
}
