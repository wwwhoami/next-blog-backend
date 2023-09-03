import { Module } from '@nestjs/common';
import { redisProviders } from '@app/shared/redis';
import { RedisService } from './redis.service';

@Module({
  providers: [...redisProviders, RedisService],
  exports: [...redisProviders, RedisService],
})
export class RedisModule {}
