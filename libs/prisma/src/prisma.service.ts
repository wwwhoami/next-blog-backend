import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { Prisma, PrismaClient } from 'prisma/generated/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor(private readonly configService: ConfigService) {
    const connectionString = configService.get<string>('POSTGRES_URL');
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);

    super({
      adapter,
      log: [
        {
          emit: 'event',
          level: 'query',
        },
        {
          emit: 'event',
          level: 'error',
        },
        {
          emit: 'event',
          level: 'info',
        },
        {
          emit: 'event',
          level: 'warn',
        },
      ],
    });
  }

  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    // Only log Prisma queries in non-testing environments
    if (process.env.NODE_ENV !== 'testing') {
      this.$on('query' as never, (e: Prisma.QueryEvent) => {
        e.query = e.query.replace(/(\n|\t|\s)+/g, ' ');
        this.logger.log(e, `PrismaClient:Query +${e.duration}ms`);
      });

      this.$on('error' as never, (e: Prisma.LogEvent) => {
        this.logger.error(e.message, e.target, 'PrismaClient:Error');
      });

      this.$on('info' as never, (e: Prisma.LogEvent) => {
        this.logger.verbose(e, 'PrismaClient:Info');
      });

      this.$on('warn' as never, (e: Prisma.LogEvent) => {
        this.logger.warn(e, 'PrismaClient:Warn');
      });
    }

    await this.$connect();
    await this.$queryRaw`SET pg_trgm.similarity_threshold = 0.3`;
  }
}
