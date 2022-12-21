import {
  Body,
  ConflictException,
  Controller,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { AccessTokenGuard } from 'src/common/guards/access-token.guard';
import { RefreshTokenGuard } from 'src/common/guards/refresh-token.guard';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { AuthService } from './auth.service';
import { AuthCredentialsDto } from './dto/auth-credentials.dto';
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
  ) {
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
          else if (error.meta.target.includes('email'))
            throw new ConflictException(
              `User with provided email already exists`,
            );
        }
    }

    if (!signedUpUser) throw new InternalServerErrorException();

    const {
      email,
      name,
      image,
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

    return { email, name, image, accessToken };
  }

  @Post('login')
  async login(
    @Body() user: AuthCredentialsDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const loggedInUser = await this.authService.login(user);

    if (!loggedInUser) {
      if (user.name)
        throw new UnauthorizedException('Invalid name or password');
      if (user.email)
        throw new UnauthorizedException('Invalid email or password');
      throw new UnauthorizedException('Invalid credentials');
    }

    const {
      name,
      email,
      image,
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

    return { email, name, image, accessToken };
  }

  @UseGuards(AccessTokenGuard)
  @Get('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const userId: string = req.user.id;

    await this.authService.logout(userId);

    res.clearCookie('refreshToken');
  }

  @UseGuards(RefreshTokenGuard)
  @Get('/refresh')
  async refreshTokens(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { refreshToken, accessToken, refreshTokenExpiry } =
      await this.authService.refreshTokens(req.user);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      expires: new Date(Date.now() + 1000 * refreshTokenExpiry),
      secure:
        this.configService.get<string>('NODE_ENV') === 'prod' ? true : false,
    });

    return { accessToken };
  }
}
