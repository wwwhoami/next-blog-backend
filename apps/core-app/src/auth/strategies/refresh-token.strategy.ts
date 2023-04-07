import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../types/jwt-payload.type';

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
      secretOrKey: configService.get<string>('REFRESH_JWT_SECRET'),
      ignoreExpiration: false,
      signOptions: {
        expiresIn: configService.get<string>('REFRESH_JWT_EXPIRATION'),
      },
    });
  }

  private static extractJWT(req: Request): string | null {
    return req.cookies['refreshToken'];
  }

  async validate(payload: JwtPayload) {
    return payload;
  }
}
