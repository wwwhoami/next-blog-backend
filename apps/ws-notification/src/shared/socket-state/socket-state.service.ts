import { Injectable } from '@nestjs/common';
import { Socket } from 'socket.io';

@Injectable()
export class SocketStateService {
  // userId -> Socket[]
  private socketState = new Map<string, Socket[]>([]);

  /**
   * @param userId
   * @description Get all sockets of a user
   */
  get(userId: string): Socket[] {
    return this.socketState.get(userId) ?? [];
  }

  /**
   * @description Get all sockets
   */
  getAll(): Socket[] {
    return Array.from(this.socketState.values()).flat();
  }

  /**
   *
   * @param userId
   * @param socket Socket to be added to the pool of user's sockets
   */
  add(userId: string, socket: Socket): void {
    const existingSockets = this.socketState.get(userId) ?? [];

    this.socketState.set(userId, [...existingSockets, socket]);
  }

  /**
   *
   * @param userId
   * @param socket Socket to be removed from the pool of user's sockets
   */
  remove(userId: string, socket: Socket): void {
    const existingSockets = this.socketState.get(userId);

    if (!existingSockets) {
      return;
    }

    const sockets = existingSockets.filter((s) => s.id !== socket.id);

    if (sockets.length === 0) {
      this.socketState.delete(userId);
    } else {
      this.socketState.set(userId, sockets);
    }
  }
}
