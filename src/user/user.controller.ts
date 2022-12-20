import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserNoIdPasswordEntity } from './entities/user.entity';
import { UserService } from './user.service';

@Controller('user')
@ApiTags('user')
export class UserController {
  constructor(private userService: UserService) {}

  @Get(':username')
  async getUser(
    @Param('username') username: string,
  ): Promise<UserNoIdPasswordEntity> {
    return this.userService.getUser({ name: username });
  }
}
