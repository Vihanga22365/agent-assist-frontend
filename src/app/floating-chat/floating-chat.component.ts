import { Component, ElementRef, ViewChild, inject } from '@angular/core';
import { NgClass, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs/operators';

type FloatingChatRole = 'human' | 'ai' | 'system';

interface FloatingChatMessage {
  id: string;
  role: FloatingChatRole;
  author: string;
  text: string;
  time: string;
}

interface RunResponsePart {
  text?: string;
}

interface RunResponse {
  content?: {
    parts?: RunResponsePart[];
    role?: string;
  };
  partial?: boolean;
}

interface FloatingAgentReply {
  directMessages: string[];
  toHumanAgentMessages: string[];
}

@Component({
  selector: 'app-floating-chat',
  standalone: true,
  imports: [NgClass, NgFor, NgIf, FormsModule],
  templateUrl: './floating-chat.component.html',
  styleUrls: ['./floating-chat.component.scss']
})
export class FloatingChatComponent {
  @ViewChild('chatBody') chatBody?: ElementRef<HTMLDivElement>;

  isOpen = false;
  isMinimized = false;

  private readonly apiBaseUrl = 'http://localhost:8282';
  private readonly appName = 'main_agent';
  readonly userId = 'floating_human_agent';

  sessionId = this.generateSessionId();
  messages: FloatingChatMessage[] = [];
  composerInput = '';
  isCreatingSession = false;
  isSessionReady = false;
  isSendingMessage = false;
  sessionError: string | null = null;

  private messageCounter = 0;
  private readonly http = inject(HttpClient);

  toggleChat(): void {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.isMinimized = false;
      this.ensureSession();
    }
  }

  minimizeChat(): void {
    if (!this.isOpen) {
      return;
    }
    this.isMinimized = !this.isMinimized;
  }

  closeChat(): void {
    this.isOpen = false;
    this.isMinimized = false;
  }

  get canSendMessage(): boolean {
    return this.isSessionReady && !!this.composerInput.trim() && !this.isSendingMessage;
  }

  sendMessage(): void {
    const trimmed = this.composerInput.trim();
    if (!this.canSendMessage || !trimmed) {
      return;
    }

    const humanMessage: FloatingChatMessage = {
      id: this.nextMessageId('human'),
      role: 'human',
      author: 'You • Human Agent',
      text: trimmed,
      time: this.currentTime()
    };

    this.appendMessage(humanMessage);
    this.composerInput = '';
    this.isSendingMessage = true;

    const formattedMessage = JSON.stringify({ user_type: 'human_agent', message: trimmed });

    const payload = {
      appName: this.appName,
      userId: this.userId,
      sessionId: this.sessionId,
      newMessage: {
        role: 'user',
        parts: [{ text: formattedMessage }]
      }
    };

    this.http
      .post<RunResponse[]>(`${this.apiBaseUrl}/run`, payload)
      .pipe(finalize(() => (this.isSendingMessage = false)))
      .subscribe({
        next: (responses) => {
          const reply = this.extractAgentReply(responses);

          const combined = [...reply.directMessages, ...reply.toHumanAgentMessages];
          if (combined.length) {
            for (const text of combined) {
              this.appendMessage({
                id: this.nextMessageId('ai'),
                role: 'ai',
                author: 'Alex • AI Assistant',
                text,
                time: this.currentTime()
              });
            }
          }
        },
        error: (error: HttpErrorResponse) => {
          console.error('Floating chat message failed', error);
          this.appendMessage({
            id: this.nextMessageId('system'),
            role: 'system',
            author: 'System',
            text: 'Sorry, I could not send that message. Please try again.',
            time: this.currentTime()
          });
        }
      });
  }

  handleComposerEnter(event: KeyboardEvent | Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.shiftKey) {
      return;
    }
    keyboardEvent.preventDefault();
    this.sendMessage();
  }

  messageAlignment(role: FloatingChatRole): string {
    switch (role) {
      case 'human':
        return 'floating-chat__message--human';
      case 'system':
        return 'floating-chat__message--system';
      default:
        return 'floating-chat__message--ai';
    }
  }

  bubbleClasses(role: FloatingChatRole): string {
    if (role === 'system') {
      return 'floating-chat__bubble--system';
    }
    return role === 'human'
      ? 'floating-chat__bubble--human'
      : 'floating-chat__bubble--ai';
  }

  private ensureSession(): void {
    if (this.isSessionReady || this.isCreatingSession) {
      return;
    }

    this.startNewSession();
  }

  private startNewSession(): void {
    this.isCreatingSession = true;
    this.sessionError = null;
    this.sessionId = this.generateSessionId();
    this.messages = [];

    const url = `${this.apiBaseUrl}/apps/${this.appName}/users/${this.userId}/sessions/${this.sessionId}`;

    this.http
      .post<void>(url, {})
      .pipe(finalize(() => (this.isCreatingSession = false)))
      .subscribe({
        next: () => {
          this.isSessionReady = true;
        },
        error: (error: HttpErrorResponse) => {
          console.error('Floating chat session creation failed', error);
          this.sessionError = 'Unable to start the collaboration chat. Please try again.';
        }
      });
  }

  private appendMessage(message: FloatingChatMessage): void {
    this.messages = [...this.messages, message];
    queueMicrotask(() => this.scrollToBottom());
  }

  private scrollToBottom(): void {
    if (!this.chatBody) {
      return;
    }
    try {
      const element = this.chatBody.nativeElement;
      element.scrollTop = element.scrollHeight;
    } catch (error) {
      console.error('Floating chat scroll error', error);
    }
  }

  private extractAgentReply(responses: RunResponse[] | null | undefined): FloatingAgentReply {
    const result: FloatingAgentReply = {
      directMessages: [],
      toHumanAgentMessages: []
    };

    if (!responses?.length) {
      return result;
    }

    for (const item of responses) {
      const parts = item.content?.parts;
      if (!parts?.length) {
        continue;
      }

      for (const part of parts) {
        const text = part.text?.trim();
        if (!text) {
          continue;
        }

        this.parseAgentResponseSegment(text, result);
      }
    }

    if (!result.directMessages.length && !result.toHumanAgentMessages.length) {
      const fallback = responses[0]?.content?.parts?.[0]?.text?.trim();
      if (fallback) {
        result.directMessages.push(fallback);
      }
    }

    return result;
  }

  private parseAgentResponseSegment(segment: string, result: FloatingAgentReply): void {
    const fragments = this.splitResponseFragments(segment);
    if (!fragments.length) {
      return;
    }

    for (const fragment of fragments) {
      if (!this.tryParseAgentJson(fragment, result)) {
        result.directMessages.push(fragment);
      }
    }
  }

  private splitResponseFragments(segment: string): string[] {
    const fragments: string[] = [];
    let buffer = '';
    let depth = 0;
    let inString = false;
    let escapeNext = false;

    const pushBuffer = () => {
      const value = buffer.trim();
      if (value) {
        fragments.push(value);
      }
      buffer = '';
    };

    const flushIfStandalone = () => {
      if (depth === 0) {
        pushBuffer();
      }
    };

    for (const char of segment) {
      buffer += char;

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') {
          depth += 1;
        } else if (char === '}') {
          depth = Math.max(depth - 1, 0);
          if (depth === 0) {
            pushBuffer();
            continue;
          }
        } else if ((char === '\n' || char === '\r') && depth === 0) {
          buffer = buffer.slice(0, -1);
          flushIfStandalone();
          continue;
        }
      }
    }

    pushBuffer();

    return fragments;
  }

  private tryParseAgentJson(fragment: string, result: FloatingAgentReply): boolean {
    try {
      const data = JSON.parse(fragment);

      if (typeof data === 'string') {
        result.directMessages.push(data);
        return true;
      }

      if (data && typeof data === 'object') {
        const action = typeof data.action === 'string' ? data.action.toLowerCase() : undefined;

        if (action === 'direct' && typeof data.response === 'string') {
          result.directMessages.push(data.response);
          return true;
        }

        if (action === 'to_human_agent' && typeof data.response === 'string') {
          result.toHumanAgentMessages.push(data.response);
          return true;
        }

        if (typeof data.response === 'string') {
          result.directMessages.push(data.response);
          return true;
        }

        if (typeof data.message === 'string') {
          result.directMessages.push(data.message);
          return true;
        }
      }
    } catch {
      // Ignore JSON parse errors and fall back to treating fragment as plain text
    }

    return false;
  }

  private nextMessageId(prefix: string): string {
    this.messageCounter += 1;
    return `${prefix}-${Date.now()}-${this.messageCounter}`;
  }

  private currentTime(): string {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date());
  }

  private generateSessionId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }

    const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
    return template.replace(/[xy]/g, (char) => {
      const random = (Math.random() * 16) | 0;
      const value = char === 'x' ? random : (random & 0x3) | 0x8;
      return value.toString(16);
    });
  }
}
