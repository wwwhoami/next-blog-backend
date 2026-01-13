import { WrongParamsError } from '@core/src/common/errors/wrong-params.error';
import { Test, TestingModule } from '@nestjs/testing';
import { userData } from 'data/seed-data';
import { MockProxy, mock } from 'jest-mock-extended';
import { Prisma, User } from 'prisma/generated/client';
import { UserRepository } from '../user.repository';
import { UserService } from '../user.service';

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

  afterEach(() => {
    jest.clearAllMocks();
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

      await expect(service.get({ email, name: username })).rejects.toThrow(
        WrongParamsError,
      );
    });
  });

  describe('create', () => {
    it('should create user returning his data', async () => {
      const password = 'password';
      const userToCreate = { ...userData[0], password };
      const createdUser =
        userData[0] as unknown as Prisma.Prisma__UserClient<User>;

      repository.create.mockResolvedValue(createdUser);

      const createUserAction = await service.create(userToCreate);

      expect(createUserAction).toEqual(createdUser);
    });
  });

  describe('update', () => {
    it('should update user', () => {
      const userId = userData[0].id;
      const userToUpdate = userData[0];
      const updatedUser =
        userData[0] as unknown as Prisma.Prisma__UserClient<User>;

      repository.update.mockResolvedValue(updatedUser);

      expect(service.update(userId, userToUpdate)).resolves.toEqual(
        updatedUser,
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
