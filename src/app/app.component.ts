import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule, HttpErrorResponse } from '@angular/common/http';
import { Observable, Subscription, of, throwError } from 'rxjs';
import { catchError, finalize, map, shareReplay, switchMap } from 'rxjs/operators';
import { FloatingChatComponent } from './floating-chat/floating-chat.component';
import { CustomerChatComponent } from './customer-chat/customer-chat.component';
import { AgentPanelComponent } from './agent-panel/agent-panel.component';
import { AgentAiMessage, ChatMessage } from './models/chat.models';
import { RunResponse } from './models/api.models';
import { CustomerApi } from './customer';
import { AgentPanelApi } from './agent-panel';
import { ChatbotPayload, ChatbotSocketService } from './chatbot-socket.service';

interface AgentReplyResult {
  directMessages: string[];
  transferSummaries: string[];
}
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, HttpClientModule, CustomerChatComponent, AgentPanelComponent, FloatingChatComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly appName = 'main_agent';
  readonly userId = 'chathusha';

  sessionId = this.generateSessionId();
  customerThread: ChatMessage[] = [];
  showAgentPanel = false;
  agentTransferSummary: string | null = null;
  showAgentSummary = false;
  showAgentHistory = false;
  composerInput = '';
  agentComposerInput = '';
  isCreatingSession = false;
  isSessionReady = false;
  isSendingMessage = false;
  sessionError: string | null = null;
  isAssistantThinking = false;
  isAgentAiThinking = false;
  private agentAiSessionId: string | null = null;
  private isCreatingAgentSession = false;
  private pendingAgentSession$?: Observable<string>;
  private chatbotUpdatesSub?: Subscription;

  private messageCounter = 0;

  readonly assistantName = 'Alex';
  readonly customerName = 'Chathusha Wijenayake';
  readonly humanAgentName = 'Udara Dharmasena';
  private readonly customerApi = inject(CustomerApi);
  private readonly agentPanelApi = inject(AgentPanelApi);
  private readonly chatbotSocket = inject(ChatbotSocketService);

  ngOnInit(): void {
    this.chatbotUpdatesSub = this.chatbotSocket
      .updates$()
      .subscribe((payload) => this.handleChatbotSocketPayload(payload));
    this.startNewSession();
  }

  ngOnDestroy(): void {
    this.chatbotUpdatesSub?.unsubscribe();
    this.chatbotSocket.disconnect();
  }

  // Agent-side thread mirrors the customer conversation for quick context once transferred
  agentThread: ChatMessage[] = [];
  agentAiThread: AgentAiMessage[] = [];
  showAgentAiChat = false;

  startNewSession(): void {
    const newSessionId = this.generateSessionId();
    this.sessionId = newSessionId;
    this.customerThread = [];
    this.agentThread = [];
    this.agentAiThread = [];
    this.showAgentPanel = false;
    this.agentTransferSummary = null;
    this.showAgentSummary = false;
    this.showAgentHistory = false;
    this.showAgentAiChat = false;
    this.composerInput = '';
    this.agentComposerInput = '';
    this.isSessionReady = false;
    this.isCreatingSession = true;
    this.sessionError = null;
    this.isAssistantThinking = false;
    this.isAgentAiThinking = false;
    this.agentAiSessionId = null;
    this.isCreatingAgentSession = false;
    this.pendingAgentSession$ = undefined;
    this.chatbotSocket.connect(newSessionId);

    this.customerApi
      .createSession({ appName: this.appName, userId: this.userId, sessionId: newSessionId })
      .pipe(finalize(() => (this.isCreatingSession = false)))
      .subscribe({
        next: () => {
          this.isSessionReady = true;
        },
        error: (error: HttpErrorResponse) => {
          this.sessionError = 'Unable to start a new session. Please try again.';
          console.error('Session creation failed', error);
        }
      });
  }

  sendCustomerMessage(): void {
    const trimmed = this.composerInput.trim();
    if (!trimmed || this.isSendingMessage || !this.isSessionReady) {
      return;
    }

    const userMessage: ChatMessage = {
      id: this.nextMessageId('user'),
      role: 'customer',
      author: this.customerName,
      time: this.currentTime(),
      text: trimmed
    };

    this.appendMessage(userMessage);
    this.composerInput = '';
    this.isSendingMessage = true;
    this.isAssistantThinking = true;

    const formattedMessage = this.formatUserMessage(trimmed);

    this.customerApi
      .run({
        appName: this.appName,
        userId: this.userId,
        sessionId: this.sessionId,
        formattedMessage,
        role: 'user'
      })
      .pipe(finalize(() => {
        this.isSendingMessage = false;
        this.isAssistantThinking = false;
      }))
      .subscribe({
        next: (responses: RunResponse[]) => {
          const reply = this.extractAgentReply(responses);
          this.handleAgentReplyResult(reply);
        },
        error: (error: HttpErrorResponse) => {
          console.error('Chat request failed', error);
          this.appendMessage({
            id: this.nextMessageId('assistant'),
            role: 'assistant',
            author: `${this.assistantName} • AI Assistant`,
            time: this.currentTime(),
            text: 'Sorry, I ran into a problem sending that message. Please try again.'
          });
        }
      });
  }

  private appendMessage(message: ChatMessage): void {
    const updated = [...this.customerThread, message];
    this.customerThread = updated;
    if (this.showAgentPanel) {
      this.agentThread = updated;
    }
  }

  private appendAgentAiMessage(message: AgentAiMessage): void {
    this.agentAiThread = [...this.agentAiThread, message];
  }

  private handleChatbotSocketPayload(payload: ChatbotPayload): void {
    if (!payload || payload.sessionId !== this.sessionId) {
      return;
    }

    if (!payload.success) {
      if (payload.error) {
        console.error('Chatbot socket error', payload.error);
      }
      return;
    }

    const response = payload.response;
    let handled = false;

    if (this.isRunResponseArray(response)) {
      const reply = this.extractAgentReply(response);
      this.handleAgentReplyResult(reply);
      handled = true;
    } else if (this.isRunResponse(response)) {
      const reply = this.extractAgentReply([response]);
      this.handleAgentReplyResult(reply);
      handled = true;
    } else {
      const messages = this.extractSocketResponses(response);
      if (messages.length) {
        const reply: AgentReplyResult = {
          directMessages: messages,
          transferSummaries: []
        };
        this.handleAgentReplyResult(reply);
        handled = true;
      }
    }

    if (handled) {
      this.isAssistantThinking = false;
      this.isSendingMessage = false;
    }
  }

  private handleAgentReplyResult(reply: AgentReplyResult): void {
    if (reply.directMessages.length) {
      for (const messageText of reply.directMessages) {
        const trimmed = messageText?.trim();
        if (!trimmed || this.isHumanAgentAiPayload(trimmed)) {
          continue;
        }

        const lastMessage = this.customerThread[this.customerThread.length - 1];
        if (lastMessage?.role === 'assistant' && lastMessage.text === trimmed) {
          continue;
        }

        this.appendMessage({
          id: this.nextMessageId('assistant'),
          role: 'assistant',
          author: `${this.assistantName} • AI Assistant`,
          time: this.currentTime(),
          text: trimmed
        });
      }
    }

    if (reply.transferSummaries.length) {
      const latestSummary = reply.transferSummaries[reply.transferSummaries.length - 1];
      const previous = this.customerThread[this.customerThread.length - 1];
      if (previous?.role !== 'system' || previous.text !== 'I’m consulting a Human Supervisor, Give me a few moments.') {
        const transferMessage: ChatMessage = {
          id: this.nextMessageId('system'),
          role: 'system',
          author: `${this.assistantName} • System`,
          time: this.currentTime(),
          text: 'I’m consulting a Human Supervisor, Give me a few moments.'
        };
        this.appendMessage(transferMessage);
      }

      this.agentTransferSummary = latestSummary ?? null;
      this.agentThread = [...this.customerThread];
      this.showAgentPanel = true;
      if (!this.showAgentSummary && !this.showAgentHistory && !this.showAgentAiChat) {
        this.showAgentSummary = true;
      }
    }
  }

  private extractSocketResponses(response: unknown): string[] {
    if (response == null) {
      return [];
    }

    if (typeof response === 'string') {
      const trimmed = response.trim();
      return trimmed ? [trimmed] : [];
    }

    if (Array.isArray(response)) {
      return response.flatMap((item) => this.extractSocketResponses(item));
    }

    if (typeof response === 'object') {
      const data = response as Record<string, unknown>;
      const result: string[] = [];

      const keys: (keyof typeof data)[] = ['text', 'message', 'response'];
      for (const key of keys) {
        if (key in data) {
          const value = data[key];
          if (value && value === response) {
            continue;
          }
          result.push(...this.extractSocketResponses(value));
        }
      }

      const messagesValue = data['messages'];
      if (messagesValue && messagesValue !== response) {
        result.push(...this.extractSocketResponses(messagesValue));
      }

      const contentValue = data['content'];
      if (contentValue && contentValue !== response) {
        result.push(...this.extractSocketResponses(contentValue));
      }

      const partsValue = data['parts'];
      if (partsValue && partsValue !== response) {
        result.push(...this.extractSocketResponses(partsValue));
      }

      return result;
    }

    return [];
  }

  private isRunResponse(value: unknown): value is RunResponse {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const candidate = value as Partial<RunResponse>;
    return 'content' in candidate || 'partial' in candidate;
  }

  private isRunResponseArray(value: unknown): value is RunResponse[] {
    return Array.isArray(value) && value.every((item) => this.isRunResponse(item));
  }

  private extractAgentReply(responses: RunResponse[] | null | undefined): AgentReplyResult {
    const result: AgentReplyResult = {
      directMessages: [],
      transferSummaries: []
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

    if (!result.directMessages.length && !result.transferSummaries.length) {
      const fallback = responses[0]?.content?.parts?.[0]?.text?.trim();
      if (fallback && !this.isHumanAgentAiPayload(fallback)) {
        result.directMessages.push(fallback);
      }
    }

    return result;
  }

  private extractAgentPanelReply(responses: RunResponse[] | null | undefined): string {
    // Agent panel responses (port 8284) come as plain text/markdown, not JSON
    if (!responses?.length) {
      return '';
    }

    const messages: string[] = [];

    for (const item of responses) {
      const parts = item.content?.parts;
      if (!parts?.length) {
        continue;
      }

      for (const part of parts) {
        const text = part.text?.trim();
        if (text) {
          messages.push(text);
        }
      }
    }

    return messages.join('\n\n');
  }

  private parseAgentResponseSegment(segment: string, result: AgentReplyResult): void {
    const fragments = this.splitResponseFragments(segment);
    if (!fragments.length) {
      return;
    }

    for (const fragment of fragments) {
      if (!this.tryParseAgentJson(fragment, result) && !this.isHumanAgentAiPayload(fragment)) {
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

  // Only used for customer panel responses (port 8282) which come as JSON strings
  // Agent panel responses (port 8284) are plain text/markdown and handled separately
  private tryParseAgentJson(fragment: string, result: AgentReplyResult): boolean {
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

        if (action === 'transfer') {
          if (typeof data.response === 'string') {
            result.directMessages.push(data.response);
          }
          if (typeof data.summary === 'string') {
            result.transferSummaries.push(data.summary);
          }
          return true;
        }

        // Handle to_human_agent action
        if (action === 'to_human_agent' && typeof data.response === 'string') {
          if (!this.showAgentPanel) {
            this.showAgentPanel = true;
            this.agentThread = [...this.customerThread];
          }

          // Ensure the collaborative panel is visible so agents notice new guidance
          this.showAgentSummary = false;
          this.showAgentHistory = false;
          this.showAgentAiChat = true;

          const aiMessage: AgentAiMessage = {
            id: this.nextMessageId('ai-to-human'),
            role: 'ai_agent',
            author: `${this.assistantName} • AI Assistant`,
            time: this.currentTime(),
            text: data.response
          };

          this.appendAgentAiMessage(aiMessage);

          return true;
        }

        if (typeof data.response === 'string') {
          result.directMessages.push(data.response);
          return true;
        }

        if (typeof data.summary === 'string') {
          result.transferSummaries.push(data.summary);
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

  private formatUserMessage(message: string): string {
    return JSON.stringify({ user_type: 'bank_customer', message });
  }

  toggleAgentSummary(): void {
    this.showAgentSummary = true;
    this.showAgentHistory = false;
    this.showAgentAiChat = false;
  }

  toggleAgentHistory(): void {
    this.showAgentSummary = false;
    this.showAgentHistory = true;
    this.showAgentAiChat = false;
  }

  toggleAgentAiChat(): void {
    this.showAgentSummary = false;
    this.showAgentHistory = false;
    this.showAgentAiChat = true;
  }

  sendAgentMessage(): void {
    const trimmed = this.agentComposerInput.trim();
    if (!this.showAgentPanel || !trimmed) {
      return;
    }

    const agentAiMessage: AgentAiMessage = {
      id: this.nextMessageId('human-to-ai'),
      role: 'human_agent',
      author: `${this.humanAgentName} • Human Agent`,
      time: this.currentTime(),
      text: trimmed
    };

    this.showAgentSummary = false;
    this.showAgentHistory = false;
    this.showAgentAiChat = true;

    this.appendAgentAiMessage(agentAiMessage);

    const formattedMessage = JSON.stringify({ user_type: 'human_agent', message: trimmed });

    this.isAgentAiThinking = true;

    this.ensureAgentSession(trimmed)
      .pipe(
        switchMap((sessionId) =>
          this.agentPanelApi.run({
            appName: this.appName,
            userId: this.userId,
            sessionId,
            formattedMessage,
            role: 'user'
          })
        ),
        finalize(() => {
          this.isAgentAiThinking = false;
        })
      )
      .subscribe({
        next: (responses: RunResponse[]) => {
          // Agent panel responses come as plain text/markdown, not JSON
          const messageText = this.extractAgentPanelReply(responses);

          if (messageText) {
            const aiMessage: AgentAiMessage = {
              id: this.nextMessageId('ai-to-human'),
              role: 'ai_agent',
              author: `${this.assistantName} • AI Assistant`,
              time: this.currentTime(),
              text: messageText
            };

            this.appendAgentAiMessage(aiMessage);
          }
        },
        error: (error: HttpErrorResponse) => {
          console.error('Human agent message failed', error);
          this.appendAgentAiMessage({
            id: this.nextMessageId('ai-error'),
            role: 'ai_agent',
            author: `${this.assistantName} • AI Assistant`,
            time: this.currentTime(),
            text: 'Sorry, I could not process that request. Please try again.'
          });
        }
      });

    this.agentComposerInput = '';
  }

  private ensureAgentSession(humanAgentQuery: string): Observable<string> {
    if (this.agentAiSessionId) {
      return of(this.agentAiSessionId);
    }

    if (this.pendingAgentSession$) {
      return this.pendingAgentSession$;
    }

    const sessionId = this.generateSessionId();
    this.isCreatingAgentSession = true;

    // Transform conversation history to only include role and message for 8284 API
    const conversationHistory = this.customerThread.map(msg => ({
      role: msg.role,
      message: msg.text
    }));

    const context = {
      conversationSummary: this.agentTransferSummary?.trim() || 'No summary provided.',
      conversationHistory: conversationHistory,
      humanAgentQuery,
      previousChatbotSession: this.sessionId
    };

    const create$ = this.agentPanelApi
      .createSession({
        appName: this.appName,
        userId: this.userId,
        sessionId,
        context
      })
      .pipe(
        map(() => {
          this.agentAiSessionId = sessionId;
          return sessionId;
        }),
        catchError((error) => {
          this.agentAiSessionId = null;
          console.error('Agent session creation failed', error);
          return throwError(() => error);
        }),
        finalize(() => {
          this.isCreatingAgentSession = false;
          this.pendingAgentSession$ = undefined;
        })
      );

    this.pendingAgentSession$ = create$.pipe(shareReplay(1));

    return this.pendingAgentSession$;
  }

  private isHumanAgentAiPayload(value: string): boolean {
    const trimmed = value?.trim();
    if (!trimmed) {
      return false;
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && typeof parsed.action === 'string') {
        return parsed.action.toLowerCase() === 'to_human_agent';
      }
    } catch {
      // Ignore parse errors; the caller will treat this as a normal message
    }

    return false;
  }
}
