import { AppAuthService } from '@app/auth';
import { AuthUser } from '@app/auth/types';
import { INestApplicationContext, WebSocketAdapter } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server, ServerOptions, Socket } from 'socket.io';
import { ExtendedError } from 'socket.io/dist/namespace';
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
    private readonly authService: AppAuthService,
  ) {
    super(app);
  }

  /**
   *
   * @param socket Socket to be authenticated
   * @param next Next middleware
   * @description
   * Middleware to authenticate a socket
   * If the socket is authenticated, the user is added to the socket state
   * If the socket is not authenticated, the socket is not added to the socket state
   */
  private async authMiddleware(
    socket: AuthenticatedSocket,
    next: (err?: ExtendedError | undefined) => void,
  ) {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token ||
      socket.handshake.headers?.authorization;

    if (!token) {
      socket.auth = null;
      return next();
    }

    try {
      socket.auth = await this.authService.validateAccessToken(token);
      return next();
    } catch (error) {
      return next(new Error('Invalid auth token'));
    }
  }

  /**
   * @param port Port to be used
   * @param options Server options
   * @description Create a new socket server
   * @returns Server
   * @override IoAdapter.createIOServer
   */
  public create(port: number, options: ServerOptions): Server {
    const server: Server = super.createIOServer(port, options);
    this.redisPropagatorService.injectSocketServer(server);

    server.use(this.authMiddleware);

    return server;
  }

  /**
   * @param server Server to be bound
   * @param callback Callback to be executed on connection
   * @description Bind a callback to be executed on connection
   * @override IoAdapter.bindClientConnect
   */
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
