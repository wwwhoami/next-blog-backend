import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AppAuthService } from './app-auth.service';

@Module({
  providers: [AppAuthService],
  exports: [AppAuthService],
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('ACCESS_JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<number>('ACCESS_JWT_EXPIRATION'),
        },
      }),
    }),
  ],
})
export class AppAuthModule {}
