import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthUser, JwtPayload } from './types';

@Injectable()
export class AppAuthService {
  constructor(private readonly jwtService: JwtService) {}

  async validateAccessToken(token: string): Promise<AuthUser> {
    await this.jwtService.verifyAsync(token);

    const { name, sub, role } = this.jwtService.decode(token) as JwtPayload;

    return { name, id: sub, role };
  }
}
