import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, User } from '@prisma/client';
import { mock, MockProxy } from 'jest-mock-extended';
import { UserRepository } from '../user.repository';
import { UserService } from '../user.service';

const userDataWithId = {
  id: 'ab182222-5603-4b01-909b-a68fbb3a2153',
  name: 'Alice Johnson',
  email: 'alice@prisma.io',
  image: 'https://randomuser.me/api/portraits/women/12.jpg',
};

const userData = [
  {
    name: 'John Doe',
    email: 'john@prisma.io',
    image: 'https://randomuser.me/api/portraits/men/12.jpg',
  },
  {
    name: 'Sam Smith',
    email: 'sam@prisma.io',
    image: 'https://randomuser.me/api/portraits/men/11.jpg',
  },
  {
    name: 'Mike Richards',
    email: 'mahmoud@prisma.io',
    image: 'https://randomuser.me/api/portraits/men/13.jpg',
  },
];

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

  describe('getUser', () => {
    it('should get user by username if username provided', () => {
      const user = userData[0] as unknown as Prisma.Prisma__UserClient<User>;
      const username = userData[0].name;

      repository.getByName.mockResolvedValue(user);

      expect(service.getUser({ name: username })).resolves.toEqual(user);
    });

    it('should throw NotFoundException if no user found', async () => {
      const username = 'test';

      repository.getByName.mockResolvedValue(null);

      await expect(service.getUser({ name: username })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('should get user by email if no username but email provided', () => {
      const user = userData[0] as unknown as Prisma.Prisma__UserClient<User>;
      const email = userData[0].email;

      repository.getByEmail.mockResolvedValue(user);

      expect(service.getUser({ email })).resolves.toEqual(user);
    });

    it('should throw NotFoundException if no user found with email provided', async () => {
      const email = 'test';

      repository.getByEmail.mockResolvedValue(null);

      await expect(service.getUser({ email })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('should throw Error if neither username nor email provided', async () => {
      const email = undefined;
      const username = undefined;

      repository.getByEmail.mockResolvedValue(null);

      await expect(
        service.getUser({ email, name: username }),
      ).rejects.toBeInstanceOf(Error);
    });
  });

  describe('createUser', () => {
    it('should create user with password encrypted returning his data', async () => {
      const password = 'password';
      const userToCreate = { ...userData[0], password };
      const createdUser =
        userData[0] as unknown as Prisma.Prisma__UserClient<User>;

      const createUserMock = repository.createUser;
      createUserMock.mockResolvedValue(createdUser);

      const createUserAction = await service.createUser(userToCreate);

      expect(createUserAction).toEqual(createdUser);
      expect(createUserMock).toHaveBeenCalledWith(
        expect.objectContaining({
          password: expect.not.stringMatching(password),
        }),
      );
    });

    it('should throw ConflictException if user with provided name exists', async () => {
      const password = 'password';
      const userToCreate = { ...userData[0], password };
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

      repository.createUser.mockRejectedValue(exception);

      await expect(service.createUser(userToCreate)).rejects.toThrowError(
        expectedException,
      );
    });

    it('should throw ConflictException if user with provided email exists', async () => {
      const password = 'password';
      const userToCreate = { ...userData[0], password };
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

      repository.createUser.mockRejectedValue(exception);

      await expect(service.createUser(userToCreate)).rejects.toThrowError(
        expectedException,
      );
    });
  });
});
