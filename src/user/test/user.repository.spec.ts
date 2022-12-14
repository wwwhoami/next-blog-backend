import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, User } from '@prisma/client';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaService } from 'src/prisma/prisma.service';
import { UserRepository } from '../user.repository';

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
      const user = userDataWithId as unknown as Prisma.Prisma__UserClient<User>;
      const uuid = userDataWithId.id as string;

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

  describe('createUser', () => {
    it('should create user returning his data', () => {
      const userToCreate = { ...userData[0], password: 'password' };
      const createdUser =
        userData[0] as unknown as Prisma.Prisma__UserClient<User>;

      prismaService.user.create.mockResolvedValue(createdUser);

      expect(repository.createUser(userToCreate)).resolves.toEqual(createdUser);
    });
  });
});
