import { Injectable, NotFoundException } from '@nestjs/common';
import { UserEntity } from './entities/user.entity';
import { UserRepository } from './user.repository';

@Injectable()
export class UserService {
  constructor(private userRepository: UserRepository) {}

  async getUser(username: string): Promise<UserEntity> {
    const user = await this.userRepository.getByName(username);

    if (!user)
      throw new NotFoundException(`User with name ${username} not found`);

    return user;
  }
}
