import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, User } from '@prisma/client';
import { mock, MockProxy } from 'jest-mock-extended';
import { UserRepository } from '../user.repository';
import { UserService } from '../user.service';

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
    it('should get user by username', () => {
      const user = userData[0] as unknown as Prisma.Prisma__UserClient<User>;
      const username = userData[0].name;

      repository.getByName.mockResolvedValue(user);

      expect(service.getUser(username)).resolves.toEqual(user);
    });

    it('should throw NotFoundException if no user found', async () => {
      const username = 'test';

      repository.getByName.mockResolvedValue(null);

      await expect(service.getUser(username)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
