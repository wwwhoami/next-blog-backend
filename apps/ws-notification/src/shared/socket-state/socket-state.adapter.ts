import { AppAuthService } from '@app/auth';
import { AuthUser } from '@app/auth/types';
import { INestApplicationContext, WebSocketAdapter } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server, ServerOptions, Socket } from 'socket.io';
import { RedisPropagatorService } from '../redis-propagator/redis-propagator.service';
import { SocketStateService } from './socket-state.service';

export type AuthenticatedSocket = Socket & {
  auth: AuthUser | null;
};

export class SocketStateAdapter extends IoAdapter implements WebSocketAdapter {
  constructor(
    private readonly app: INestApplicationContext,
    private readonly socketStateService: SocketStateService,
    private readonly redisPropagatorService: RedisPropagatorService,
    private readonly aurhService: AppAuthService,
  ) {
    super(app);
  }

  create(port: number, options: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    this.redisPropagatorService.injectSocketServer(server);

    server.use(async (socket: AuthenticatedSocket, next) => {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token ||
        socket.handshake.headers?.authorization;

      if (!token) {
        socket.auth = null;
        return next();
      }

      try {
        socket.auth = await this.aurhService.validateAccessToken(token);
        return next();
      } catch (error) {
        return next(new Error('Invalid auth token'));
      }
    });

    return server;
  }

  public bindClientConnect(
    server: Server,
    callback: (socket: AuthenticatedSocket) => void,
  ): void {
    server.on('connection', (socket: AuthenticatedSocket) => {
      if (socket.auth) this.socketStateService.add(socket.auth.id, socket);

      socket.on('disconnect', () => {
        if (socket.auth) {
          this.socketStateService.remove(socket.auth.id, socket);
        }

        socket.removeAllListeners('disconnect');
      });

      callback(socket);
    });
  }
}
