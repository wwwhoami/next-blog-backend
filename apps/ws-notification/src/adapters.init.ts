import { AppAuthService } from '@app/auth/app-auth.service';
import { INestApplication } from '@nestjs/common';
import { RedisPropagatorService } from './shared/redis-propagator/redis-propagator.service';
import { SocketStateAdapter } from './shared/socket-state/socket-state.adapter';
import { SocketStateService } from './shared/socket-state/socket-state.service';

export const initAdapters = (app: INestApplication): INestApplication => {
  const socketStateService = app.get(SocketStateService);
  const redisPropagatorService = app.get(RedisPropagatorService);
  const authService = app.get(AppAuthService);

  app.useWebSocketAdapter(
    new SocketStateAdapter(
      app,
      socketStateService,
      redisPropagatorService,
      authService,
    ),
  );

  return app;
};
