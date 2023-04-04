import {
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { AccessTokenGuard } from 'src/common/guards/access-token.guard';
import { UserNoPasswordEntity } from './entities/user.entity';
import { UserService } from './user.service';

@Controller('user')
@ApiTags('user')
export class UserController {
  constructor(private userService: UserService) {}

  @Get(':username')
  async get(
    @Param('username') username: string,
  ): Promise<UserNoPasswordEntity> {
    const user = await this.userService.get({ name: username }, { id: true });

    if (!user)
      throw new NotFoundException(`User with name ${username} not found`);

    return user;
  }

  @UseGuards(AccessTokenGuard)
  @Post('follow/:followingId')
  follow(
    @GetUser('id') userId: string,
    @Param('followingId', ParseUUIDPipe) followingId: string,
  ): Promise<{ followerId: string; followingId: string }> {
    return this.userService.follow(userId, followingId);
  }

  @UseGuards(AccessTokenGuard)
  @Delete('follow/:followingId')
  unfollow(
    @GetUser('id') userId: string,
    @Param('followingId', ParseUUIDPipe) followingId: string,
  ): Promise<{ followerId: string; followingId: string }> {
    return this.userService.unfollow(userId, followingId);
  }

  @Get(':userId/followers')
  getFollowers(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<UserNoPasswordEntity[]> {
    return this.userService.getFollowers(userId, { id: true });
  }

  @Get(':userId/following')
  getFollowing(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<UserNoPasswordEntity[]> {
    return this.userService.getFollowing(userId, { id: true });
  }
}
