import { Injectable } from '@nestjs/common';
import { Socket } from 'socket.io';

@Injectable()
export class SocketStateService {
  private socketState = new Map<string, Socket[]>([]);

  remove(userId: string, socket: Socket) {
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

  add(userId: string, socket: Socket) {
    const existingSockets = this.socketState.get(userId) ?? [];

    this.socketState.set(userId, [...existingSockets, socket]);
  }

  get(userId: string): Socket[] {
    return this.socketState.get(userId) ?? [];
  }

  getAll(): Socket[] {
    return Array.from(this.socketState.values()).flat();
  }
}
