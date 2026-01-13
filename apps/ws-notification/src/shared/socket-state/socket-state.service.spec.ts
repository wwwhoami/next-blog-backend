import { Test, TestingModule } from '@nestjs/testing';
import { Socket } from 'socket.io';
import { SocketStateService } from './socket-state.service';

describe('SocketStateService', () => {
  let service: SocketStateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SocketStateService],
    }).compile();

    service = module.get<SocketStateService>(SocketStateService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('get', () => {
    it('should get sockets of a user', () => {
      const socket1 = { id: '1' } as Socket;
      const socket2 = { id: '2' } as Socket;

      service.add('user1', socket1);
      service.add('user2', socket2);

      expect(service.get('user1')).toContain(socket1);
      expect(service.get('user1')).not.toContain(socket2);
      expect(service.get('user2')).toContain(socket2);
      expect(service.get('user2')).not.toContain(socket1);
    });

    it('should return empty array if user has no sockets', () => {
      expect(service.get('user1123123')).toEqual([]);
    });
  });

  describe('getAll', () => {
    it('should get all sockets', () => {
      const socket1 = { id: '1' } as Socket;
      const socket2 = { id: '2' } as Socket;

      service.add('user1', socket1);
      service.add('user2', socket2);

      expect(service.getAll()).toContain(socket1);
      expect(service.getAll()).toContain(socket2);
    });

    it("should get empty array if there is no user's pool of sockets", () => {
      expect(service.getAll()).toEqual([]);
    });
  });

  describe('add', () => {
    it('should add a socket', () => {
      const socket = { id: '1' } as Socket;

      service.add('user1', socket);

      expect(service.get('user1')).toContain(socket);
    });

    it('should add multiple sockets', () => {
      const sockets: Socket[] = [{ id: '1' } as Socket, { id: '2' } as Socket];

      for (const socket of sockets) {
        service.add('user1', socket);
      }

      for (const socket of sockets) {
        expect(service.get('user1')).toContain(socket);
      }
    });
  });

  describe('remove', () => {
    it('should remove a socket', () => {
      const socket = { id: '1' } as Socket;
      service.add('user1', socket);

      service.remove('user1', socket);

      expect(service.get('user1')).not.toContain(socket);
    });

    it('should remove the specific socket, saving the rest', () => {
      const socket1 = { id: '1' } as Socket;
      const socket2 = { id: '2' } as Socket;
      service.add('user1', socket1);
      service.add('user1', socket2);

      service.remove('user1', socket1);

      expect(service.get('user1')).not.toContain(socket1);
      expect(service.get('user1')).toContain(socket2);
    });

    it("should remove user entry from state if socket was the only one in user's pool of sockets", () => {
      const socket = { id: '1' } as Socket;
      service.add('user11', socket);

      service.remove('user11', socket);

      expect(service.get('user11')).toEqual([]);
    });
  });
});
