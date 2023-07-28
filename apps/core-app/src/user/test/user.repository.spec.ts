import { PrismaService } from '@app/prisma';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, User } from '@prisma/client';
import { userData } from 'data/seed-data';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { UserRepository } from '../user.repository';

describe('UserRepository', () => {
  let repository: UserRepository;
  let prismaService: DeepMockProxy<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserRepository,
        { provide: PrismaService, useValue: mockDeep<PrismaService>() },
      ],
    }).compile();

    prismaService = module.get(PrismaService);
    repository = module.get<UserRepository>(UserRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('getByName', () => {
    it('should get user by username', () => {
      const user = userData[0] as unknown as Prisma.Prisma__UserClient<User>;
      const username = userData[0].name;

      prismaService.user.findUnique.mockResolvedValue(user);

      expect(repository.getByName(username)).resolves.toEqual(user);
    });
  });

  describe('getByUuid', () => {
    it('should get user by uuid', () => {
      const user = userData[0] as unknown as Prisma.Prisma__UserClient<User>;
      const uuid = userData[0].id as string;

      prismaService.user.findUnique.mockResolvedValue(user);

      expect(repository.getByUuid(uuid)).resolves.toEqual(user);
    });
  });

  describe('getByEmail', () => {
    it('should get user by email', () => {
      const user = userData[0] as unknown as Prisma.Prisma__UserClient<User>;
      const email = userData[0].email;

      prismaService.user.findUnique.mockResolvedValue(user);

      expect(repository.getByEmail(email)).resolves.toEqual(user);
    });
  });

  describe('create', () => {
    it('should create user returning his data', () => {
      const userToCreate = { ...userData[0], password: 'password' };
      const createdUser =
        userData[0] as unknown as Prisma.Prisma__UserClient<User>;

      prismaService.user.create.mockResolvedValue(createdUser);

      expect(repository.create(userToCreate)).resolves.toEqual(createdUser);
    });
  });

  describe('update', () => {
    it('should update user returning his data', () => {
      const userId = userData[0].id;
      const userToUpdate = { ...userData[0], newPassword: 'password' };
      const updatedUser =
        userData[0] as unknown as Prisma.Prisma__UserClient<User>;

      prismaService.user.update.mockResolvedValue(updatedUser);

      expect(repository.update(userId, userToUpdate)).resolves.toEqual(
        updatedUser,
      );
    });
  });

  describe('follow', () => {
    it('should follow user', () => {
      const followerId = userData[0].id as string;
      const followingId = userData[1].id as string;

      prismaService.follows.create.mockResolvedValue({
        followerId,
        followingId,
      });

      expect(repository.follow(followerId, followingId)).resolves.toEqual({
        followerId,
        followingId,
      });
    });
  });

  describe('unfollow', () => {
    it('should unfollow user', () => {
      const followerId = userData[0].id as string;
      const followingId = userData[1].id as string;

      prismaService.follows.delete.mockResolvedValue({
        followerId,
        followingId,
      });

      expect(repository.unfollow(followerId, followingId)).resolves.toEqual({
        followerId,
        followingId,
      });
    });
  });

  describe('getFollowers', () => {
    it("should get user's followers", () => {
      const userId = userData[0].id as string;
      const followers = [userData[1], userData[2]] as unknown as User[];

      prismaService.user.findMany.mockResolvedValue(followers);

      expect(repository.getFollowers(userId)).resolves.toEqual(followers);
    });
  });

  describe('getFollowing', () => {
    it("should get user's followings", () => {
      const userId = userData[0].id as string;
      const followings = [userData[1], userData[2]] as unknown as User[];

      prismaService.user.findMany.mockResolvedValue(followings);

      expect(repository.getFollowing(userId)).resolves.toEqual(followings);
    });
  });
});
