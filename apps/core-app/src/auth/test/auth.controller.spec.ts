import { Role } from '@core/src/user/entities/role.enum';
import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { MockProxy, mock } from 'jest-mock-extended';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';

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

describe('AuthController', () => {
  let controller: AuthController;
  let authService: MockProxy<AuthService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        ConfigService,
        {
          provide: AuthService,
          useValue: mock<AuthService>(),
        },
      ],
    }).compile();

    authService = module.get(AuthService);
    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('refreshTokens', () => {
    it('should return access token, set cookie with refresh token', async () => {
      const { id } = userData;
      const refreshToken = 'refresh token';
      const refreshTokenExpiry = 123;
      const accessToken = 'access token';
      const req: any = {
        body: {},
        user: { name: 'name', id: 'id' },
      };
      const res: any = {};

      res.cookie = jest.fn();
      authService.refreshTokens.mockResolvedValue({
        refreshToken,
        refreshTokenExpiry,
        accessToken,
        id,
      });

      await expect(controller.refreshTokens(req, res)).resolves.toEqual({
        accessToken,
      });
      expect(res.cookie).toBeCalledWith('refreshToken', refreshToken, {
        httpOnly: true,
        expires: expect.any(Date),
        secure: false,
      });
    });
  });

  describe('signUp', () => {
    it('should return { id, email, name, image, role, accessToken }, set cookie with refresh token', async () => {
      const { id, email, name, image, role } = userData;
      const refreshToken = 'refresh token';
      const refreshTokenExpiry = 123;
      const accessToken = 'access token';
      const user = { ...authCredentials, image: 'image' };
      const res: any = {};

      res.cookie = jest.fn();
      authService.signUp.mockResolvedValue({
        id,
        email,
        name,
        image,
        role,
        refreshToken,
        refreshTokenExpiry,
        accessToken,
      });

      await expect(controller.signUp(user, res)).resolves.toEqual({
        id,
        email,
        name,
        image,
        role,
        accessToken,
      });
      expect(res.cookie).toBeCalledWith('refreshToken', refreshToken, {
        httpOnly: true,
        expires: expect.any(Date),
        secure: false,
      });
    });

    it('should throw ConflictException if user with provided name exists', async () => {
      const password = 'password';
      const userToSignUp = { ...userData, password };
      const exception = new Prisma.PrismaClientKnownRequestError(
        'Error message',
        {
          code: 'P2002',
          clientVersion: '4.7.1',
          meta: {
            target: ['name'],
          },
        },
      );
      const expectedException = new ConflictException(
        `User with provided name already exists`,
      );
      const res: any = {};

      authService.signUp.mockRejectedValue(exception);

      await expect(controller.signUp(userToSignUp, res)).rejects.toThrow(
        expectedException,
      );
    });

    it('should throw ConflictException if user with provided email exists', async () => {
      const password = 'password';
      const userToSignUp = { ...userData, password };
      const exception = new Prisma.PrismaClientKnownRequestError(
        'Error message',
        {
          code: 'P2002',
          clientVersion: '4.7.1',
          meta: {
            target: ['email'],
          },
        },
      );
      const expectedException = new ConflictException(
        `User with provided email already exists`,
      );
      const res: any = {};

      authService.signUp.mockRejectedValue(exception);

      await expect(controller.signUp(userToSignUp, res)).rejects.toThrow(
        expectedException,
      );
    });

    it('should throw InternalServerErrorException if signedUpUser undefined', async () => {
      const password = 'password';
      const userToSignUp = { ...userData, password };
      const res: any = {};

      authService.signUp.mockResolvedValue(undefined);

      await expect(controller.signUp(userToSignUp, res)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('login', () => {
    it('should return { id, email, name, image, role, accessToken }, set cookie with refresh token', async () => {
      const { id, email, name, image, role } = userData;
      const refreshToken = 'refresh token';
      const refreshTokenExpiry = 123;
      const accessToken = 'access token';
      const user = { ...authCredentials, image: 'image' };
      const res: any = {};

      res.cookie = jest.fn();
      authService.login.mockResolvedValue({
        id,
        email,
        name,
        image,
        role,
        refreshToken,
        refreshTokenExpiry,
        accessToken,
      });

      await expect(controller.login(user, res)).resolves.toEqual({
        id,
        email,
        name,
        image,
        role,
        accessToken,
      });
      expect(res.cookie).toBeCalledWith('refreshToken', refreshToken, {
        httpOnly: true,
        expires: expect.any(Date),
        secure: false,
      });
    });

    it('should throw UnauthorizedException if service resolves to undefined & user name provided', async () => {
      const user = { ...authCredentials, image: 'image' };
      const res: any = {};

      authService.login.mockResolvedValue(undefined);

      await expect(controller.login(user, res)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if service resolves to undefined & user email provided', async () => {
      const user = { ...authCredentials, image: 'image', name: undefined };
      const res: any = {};

      authService.login.mockResolvedValue(undefined);

      await expect(controller.login(user, res)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if service resolves to undefined & user name, email not provided', async () => {
      const user = {
        ...authCredentials,
        image: 'image',
        name: undefined,
        email: undefined,
      };
      const res: any = {};

      authService.login.mockResolvedValue(undefined);

      await expect(controller.login(user, res)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('getProfile', () => {
    it("should get user's data by id from provided access token", () => {
      const user = userData;
      const id = userData.id;

      authService.getProfile.mockResolvedValue(user);

      expect(controller.getProfile(id)).resolves.toEqual(user);
    });

    it('should throw NotFoundException if no user found', async () => {
      const id = 'nonexistent';

      authService.getProfile.mockResolvedValue(null);

      await expect(controller.getProfile(id)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateProfile', () => {
    it('should return { email, name, image, accessToken }, set cookie with refresh token', async () => {
      const refreshToken = 'refresh token';
      const refreshTokenExpiry = 123;
      const accessToken = 'access token';
      const user = { ...authCredentials, image: 'image' };
      const res: any = {};

      res.cookie = jest.fn();
      authService.updateProfile.mockResolvedValue({
        ...userData,
        refreshToken,
        refreshTokenExpiry,
        accessToken,
      });

      await expect(
        controller.updateProfile(userData.id, user, res),
      ).resolves.toEqual({
        ...userData,
        accessToken,
        password: undefined,
      });
      expect(res.cookie).toBeCalledWith('refreshToken', refreshToken, {
        httpOnly: true,
        expires: expect.any(Date),
        secure: false,
      });
    });
  });

  describe('logout', () => {
    it('should logout user, clear refreshToken cookie', async () => {
      const user = { ...authCredentials, image: 'image' };
      const req: any = { body: {}, user };
      const res: any = {};

      res.clearCookie = jest.fn();

      await controller.logout(req, res);
      expect(res.clearCookie).toBeCalledWith('refreshToken');
    });
  });
});
