import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { compare, genSalt, hash } from 'bcrypt';
import { Store } from 'cache-manager';
import { UnauthorizedError } from '@core/src/common/errors/unauthorized.error';
import { CreateUserDto } from '@core/src/user/dto/create-user.dto';
import { UpdateUserDto } from '@core/src/user/dto/update-user.dto';
import { UserService } from '@core/src/user/user.service';
import { AuthCredentialsDto } from './dto/auth-credentials.dto';
import { JwtPayload } from './types/jwt-payload.type';
import { SignedUpUser } from './types/signed-up-user.type';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Store,
  ) {}

  /**
   * @param {AuthCredentialsDto} authCredentials - The user's credentials
   * @description Logs in a user and returns an access token and a refresh token
   */
  async login({
    name,
    email,
    password,
  }: AuthCredentialsDto): Promise<SignedUpUser | undefined> {
    // Get the user from the database
    const user = await this.userService.get(
      { name, email },
      { id: true, password: true },
    );

    // If the user doesn't exist, return
    if (!user) return;

    // Compare the user's password with the one in the database
    if (await compare(password, user.password)) {
      const { id, name, email, image, role } = user;
      // Create an access and a refresh tokens
      const accessToken = await this.createAccessToken(id, name, role);
      const { refreshToken, refreshTokenExpiry } =
        await this.createRefreshToken(id, name, role);

      return {
        id,
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

  /**
   * @param {string} id - The user's id
   * @description Logs out a user by deleting the user's refresh token from the cache
   */
  async logout(id: string): Promise<void> {
    this.cacheManager.del(id);
  }

  /**
   * @param {CreateUserDto} user - The user's data
   * @description Signs up a user and returns an access token and a refresh token
   */
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
      id: createdUser.id,
      name: createdUser.name,
      email: createdUser.email,
      image: createdUser.image,
      role: createdUser.role,
      accessToken,
      refreshToken,
      refreshTokenExpiry,
    };
  }

  /**
   * @param {string} id - User's id
   * @param {UpdateUserDto} user - User's data to update
   * @throws {NotFoundError} If user with provided id does not exist
   * @throws {UnauthorizedError} If user's password is wrong
   * @description
   * Updates user's data. Creates new access and refresh tokens and returns them.
   */
  async updateProfile(id: string, user: UpdateUserDto): Promise<SignedUpUser> {
    let encryptedPassword: string | undefined;

    // If the user wants to change the password
    if (user.password && user.newPassword) {
      // Get the user from the database (including the password)
      const u = await this.userService.get({ id }, { password: true });

      if (!u) throw new UnauthorizedError('User not found');

      // Compare the user's password with the stored one
      if (!(await compare(user.password, u.password)))
        throw new UnauthorizedError('Wrong password');

      // Encrypt the new password
      const salt = await genSalt(10);
      encryptedPassword = await hash(user.newPassword, salt);
    }

    const updatedUser = await this.userService.update(id, {
      ...user,
      newPassword: encryptedPassword,
    });

    // Refresh tokens

    const { refreshToken, refreshTokenExpiry } = await this.createRefreshToken(
      updatedUser.id,
      updatedUser.name,
      updatedUser.role,
    );

    const accessToken = await this.createAccessToken(
      updatedUser.id,
      updatedUser.name,
      updatedUser.role,
    );

    return {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      image: updatedUser.image,
      role: updatedUser.role,
      accessToken,
      refreshToken,
      refreshTokenExpiry,
    };
  }

  /**
   * @param {string} id - The user's id
   * @param {string} name - The user's name
   * @param {Role} role - The user's role
   * @description Creates a refresh token and stores it in the cache
   */
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

    // Store the refresh token in the cache (ttl in milliseconds)
    await this.cacheManager.set(id, refreshToken, expiresIn * 1e3);

    return { refreshToken, refreshTokenExpiry: expiresIn };
  }

  /**
   * @param {string} id - The user's id
   * @param {string} name - The user's name
   * @param {Role} role - The user's role
   * @description Creates an access token
   */
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

  /**
   * @param {JwtPayload} refreshToken - The refresh token
   * @description Refreshes the access token and the refresh token
   */
  async refreshTokens(refreshToken: JwtPayload): Promise<{
    refreshToken: string;
    accessToken: string;
    refreshTokenExpiry: number;
    id: string;
  }> {
    const { sub: id, name, role } = refreshToken;

    const tokenValue = await this.cacheManager.get<string>(id);
    // Check if the refresh token is valid
    if (!tokenValue) throw new UnauthorizedError('Refresh token expired');

    // Delete the old refresh token
    await this.cacheManager.del(id);

    // Create a new refresh token and an access token
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
