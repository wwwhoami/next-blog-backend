import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserNoIdPasswordEntity } from './entities/user.entity';
import { UserService } from './user.service';

@Controller('user')
@ApiTags('user')
export class UserController {
  constructor(private userService: UserService) {}

  @Get(':username')
  async get(
    @Param('username') username: string,
  ): Promise<UserNoIdPasswordEntity> {
    const user = await this.userService.get({ name: username });

    if (!user)
      throw new NotFoundException(`User with name ${username} not found`);

    return user;
  }
}
