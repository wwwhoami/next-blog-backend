import {
  CACHE_MANAGER,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { compare, genSalt, hash } from 'bcrypt';
import { Cache } from 'cache-manager';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { UserService } from 'src/user/user.service';
import { AuthCredentialsDto } from './dto/auth-credentials.dto';
import { JwtPayload } from './types/jwt-payload.type';
import { SignedUpUser } from './types/signed-up-user.type';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async login({
    name,
    email,
    password,
  }: AuthCredentialsDto): Promise<SignedUpUser | undefined> {
    const user = await this.userService.get(
      { name, email },
      { id: true, password: true },
    );

    if (!user) return;

    if (await compare(password, user.password)) {
      const { id, name, email, image, role } = user;

      const accessToken = await this.createAccessToken(id, name, role);
      const { refreshToken, refreshTokenExpiry } =
        await this.createRefreshToken(id, name, role);

      return {
        name,
        email,
        image,
        role,
        accessToken,
        refreshToken,
        refreshTokenExpiry,
      };
    }
  }

  async logout(id: string): Promise<void> {
    this.cacheManager.del(id);
  }

  async signUp({
    name,
    password,
    email,
    image,
  }: CreateUserDto): Promise<SignedUpUser | undefined> {
    const salt = await genSalt(10);
    const encryptedPassword = await hash(password, salt);

    const createdUser = await this.userService.create({
      name,
      email,
      image,
      password: encryptedPassword,
    });

    if (!createdUser) return;

    const { refreshToken, refreshTokenExpiry } = await this.createRefreshToken(
      createdUser.id,
      createdUser.name,
      createdUser.role,
    );
    const accessToken = await this.createAccessToken(
      createdUser.id,
      createdUser.name,
      createdUser.role,
    );

    return {
      name: createdUser.name,
      email: createdUser.email,
      image: createdUser.image,
      role: createdUser.role,
      accessToken,
      refreshToken,
      refreshTokenExpiry,
    };
  }

  async createRefreshToken(
    id: string,
    name: string,
    role: Role,
  ): Promise<{ refreshToken: string; refreshTokenExpiry: number }> {
    const jwtPayload: JwtPayload = {
      sub: id,
      name,
      role,
    };
    const expiresIn =
      this.configService.get<number>('REFRESH_JWT_EXPIRATION') ?? 86400;

    const refreshToken = await this.jwtService.signAsync(jwtPayload, {
      secret: this.configService.get<string>('REFRESH_JWT_SECRET'),
      expiresIn,
    });

    await this.cacheManager.set(id, refreshToken, { ttl: expiresIn });

    return { refreshToken, refreshTokenExpiry: expiresIn };
  }

  async createAccessToken(
    id: string,
    name: string,
    role: Role,
  ): Promise<string> {
    const jwtPayload: JwtPayload = {
      sub: id,
      name,
      role,
    };
    const expiresIn = this.configService.get<number>('ACCESS_JWT_EXPIRATION');

    const accessToken = await this.jwtService.signAsync(jwtPayload, {
      secret: this.configService.get<string>('ACCESS_JWT_SECRET'),
      expiresIn,
    });

    return accessToken;
  }

  async refreshTokens(refreshToken: JwtPayload): Promise<{
    refreshToken: string;
    accessToken: string;
    refreshTokenExpiry: number;
    id: string;
  }> {
    const { sub: id, name, role } = refreshToken;

    const tokenValue = await this.cacheManager.get(id);
    if (!tokenValue) throw new UnauthorizedException('Refresh token expired');

    await this.cacheManager.del(id);

    const { refreshToken: createdRefreshToken, refreshTokenExpiry } =
      await this.createRefreshToken(id, name, role);
    const accessToken = await this.createAccessToken(id, name, role);

    return {
      refreshToken: createdRefreshToken,
      accessToken,
      refreshTokenExpiry,
      id,
    };
  }
}
