import { JwtPayload } from '@app/auth/types/jwt-payload.type';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        RefreshTokenStrategy.extractJWT,
      ]),
      secretOrKey: configService.getOrThrow<string>('REFRESH_JWT_SECRET'),
      ignoreExpiration: false,
    });
  }

  private static extractJWT(req: Request): string | null {
    return req.cookies['refreshToken'];
  }

  async validate(payload: JwtPayload) {
    return payload;
  }
}
