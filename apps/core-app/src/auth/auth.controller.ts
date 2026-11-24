import { JwtPayload } from '@app/auth/types/jwt-payload.type';
import { AccessTokenGuard } from '@core/src/common/guards/access-token.guard';
import { RefreshTokenGuard } from '@core/src/common/guards/refresh-token.guard';
import { CreateUserDto } from '@core/src/user/dto/create-user.dto';
import { UpdateUserDto } from '@core/src/user/dto/update-user.dto';
import { UserNoPasswordEntity } from '@core/src/user/entities/user.entity';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  InternalServerErrorException,
  NotFoundException,
  Patch,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Response } from 'express';
import { Prisma } from 'prisma/generated/client';
import { ApiAccessTokenAuth } from '../common/decorators/api-access-token-auth.decorator';
import { ApiJsonBodyLimit } from '../common/decorators/api-json-body-limit.decorator';
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
  @ApiCreatedResponse({
    description: 'Account created and session started.',
    type: AuthenticatedUser,
  })
  @ApiBadRequestResponse({
    description: 'Invalid sign-up fields or a managed avatar was supplied.',
  })
  @ApiConflictResponse({
    description: 'The name or email is already registered.',
  })
  @ApiJsonBodyLimit()
  @ApiOperation({
    summary: 'Create an account and sign in',
    description:
      'Returns the new account and an access token, and sets the HTTP-only `refreshToken` cookie.',
  })
  async signUp(
    @Body() user: CreateUserDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthenticatedUser> {
    let signedUpUser: SignedUpUser | undefined;

    try {
      signedUpUser = await this.authService.signUp(user);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const causeFields = (error.meta?.driverAdapterError as any).cause
          .constraint.fields;

        if (causeFields instanceof Array) {
          if (causeFields.includes('name'))
            throw new ConflictException(
              `User with provided name already exists`,
            );
          if (causeFields.includes('email'))
            throw new ConflictException(
              `User with provided email already exists`,
            );
        }
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
  @ApiCreatedResponse({
    description: 'Credentials accepted and session started.',
    type: AuthenticatedUser,
  })
  @ApiBadRequestResponse({ description: 'Invalid login fields.' })
  @ApiUnauthorizedResponse({
    description: 'The supplied credentials are incorrect.',
  })
  @ApiJsonBodyLimit()
  @ApiOperation({
    summary: 'Sign in with a name or email',
    description:
      'Send a name or email and the password. The response includes an access token and sets the HTTP-only `refreshToken` cookie.',
  })
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

  @ApiAccessTokenAuth()
  @UseGuards(AccessTokenGuard)
  @Get('profile')
  @ApiOkResponse({
    description: 'Current profile returned.',
    type: UserNoPasswordEntity,
  })
  @ApiNotFoundResponse({ description: 'The account no longer exists.' })
  @ApiOperation({ summary: 'Get your profile' })
  async getProfile(@GetUser('id') id: string): Promise<UserNoPasswordEntity> {
    const user = await this.authService.getProfile(id);

    if (!user) throw new NotFoundException(`User with id ${id} not found`);

    return user;
  }

  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard)
  @Patch('profile')
  @ApiOkResponse({
    description: 'Profile updated and new tokens issued.',
    type: AuthenticatedUser,
  })
  @ApiBadRequestResponse({ description: 'Invalid profile fields or avatar.' })
  @ApiUnauthorizedResponse({
    description:
      'The access token is invalid or the supplied current password is incorrect.',
  })
  @ApiNotFoundResponse({ description: 'The account no longer exists.' })
  @ApiConflictResponse({
    description: 'The requested name or email is already in use.',
  })
  @ApiJsonBodyLimit()
  @ApiOperation({
    summary: 'Update your profile',
    description:
      'To change your password, send both `password` and `newPassword`. A successful update issues a new access token and replaces the HTTP-only `refreshToken` cookie.',
  })
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

  @HttpCode(204)
  @ApiAccessTokenAuth()
  @UseGuards(AccessTokenGuard)
  @Get('logout')
  @ApiNoContentResponse({
    description: 'Signed out and refresh cookie cleared.',
  })
  @ApiOperation({
    summary: 'Sign out',
    description:
      'Clears the `refreshToken` cookie and invalidates the server-side refresh session. Returns 204 with an empty body.',
  })
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
  @ApiOkResponse({
    description: 'New access token returned and refresh cookie replaced.',
    type: AccessTokenEntity,
  })
  @ApiUnauthorizedResponse({
    description:
      'Refresh cookie or server-side refresh session is missing, invalid, or expired.',
  })
  @ApiOperation({
    summary: 'Refresh your session',
    description:
      'Send the HTTP-only `refreshToken` cookie. The response returns a new access token and replaces the cookie. Browser clients making cross-origin requests must include credentials.',
  })
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
