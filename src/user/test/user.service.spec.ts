import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, User } from '@prisma/client';
import { mock, MockProxy } from 'jest-mock-extended';
import { WrongParamsError } from 'src/common/errors/wrong-params.error';
import { UserRepository } from '../user.repository';
import { UserService } from '../user.service';
import { userData } from '../../../data/seed-data';

describe('UserService', () => {
  let service: UserService;
  let repository: MockProxy<UserRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: UserRepository,
          useValue: mock<UserRepository>(),
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    repository = module.get(UserRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('get', () => {
    it('should get user by id if id provided', () => {
      const user = userData[0] as unknown as Prisma.Prisma__UserClient<User>;
      const id = userData[0].id;

      repository.getByUuid.mockResolvedValue(user);

      expect(service.get({ id })).resolves.toEqual(user);
    });

    it('should get user by username if username provided', () => {
      const user = userData[0] as unknown as Prisma.Prisma__UserClient<User>;
      const username = userData[0].name;

      repository.getByName.mockResolvedValue(user);

      expect(service.get({ name: username })).resolves.toEqual(user);
    });

    it('should throw NotFoundException if no user found', async () => {
      const username = 'test';

      repository.getByName.mockResolvedValue(null);

      await expect(service.get({ name: username })).resolves.toBeNull();
    });

    it('should get user by email if no username but email provided', () => {
      const user = userData[0] as unknown as Prisma.Prisma__UserClient<User>;
      const email = userData[0].email;

      repository.getByEmail.mockResolvedValue(user);

      expect(service.get({ email })).resolves.toEqual(user);
    });

    it('should throw WrongParamsError if neither username nor email provided', async () => {
      const email = undefined;
      const username = undefined;

      repository.getByEmail.mockResolvedValue(null);

      await expect(service.get({ email, name: username })).rejects.toThrowError(
        WrongParamsError,
      );
    });
  });

  describe('create', () => {
    it('should create user with password encrypted returning his data', async () => {
      const password = 'password';
      const userToCreate = { ...userData[0], password };
      const createdUser =
        userData[0] as unknown as Prisma.Prisma__UserClient<User>;

      const createUserMock = repository.create;
      createUserMock.mockResolvedValue(createdUser);

      const createUserAction = await service.create(userToCreate);

      expect(createUserAction).toEqual(createdUser);
      expect(createUserMock).toHaveBeenCalledWith(
        expect.objectContaining({
          password: expect.not.stringMatching(password),
        }),
      );
    });
  });

  describe('follow', () => {
    it('should follow user', () => {
      const followerId = userData[0].id as string;
      const followingId = userData[1].id as string;

      repository.follow.mockResolvedValue({
        followerId,
        followingId,
      });

      expect(service.follow(followerId, followingId)).resolves.toEqual({
        followerId,
        followingId,
      });
    });
  });

  describe('unfollow', () => {
    it('should unfollow user', () => {
      const followerId = userData[0].id as string;
      const followingId = userData[1].id as string;

      repository.unfollow.mockResolvedValue({
        followerId,
        followingId,
      });

      expect(service.unfollow(followerId, followingId)).resolves.toEqual({
        followerId,
        followingId,
      });
    });
  });

  describe('getFollowers', () => {
    it('should get followers', () => {
      const userId = userData[0].id as string;
      const followers = [userData[1]] as unknown as User[];

      repository.getFollowers.mockResolvedValue(followers);

      expect(service.getFollowers(userId)).resolves.toEqual(followers);
    });
  });

  describe('getFollowing', () => {
    it("should get user's followings", () => {
      const userId = userData[0].id as string;
      const following = [userData[1]] as unknown as User[];

      repository.getFollowing.mockResolvedValue(following);

      expect(service.getFollowing(userId)).resolves.toEqual(following);
    });
  });
});
