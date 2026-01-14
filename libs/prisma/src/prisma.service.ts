import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PinoLogger } from 'nestjs-pino';
import { Pool } from 'pg';
import { Prisma, PrismaClient } from 'prisma/generated/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor(
    private configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
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

    this.logger.setContext(PrismaService.name);
  }

  async onModuleInit() {
    this.$on('query' as never, (e: Prisma.QueryEvent) => {
      e.query = e.query.replace(/(\n|\t|\s)+/g, ' ');
      this.logger.info(e, `PrismaClient:Query +${e.duration}ms`);
    });

    this.$on('error' as never, (e: Prisma.LogEvent) => {
      this.logger.error(e.message, e.target, 'PrismaClient:Error');
    });

    this.$on('info' as never, (e: Prisma.LogEvent) => {
      this.logger.info(e, 'PrismaClient:Info');
    });

    this.$on('warn' as never, (e: Prisma.LogEvent) => {
      this.logger.warn(e, 'PrismaClient:Warn');
    });

    await this.$connect();
    await this.$queryRaw`SET pg_trgm.similarity_threshold = 0.3`;
  }
}
