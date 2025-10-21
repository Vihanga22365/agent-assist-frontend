import { Injectable, OnDestroy } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';

export interface ChatbotPayload {
  success: boolean;
  response?: unknown;
  status_code?: number;
  error?: string;
  error_type?: string;
  sessionId: string;
}

@Injectable({ providedIn: 'root' })
export class ChatbotSocketService implements OnDestroy {
  private socket?: Socket;
  private readonly stream$ = new Subject<ChatbotPayload>();
  private currentSessionId?: string;
  private readonly socketUrl = 'http://127.0.0.1:7284';

  constructor() {
    this.initializeSocket();
  }

  connect(sessionId: string): void {
    if (!sessionId) {
      throw new Error('sessionId is required to join chatbot updates');
    }

    this.currentSessionId = sessionId;
    this.initializeSocket();

    if (!this.socket) {
      return;
    }

    if (this.socket.disconnected) {
      this.socket.connect();
      return;
    }

    this.socket.emit('join', { sessionId });
  }

  disconnect(): void {
    this.currentSessionId = undefined;
    this.socket?.disconnect();
  }

  updates$(): Observable<ChatbotPayload> {
    return this.stream$.asObservable();
  }

  ngOnDestroy(): void {
    this.disconnect();
    this.stream$.complete();
  }

  private initializeSocket(): void {
    if (this.socket || typeof window === 'undefined') {
      return;
    }

    this.socket = io(this.socketUrl, {
      transports: ['websocket'],
      autoConnect: false
    });

    this.socket.on('connect', () => {
      if (this.currentSessionId) {
        this.socket?.emit('join', { sessionId: this.currentSessionId });
      }
    });

    this.socket.on('chatbot_response', (payload: ChatbotPayload) => {
      if (!payload?.sessionId || payload.sessionId !== this.currentSessionId) {
        return;
      }

      this.stream$.next(payload);
    });
  }
}
