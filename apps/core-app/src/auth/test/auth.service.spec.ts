import { UnauthorizedError } from '@core/src/common/errors/unauthorized.error';
import { Role } from '@core/src/user/entities/role.enum';
import { UserService } from '@core/src/user/user.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import bcrypt from 'bcrypt';
import { Cache } from 'cache-manager';
import { MockProxy, mock } from 'jest-mock-extended';
import { AuthService } from '../auth.service';
import { JwtPayload } from '../types/jwt-payload.type';

const authCredentials = {
  name: 'Alice Johnson',
  email: 'alice@prisma.io',
  password: 'password',
};

const userData = {
  id: 'ab182222-5603-4b01-909b-a68fbb3a2153',
  name: 'Alice Johnson',
  email: 'alice@prisma.io',
  image: 'https://randomuser.me/api/portraits/women/12.jpg',
  password: 'password',
  role: Role.User,
};

const refreshTokenJwt: JwtPayload = {
  name: 'name',
  sub: 'sub',
  role: Role.User,
};

describe('AuthService', () => {
  let service: AuthService;
  let userService: MockProxy<UserService>;
  let jwtService: MockProxy<JwtService>;
  let cacheManager: MockProxy<Cache>;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        ConfigService,
        {
          provide: UserService,
          useValue: mock<UserService>(),
        },
        {
          provide: JwtService,
          useValue: mock<JwtService>(),
        },
        { provide: CACHE_MANAGER, useValue: mock<Cache>() },
      ],
    }).compile();

    userService = module.get(UserService);
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);
    cacheManager = module.get(CACHE_MANAGER);
    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createRefreshToken', () => {
    it('should create refresh token, return with expiry', async () => {
      const { id, name, role } = userData;
      const refreshToken = 'refresh token';
      const refreshTokenExp =
        configService.get<number>('REFRESH_JWT_EXPIRATION') ?? 86400;

      jwtService.signAsync.mockResolvedValue(refreshToken);

      expect(service.createRefreshToken(id, name, role)).resolves.toEqual({
        refreshToken,
        refreshTokenExpiry: refreshTokenExp,
      });
    });
  });

  describe('createAccessToken', () => {
    it('should create refresh token, return it', () => {
      const { id, name, role } = userData;
      const accessToken = 'access token';

      jwtService.signAsync.mockResolvedValue(accessToken);

      expect(service.createAccessToken(id, name, role)).resolves.toEqual(
        accessToken,
      );
    });
  });

  describe('refreshTokens', () => {
    it('should throw UnauthorizedException if no token found in cache store', () => {
      const refreshToken = refreshTokenJwt;
      const exception = new UnauthorizedException('Refresh token expired');

      cacheManager.get.mockResolvedValue(null);
      const result = service.refreshTokens(refreshToken);

      expect(result).rejects.toThrowError(exception);
      expect(cacheManager.get).toBeCalledWith(refreshToken.sub);
    });

    it('should return { refreshToken, accessToken, refreshTokenExpiry, id }, if token found in cache', () => {
      const refreshToken = 'refresh token';
      const refreshTokenExpiry = 60;
      const accessToken = 'access token';

      cacheManager.get.mockResolvedValue('old token');
      service.createRefreshToken = jest.fn().mockResolvedValue({
        refreshToken,
        refreshTokenExpiry,
      });
      service.createAccessToken = jest.fn().mockResolvedValue(accessToken);

      expect(service.refreshTokens(refreshTokenJwt)).resolves.toEqual({
        refreshToken,
        refreshTokenExpiry,
        accessToken,
        id: refreshTokenJwt.sub,
      });
      expect(cacheManager.get).toBeCalledWith(refreshTokenJwt.sub);
    });
  });

  describe('logout', () => {
    it('should delete refresh token with provided userId from cache', () => {
      const id = refreshTokenJwt.sub;

      expect(service.logout(id)).resolves.toBeUndefined();
      expect(cacheManager.del).toBeCalledWith(id);
    });
  });

  describe('login', () => {
    it('should return undefined if user with provided credentials does not exist', () => {
      const user = authCredentials;
      const retrievedUser = null;

      userService.get.mockResolvedValue(retrievedUser);

      expect(service.login(user)).resolves.toBeUndefined();
    });

    it('should return undefined if password comparison resolves to false', () => {
      const user = authCredentials;
      const retrievedUser = { ...userData, password: 'other password' };

      bcrypt.compare = jest.fn().mockResolvedValueOnce(false);
      userService.get.mockResolvedValue(retrievedUser);

      expect(service.login(user)).resolves.toBeUndefined();
    });

    it('should return { id, name, email, image, accessToken, refreshToken, refreshTokenExpiry } if password comparison resolves to true', () => {
      const user = authCredentials;
      const retrievedUser = { ...userData, password: user.password };
      const refreshToken = 'refresh token';
      const refreshTokenExpiry = 60;
      const accessToken = 'access token';
      const expectedReturn = {
        id: retrievedUser.id,
        name: retrievedUser.name,
        email: retrievedUser.email,
        image: retrievedUser.image,
        role: retrievedUser.role,
        accessToken,
        refreshToken,
        refreshTokenExpiry,
      };

      bcrypt.compare = jest.fn().mockResolvedValueOnce(true);
      service.createRefreshToken = jest
        .fn()
        .mockResolvedValue({ refreshToken, refreshTokenExpiry });
      service.createAccessToken = jest.fn().mockResolvedValue(accessToken);
      userService.get.mockResolvedValue(retrievedUser);

      expect(service.login(user)).resolves.toEqual(expectedReturn);
    });
  });

  describe('signUp', () => {
    it('should return undefined if createdUser is undefined', () => {
      const userToCreate = authCredentials;
      const createdUser = undefined;

      bcrypt.hash = jest.fn().mockResolvedValueOnce(userToCreate.password);
      userService.create.mockResolvedValueOnce(createdUser);

      expect(service.signUp(userToCreate)).resolves.toBeUndefined();
    });

    it('should return { id, name, email, image, accessToken, refreshToken, refreshTokenExpiry } if user created', async () => {
      const userToCreate = { ...authCredentials, image: 'image' };
      const createdUser = {
        id: userData.id,
        name: userToCreate.name,
        email: userToCreate.email,
        image: userToCreate.image,
        role: Role.User,
      };
      const refreshToken = 'refresh token';
      const refreshTokenExpiry = 60;
      const accessToken = 'access token';
      const expectedReturn = {
        id: createdUser.id,
        name: createdUser.name,
        email: createdUser.email,
        image: createdUser.image,
        role: createdUser.role,
        accessToken,
        refreshToken,
        refreshTokenExpiry,
      };

      bcrypt.hash = jest.fn().mockResolvedValueOnce(userToCreate.password);
      userService.create.mockResolvedValueOnce(createdUser);

      service.createRefreshToken = jest
        .fn()
        .mockResolvedValueOnce({ refreshToken, refreshTokenExpiry });
      service.createAccessToken = jest.fn().mockResolvedValueOnce(accessToken);

      await expect(service.signUp(userToCreate)).resolves.toEqual(
        expectedReturn,
      );
    });
  });

  describe('updateProfile', () => {
    it('should update user profile and return { name, email, image, accessToken, refreshToken, refreshTokenExpiry }', async () => {
      const userToUpdate = { ...userData };
      const updatedUser = {
        name: userToUpdate.name,
        email: userToUpdate.email,
        image: userToUpdate.image,
        role: Role.User,
        id: userData.id,
      };
      const refreshToken = 'refresh token';
      const refreshTokenExpiry = 60;
      const accessToken = 'access token';

      userService.update.mockResolvedValue(updatedUser);

      service.createRefreshToken = jest
        .fn()
        .mockResolvedValue({ refreshToken, refreshTokenExpiry });
      service.createAccessToken = jest.fn().mockResolvedValue(accessToken);

      const updateProfile = service.updateProfile(
        userToUpdate.id,
        userToUpdate,
      );
      await expect(updateProfile).resolves.toEqual({
        ...updatedUser,
        accessToken,
        refreshToken,
        refreshTokenExpiry,
      });
    });

    it('should generate encrypted password if old and new passwords are provided', async () => {
      const userToUpdate = { ...userData, newPassword: 'new password' };
      const refreshToken = 'refresh token';
      const refreshTokenExpiry = 60;
      const accessToken = 'access token';
      const newUser = {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        image: userData.image,
        role: userData.role,
      };

      userService.get.mockResolvedValueOnce(userData);

      bcrypt.compare = jest.fn().mockResolvedValueOnce(true);
      bcrypt.hash = jest.fn().mockResolvedValueOnce(userToUpdate.newPassword);

      userService.update.mockResolvedValueOnce(newUser);

      service.createRefreshToken = jest
        .fn()
        .mockResolvedValueOnce({ refreshToken, refreshTokenExpiry });
      service.createAccessToken = jest.fn().mockResolvedValueOnce(accessToken);

      const updateProfile = service.updateProfile(
        userToUpdate.id,
        userToUpdate,
      );

      await expect(updateProfile).resolves.toEqual({
        ...newUser,
        id: 'ab182222-5603-4b01-909b-a68fbb3a2153',
        accessToken,
        refreshToken,
        refreshTokenExpiry,
      });
      expect(userService.update).toHaveBeenCalledWith(userToUpdate.id, {
        ...userToUpdate,
      });
    });

    it('should throw UnauthorizedError if user with provided id does not exist', () => {
      const userToUpdate = { ...userData, newPassword: 'new password' };

      userService.get.mockResolvedValue(null);

      expect(
        service.updateProfile(userToUpdate.id, userToUpdate),
      ).rejects.toThrow(UnauthorizedError);
    });

    it('should throw UnauthorizedError if stored password and provided password are compared unequal', () => {
      const userToUpdate = { ...userData, newPassword: 'new password' };

      userService.get.mockResolvedValue(userToUpdate);
      bcrypt.compare = jest.fn().mockResolvedValueOnce(false);

      expect(
        service.updateProfile(userToUpdate.id, userToUpdate),
      ).rejects.toThrow(UnauthorizedError);
    });
  });
});
