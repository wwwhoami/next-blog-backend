import { JwtPayload } from '@app/auth/types/jwt-payload.type';
import { AccessTokenGuard } from '@core/src/common/guards/access-token.guard';
import { RefreshTokenGuard } from '@core/src/common/guards/refresh-token.guard';
import { CreateUserDto } from '@core/src/user/dto/create-user.dto';
import { UpdateUserDto } from '@core/src/user/dto/update-user.dto';
import {
  Body,
  ConflictException,
  Controller,
  Get,
  InternalServerErrorException,
  Patch,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { GetRefreshToken } from './decorators/get-refresh-token.decorator';
import { GetUser } from './decorators/get-user.decorator';
import { AuthCredentialsDto } from './dto/auth-credentials.dto';
import { AccessTokenEntity } from './entities/access-token.entity';
import { AuthenticatedUser } from './entities/user-access-token.entity';
import { SignedUpUser } from './types/signed-up-user.type';

@Controller('auth')
@ApiTags('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  @Post('sign-up')
  async signUp(
    @Body() user: CreateUserDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthenticatedUser> {
    let signedUpUser: SignedUpUser | undefined;

    try {
      signedUpUser = await this.authService.signUp(user);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        if (error.meta?.target instanceof Array) {
          if (error.meta.target.includes('name'))
            throw new ConflictException(
              `User with provided name already exists`,
            );
          if (error.meta.target.includes('email'))
            throw new ConflictException(
              `User with provided email already exists`,
            );
        }
      throw new InternalServerErrorException();
    }

    if (!signedUpUser) throw new InternalServerErrorException();

    const {
      id,
      email,
      name,
      image,
      role,
      refreshToken,
      refreshTokenExpiry,
      accessToken,
    } = signedUpUser;

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      expires: new Date(Date.now() + 1000 * refreshTokenExpiry),
      secure:
        this.configService.get<string>('NODE_ENV') === 'prod' ? true : false,
    });

    return { id, email, name, image, role, accessToken };
  }

  @Post('login')
  async login(
    @Body() user: AuthCredentialsDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthenticatedUser> {
    const loggedInUser = await this.authService.login(user);

    if (!loggedInUser) {
      if (user.name)
        throw new UnauthorizedException('Invalid name or password');
      if (user.email)
        throw new UnauthorizedException('Invalid email or password');

      throw new UnauthorizedException('Invalid credentials');
    }

    const {
      id,
      name,
      email,
      image,
      role,
      accessToken,
      refreshToken,
      refreshTokenExpiry,
    } = loggedInUser;

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      expires: new Date(Date.now() + 1000 * refreshTokenExpiry),
      secure:
        this.configService.get<string>('NODE_ENV') === 'prod' ? true : false,
    });

    return { id, email, name, image, role, accessToken };
  }

  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard)
  @Patch('profile')
  async updateProfile(
    @GetUser('id') id: string,
    @Body() user: UpdateUserDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthenticatedUser> {
    const {
      name,
      email,
      image,
      role,
      accessToken,
      refreshToken,
      refreshTokenExpiry,
    } = await this.authService.updateProfile(id, user);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      expires: new Date(Date.now() + 1000 * refreshTokenExpiry),
      secure:
        this.configService.get<string>('NODE_ENV') === 'prod' ? true : false,
    });

    return { id, email, name, image, role, accessToken };
  }

  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard)
  @Get('logout')
  async logout(
    @GetUser('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(id);

    res.clearCookie('refreshToken');
  }

  @ApiCookieAuth()
  @UseGuards(RefreshTokenGuard)
  @Get('refresh')
  async refreshTokens(
    @GetRefreshToken() jwt: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenEntity> {
    const { refreshToken, accessToken, refreshTokenExpiry } =
      await this.authService.refreshTokens(jwt);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      expires: new Date(Date.now() + 1000 * refreshTokenExpiry),
      secure:
        this.configService.get<string>('NODE_ENV') === 'prod' ? true : false,
    });

    return { accessToken };
  }
}
