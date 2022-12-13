import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, User } from '@prisma/client';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaService } from 'src/prisma/prisma.service';
import { UserRepository } from '../user.repository';

export const userData = [
  {
    id: 'ab182222-5603-4b01-909b-a68fbb3a2153',
    name: 'Alice Johnson',
    email: 'alice@prisma.io',
    image: 'https://randomuser.me/api/portraits/women/12.jpg',
  },
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
      const user = userData[0] as unknown as Prisma.Prisma__UserClient<User>;
      const uuid = userData[0].id as string;

      prismaService.user.findUnique.mockResolvedValue(user);

      expect(repository.getByUuid(uuid)).resolves.toEqual(user);
    });
  });
});
