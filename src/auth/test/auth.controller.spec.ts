import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { mock, MockProxy } from 'jest-mock-extended';
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
};

// const refreshTokenJwt: JwtPayload = {  };

describe('AuthController', () => {
  let controller: AuthController;
  let authService: MockProxy<AuthService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthController,
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
    it('should return { email, name, image, accessToken }, set cookie with refresh token', async () => {
      const { email, name, image } = userData;
      const refreshToken = 'refresh token';
      const refreshTokenExpiry = 123;
      const accessToken = 'access token';
      const user = { ...authCredentials, image: 'image' };
      const res: any = {};

      res.cookie = jest.fn();
      authService.signUp.mockResolvedValue({
        email,
        name,
        image,
        refreshToken,
        refreshTokenExpiry,
        accessToken,
      });

      await expect(controller.signUp(user, res)).resolves.toEqual({
        email,
        name,
        image,
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

      await expect(controller.signUp(userToSignUp, res)).rejects.toThrowError(
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

      await expect(controller.signUp(userToSignUp, res)).rejects.toThrowError(
        expectedException,
      );
    });

    it('should throw InternalServerErrorException if signedUpUser undefined', async () => {
      const password = 'password';
      const userToSignUp = { ...userData, password };
      const res: any = {};

      authService.signUp.mockResolvedValue(undefined);

      await expect(controller.signUp(userToSignUp, res)).rejects.toThrowError(
        InternalServerErrorException,
      );
    });
  });

  describe('login', () => {
    it('should return { email, name, image, accessToken }, set cookie with refresh token', async () => {
      const { email, name, image } = userData;
      const refreshToken = 'refresh token';
      const refreshTokenExpiry = 123;
      const accessToken = 'access token';
      const user = { ...authCredentials, image: 'image' };
      const res: any = {};

      res.cookie = jest.fn();
      authService.login.mockResolvedValue({
        email,
        name,
        image,
        refreshToken,
        refreshTokenExpiry,
        accessToken,
      });

      await expect(controller.login(user, res)).resolves.toEqual({
        email,
        name,
        image,
        accessToken,
      });
      expect(res.cookie).toBeCalledWith('refreshToken', refreshToken, {
        httpOnly: true,
        expires: expect.any(Date),
        secure: false,
      });
    });

    it('should throw NotFoundException if service resolves to undefined & user name provided', async () => {
      const user = { ...authCredentials, image: 'image' };
      const res: any = {};

      authService.login.mockResolvedValue(undefined);

      await expect(controller.login(user, res)).rejects.toThrowError(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if service resolves to undefined & user email provided', async () => {
      const user = { ...authCredentials, image: 'image', name: undefined };
      const res: any = {};

      authService.login.mockResolvedValue(undefined);

      await expect(controller.login(user, res)).rejects.toThrowError(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if service resolves to undefined & user name, email not provided', async () => {
      const user = {
        ...authCredentials,
        image: 'image',
        name: undefined,
        email: undefined,
      };
      const res: any = {};

      authService.login.mockResolvedValue(undefined);

      await expect(controller.login(user, res)).rejects.toThrowError(
        NotFoundException,
      );
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
