import { GetUser } from '@core/src/auth/decorators/get-user.decorator';
import { AccessTokenGuard } from '@core/src/common/guards/access-token.guard';
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
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserFollower } from './entities/user-follower.entity';
import { UserNoPasswordEntity } from './entities/user.entity';
import { UserService } from './user.service';

@Controller('user')
@ApiTags('user')
export class UserController {
  constructor(private userService: UserService) {}

  @Get(':username')
  @ApiOkResponse({ description: 'User returned.', type: UserNoPasswordEntity })
  @ApiNotFoundResponse({ description: 'No user matches the username.' })
  @ApiOperation({ summary: 'Get a user by username' })
  async get(
    @Param('username') username: string,
  ): Promise<UserNoPasswordEntity> {
    const user = await this.userService.get({ name: username }, { id: true });

    if (!user)
      throw new NotFoundException(`User with name ${username} not found`);

    return user;
  }

  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard)
  @Post('follow/:followingId')
  @ApiCreatedResponse({
    description: 'Follow relationship created.',
    type: UserFollower,
  })
  @ApiBadRequestResponse({ description: 'The target user ID must be a UUID.' })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing, invalid, or expired.',
  })
  @ApiNotFoundResponse({ description: 'The target user does not exist.' })
  @ApiConflictResponse({ description: 'You already follow this user.' })
  @ApiOperation({ summary: 'Follow a user' })
  follow(
    @GetUser('id') userId: string,
    @Param('followingId', ParseUUIDPipe) followingId: string,
  ): Promise<UserFollower> {
    return this.userService.follow(userId, followingId);
  }

  @ApiBearerAuth('accessToken')
  @UseGuards(AccessTokenGuard)
  @Delete('follow/:followingId')
  @ApiOkResponse({
    description: 'Follow relationship removed.',
    type: UserFollower,
  })
  @ApiBadRequestResponse({ description: 'The target user ID must be a UUID.' })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing, invalid, or expired.',
  })
  @ApiNotFoundResponse({
    description: 'The target user is missing or you do not follow them.',
  })
  @ApiOperation({ summary: 'Unfollow a user' })
  unfollow(
    @GetUser('id') userId: string,
    @Param('followingId', ParseUUIDPipe) followingId: string,
  ): Promise<UserFollower> {
    return this.userService.unfollow(userId, followingId);
  }

  @Get(':userId/followers')
  @ApiOkResponse({
    description: 'Followers returned.',
    type: [UserNoPasswordEntity],
  })
  @ApiBadRequestResponse({ description: 'The user ID must be a UUID.' })
  @ApiOperation({ summary: 'List a user’s followers' })
  getFollowers(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<UserNoPasswordEntity[]> {
    return this.userService.getFollowers(userId, { id: true });
  }

  @Get(':userId/following')
  @ApiOkResponse({
    description: 'Followed users returned.',
    type: [UserNoPasswordEntity],
  })
  @ApiBadRequestResponse({ description: 'The user ID must be a UUID.' })
  @ApiOperation({ summary: 'List accounts a user follows' })
  getFollowing(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<UserNoPasswordEntity[]> {
    return this.userService.getFollowing(userId, { id: true });
  }
}
