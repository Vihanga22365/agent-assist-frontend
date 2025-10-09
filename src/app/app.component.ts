import { Component, OnInit, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule, HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs/operators';
import { MarkdownPipe } from './markdown.pipe';

type ChatRole = 'customer' | 'assistant' | 'agent' | 'system';

interface ChatMessage {
  id: string;
  role: ChatRole;
  author: string;
  time: string;
  text: string;
  highlights?: string[];
}

interface SummaryPoint {
  label: string;
  value: string;
  tone?: 'positive' | 'neutral' | 'warning';
}

interface SuggestionCard {
  id: string;
  title: string;
  detail: string;
  impact: string;
  accent: 'primary' | 'success' | 'warning';
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

interface AgentReplyResult {
  directMessages: string[];
  transferSummaries: string[];
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NgClass, FormsModule, HttpClientModule, MarkdownPipe],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  private readonly apiBaseUrl = 'http://localhost:8282';
  private readonly appName = 'main_agent';
  readonly userId = 'chathusha';

  sessionId = this.generateSessionId();
  customerThread: ChatMessage[] = [];
  showAgentPanel = false;
  agentTransferSummary: string | null = null;
  showAgentSummary = false;
  composerInput = '';
  agentComposerInput = '';
  isCreatingSession = false;
  isSessionReady = false;
  isSendingMessage = false;
  sessionError: string | null = null;

  private messageCounter = 0;

  readonly assistantName = 'Alex';
  readonly customerName = 'Chathusha Wijenayake';
  readonly humanAgentName = 'Udara Dharmasena';

  readonly escalationRisk = 0.26;
  readonly csatPrediction = 0.92;

  private readonly http = inject(HttpClient);

  ngOnInit(): void {
    this.startNewSession();
  }

  get canSendMessage(): boolean {
    return !!this.composerInput.trim() && this.isSessionReady && !this.isSendingMessage;
  }

  // Agent-side thread mirrors the customer conversation for quick context once transferred
  agentThread: ChatMessage[] = [];

  readonly summaryHeadline = 'Customer preparing for an executive client workshop tomorrow';

  readonly summaryNarrative = `Amelia is traveling to a studio at 1pm and needs the Skyline overnight bag on-site before then. She has been calm but anxious. Delivering a proactive confirmation and waiving the expedite fee will reinforce trust.`;

  readonly summaryPoints: SummaryPoint[] = [
    { label: 'Goal', value: 'Secure delivery by 12:00 PM' },
    { label: 'Order', value: '#7824-903A • Skyline Overnight Bag' },
    { label: 'Sentiment', value: 'Concerned but collaborative', tone: 'warning' }
  ];

  readonly statusBadges: SummaryPoint[] = [
    { label: 'Priority', value: 'High touch', tone: 'warning' },
    { label: 'SLA', value: 'Due in 12 minutes', tone: 'neutral' },
    { label: 'Channel', value: 'Live concierge chat', tone: 'positive' }
  ];

  readonly agentSuggestions: SuggestionCard[] = [
    {
      id: 's1',
      title: 'Confirm warehouse pickup & courier voucher',
      detail: 'Call Valentina to lock the 10am pickup, then apply loyalty credit so the customer sees a $0 expedite fee.',
      impact: 'Builds confidence and protects CSAT',
      accent: 'primary'
    },
    {
      id: 's2',
      title: 'Send proactive confirmation message',
      detail: 'Share the new delivery window, courier name, and contact details in one concise message before the customer asks.',
      impact: 'Reduces repeat follow-ups',
      accent: 'success'
    },
    {
      id: 's3',
      title: 'Add arrival alert & fragile handling note',
      detail: 'Ask courier to text 15 minutes prior and mark package as fragile to avoid delays at the studio.',
      impact: 'Prevents missed hand-off',
      accent: 'warning'
    }
  ];

  readonly quickReplies: string[] = [
    'Confirm new delivery window for Amelia',
    'Share courier contact & arrival protocol',
    'Offer to text a recap once confirmed'
  ];

  readonly knowledgeTags = ['Expedite policy', 'Tier 2 loyalty perks', 'Courier coordination'];

  bubbleClasses(role: ChatRole): string {
    switch (role) {
      case 'customer':
        return 'bg-slate-900 border-slate-900 text-white shadow-lg';
      case 'agent':
        return 'bg-white border-slate-200 text-slate-900 shadow-md';
      case 'system':
        return 'bg-rose-50 border-rose-200 text-rose-700';
      default:
        return 'bg-slate-100 border-slate-200 text-slate-800';
    }
  }

  alignment(role: ChatRole): string {
    if (role === 'system') {
      return 'justify-center text-center';
    }
    return role === 'customer' ? 'justify-end text-left' : 'justify-start text-left';
  }

  toneBadgeClass(point: SummaryPoint): string {
    switch (point.tone) {
      case 'warning':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'positive':
        return 'bg-green-50 text-green-700 border-green-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  }

  suggestionAccent(card: SuggestionCard): string {
    switch (card.accent) {
      case 'success':
        return 'bg-green-50 border-green-200 text-green-700';
      case 'warning':
        return 'bg-amber-50 border-amber-200 text-amber-700';
      default:
        return 'bg-blue-50 border-blue-200 text-blue-700';
    }
  }

  startNewSession(): void {
    const newSessionId = this.generateSessionId();
    this.sessionId = newSessionId;
    this.customerThread = [];
    this.agentThread = [];
    this.showAgentPanel = false;
    this.agentTransferSummary = null;
    this.showAgentSummary = false;
    this.composerInput = '';
    this.agentComposerInput = '';
    this.isSessionReady = false;
    this.isCreatingSession = true;
    this.sessionError = null;

    const url = `${this.apiBaseUrl}/apps/${this.appName}/users/${this.userId}/sessions/${newSessionId}`;

    this.http
      .post<void>(url, {})
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

    const formattedMessage = this.formatUserMessage(trimmed);

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

          if (reply.directMessages.length) {
            for (const messageText of reply.directMessages) {
              this.appendMessage({
                id: this.nextMessageId('assistant'),
                role: 'assistant',
                author: `${this.assistantName} • AI Assistant`,
                time: this.currentTime(),
                text: messageText
              });
            }
          }

          if (reply.transferSummaries.length) {
            const latestSummary = reply.transferSummaries[reply.transferSummaries.length - 1];
            const transferMessage: ChatMessage = {
              id: this.nextMessageId('system'),
              role: 'system',
              author: `${this.assistantName} • System`,
              time: this.currentTime(),
              text: 'You have been transferred to a human agent for further assistance.'
            };
            this.appendMessage(transferMessage);

            // Expose summary and history to the Human Agent panel
            this.agentTransferSummary = latestSummary ?? null;
            this.agentThread = [...this.customerThread];
            this.showAgentPanel = true;
          }
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

  handleComposerEnter(event: KeyboardEvent | Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.shiftKey) {
      return;
    }

    keyboardEvent.preventDefault();
    this.sendCustomerMessage();
  }

  private appendMessage(message: ChatMessage): void {
    const updated = [...this.customerThread, message];
    this.customerThread = updated;
    if (this.showAgentPanel) {
      this.agentThread = updated;
    }
  }

  private appendAgentMessage(message: ChatMessage): void {
    this.agentThread = [...this.agentThread, message];
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
      if (fallback) {
        result.directMessages.push(fallback);
      }
    }

    return result;
  }

  private parseAgentResponseSegment(segment: string, result: AgentReplyResult): void {
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
          // Check if this is a reply to a human agent message or a new customer message
          const isReplyToHumanAgent = this.agentThread.length > 0 && 
            this.agentThread[this.agentThread.length - 1].role === 'agent';
          
          if (isReplyToHumanAgent) {
            // This is an AI reply to human agent message - show in agent thread as assistant message
            const aiReplyMessage: ChatMessage = {
              id: this.nextMessageId('ai-reply-to-agent'),
              role: 'assistant',
              author: `${this.assistantName} • AI Assistant`,
              time: this.currentTime(),
              text: data.response
            };
            this.appendAgentMessage(aiReplyMessage);
          } else {
            // This is a customer message to human agent
            const agentMessage: ChatMessage = {
              id: this.nextMessageId('customer-to-agent'),
              role: 'customer',
              author: `${this.customerName} • Customer`,
              time: this.currentTime(),
              text: data.response
            };
            this.appendAgentMessage(agentMessage);
          }
          
          // Show agent panel if not already visible
          if (!this.showAgentPanel) {
            this.showAgentPanel = true;
          }
          
          // Don't show this message to customer - it's handled separately
          // Return true to prevent it from being added to directMessages
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
    this.showAgentSummary = !this.showAgentSummary;
  }


  get canSendAgentMessage(): boolean {
    return this.showAgentPanel && !!this.agentComposerInput.trim();
  }

  sendAgentMessage(): void {
    const trimmed = this.agentComposerInput.trim();
    if (!this.showAgentPanel || !trimmed) {
      return;
    }

    // Create agent message for agent thread only
    const agentMessage: ChatMessage = {
      id: this.nextMessageId('agent'),
      role: 'agent',
      author: `${this.humanAgentName} • Human Agent`,
      time: this.currentTime(),
      text: trimmed
    };

    // Add to agent thread only (not customer thread)
    this.appendAgentMessage(agentMessage);

    // Send formatted message to backend
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
      .subscribe({
        next: (responses) => {
          const reply = this.extractAgentReply(responses);

          if (reply.directMessages.length) {
            for (const messageText of reply.directMessages) {
              this.appendMessage({
                id: this.nextMessageId('assistant'),
                role: 'assistant',
                author: `${this.assistantName} • AI Assistant`,
                time: this.currentTime(),
                text: messageText
              });
            }
          }
        },
        error: (error: HttpErrorResponse) => {
          console.error('Human agent message failed', error);
        }
      });

    this.agentComposerInput = '';
  }

  handleAgentEnter(event: KeyboardEvent | Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.shiftKey) {
      return;
    }
    keyboardEvent.preventDefault();
    this.sendAgentMessage();
  }
}
