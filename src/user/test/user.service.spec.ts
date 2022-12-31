import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, User } from '@prisma/client';
import { mock, MockProxy } from 'jest-mock-extended';
import { WrongParamsError } from 'src/common/errors/wrong-params.error';
import { UserRepository } from '../user.repository';
import { UserService } from '../user.service';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    it('should get user by id if id provided', () => {
      const user = userDataWithId as unknown as Prisma.Prisma__UserClient<User>;
      const id = userDataWithId.id;

      repository.getByUuid.mockResolvedValue(user);

      expect(service.getUser({ id })).resolves.toEqual(user);
    });

    it('should get user by username if username provided', () => {
      const user = userData[0] as unknown as Prisma.Prisma__UserClient<User>;
      const username = userData[0].name;

      repository.getByName.mockResolvedValue(user);

      expect(service.getUser({ name: username })).resolves.toEqual(user);
    });

    it('should throw NotFoundException if no user found', async () => {
      const username = 'test';

      repository.getByName.mockResolvedValue(null);

      await expect(service.getUser({ name: username })).resolves.toBeNull();
    });

    it('should get user by email if no username but email provided', () => {
      const user = userData[0] as unknown as Prisma.Prisma__UserClient<User>;
      const email = userData[0].email;

      repository.getByEmail.mockResolvedValue(user);

      expect(service.getUser({ email })).resolves.toEqual(user);
    });

    it('should throw WrongParamsError if neither username nor email provided', async () => {
      const email = undefined;
      const username = undefined;

      repository.getByEmail.mockResolvedValue(null);

      await expect(
        service.getUser({ email, name: username }),
      ).rejects.toThrowError(WrongParamsError);
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
  });
});
