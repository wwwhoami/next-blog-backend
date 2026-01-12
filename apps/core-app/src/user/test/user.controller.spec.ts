import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { userData } from 'data/seed-data';
import { MockProxy, mock } from 'jest-mock-extended';
import { Prisma, User } from 'prisma/generated/client';
import { UserNoIdPasswordEntity } from '../entities/user.entity';
import { UserController } from '../user.controller';
import { UserService } from '../user.service';

describe('UserController', () => {
  let controller: UserController;
  let userService: MockProxy<UserService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: mock<UserService>(),
        },
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
    userService = module.get(UserService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('get', () => {
    it('should get user by username if username provided', () => {
      const user = userData[0] as unknown as Prisma.Prisma__UserClient<User>;
      const username = userData[0].name;

      userService.get.mockResolvedValue(user);

      expect(controller.get(username)).resolves.toEqual(user);
    });

    it('should throw NotFoundException if no user found', async () => {
      const username = 'test';

      userService.get.mockResolvedValue(null);

      await expect(controller.get(username)).rejects.toThrow(NotFoundException);
    });
  });

  describe('follow', () => {
    it('should follow user', () => {
      const followerId = userData[0].id as string;
      const followingId = userData[1].id as string;

      userService.follow.mockResolvedValue({
        followerId,
        followingId,
      });

      expect(controller.follow(followerId, followingId)).resolves.toEqual({
        followerId,
        followingId,
      });
    });
  });

  describe('unfollow', () => {
    it('should unfollow user', () => {
      const followerId = userData[0].id as string;
      const followingId = userData[1].id as string;

      userService.unfollow.mockResolvedValue({
        followerId,
        followingId,
      });

      expect(controller.unfollow(followerId, followingId)).resolves.toEqual({
        followerId,
        followingId,
      });
    });
  });

  describe('getFollowers', () => {
    it("should get user's followers", () => {
      const userId = userData[0].id as string;
      const followers = [userData[1]] as unknown as UserNoIdPasswordEntity[];

      userService.getFollowers.mockResolvedValue(followers);

      expect(controller.getFollowers(userId)).resolves.toEqual(followers);
    });
  });

  describe('getFollowing', () => {
    it("should get user's followings", () => {
      const userId = userData[0].id as string;
      const followings = [userData[1]] as unknown as UserNoIdPasswordEntity[];

      userService.getFollowing.mockResolvedValue(followings);

      expect(controller.getFollowing(userId)).resolves.toEqual(followings);
    });
  });
});
