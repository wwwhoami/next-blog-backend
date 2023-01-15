import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma, User } from '@prisma/client';
import { mock, MockProxy } from 'jest-mock-extended';
import { UserController } from '../user.controller';
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

      await expect(controller.get(username)).rejects.toThrowError(
        NotFoundException,
      );
    });
  });
});
