import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MarkdownPipe } from '../markdown.pipe';
import { AgentAiMessage, AgentAiRole, ChatMessage } from '../models/chat.models';

@Component({
  selector: 'app-agent-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, MarkdownPipe],
  templateUrl: './agent-panel.component.html',
  styleUrls: ['./agent-panel.component.scss']
})
export class AgentPanelComponent implements OnChanges, OnDestroy {
  @Input() showAgentPanel = false;
  @Input() humanAgentName = '';
  @Input() assistantName = '';
  @Input() agentTransferSummary: string | null = null;
  @Input() showAgentSummary = false;
  @Input() agentThread: ChatMessage[] = [];
  @Input() showAgentHistory = false;
  @Input() agentAiThread: AgentAiMessage[] = [];
  @Input() showAgentAiChat = false;
  @Input() agentComposerInput = '';
  @Input() isAgentAiThinking = false;

  @Output() toggleSummary = new EventEmitter<void>();
  @Output() toggleHistory = new EventEmitter<void>();
  @Output() toggleAgentAiChat = new EventEmitter<void>();
  @Output() agentComposerInputChange = new EventEmitter<string>();
  @Output() sendAgentMessage = new EventEmitter<void>();

  @ViewChild('agentAiChatContainer') agentAiChatContainer?: ElementRef<HTMLDivElement>;

  private resizeObserver?: ResizeObserver;
  sidebarCollapsed = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['showAgentPanel'] && !changes['showAgentPanel'].currentValue) {
      this.sidebarCollapsed = false;
    }

    if ((changes['agentAiThread'] || changes['showAgentAiChat'] || changes['isAgentAiThinking']) && this.showAgentAiChat) {
      this.queueAgentScroll();
      this.setupResizeObserver();
    }
  }

  ngOnDestroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  toggleSidebar(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    if (!this.sidebarCollapsed && this.showAgentAiChat) {
      this.queueAgentScroll();
    }
  }

  alignment(role: ChatMessage['role']): string {
    if (role === 'system') {
      return 'justify-center text-center';
    }
    return role === 'customer' ? 'justify-end text-left' : 'justify-start text-left';
  }

  bubbleClasses(role: ChatMessage['role']): string {
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

  agentAiAlignment(role: AgentAiRole): string {
    return role === 'human_agent' ? 'justify-end text-left' : 'justify-start text-left';
  }

  agentAiBubbleClasses(role: AgentAiRole): string {
    return role === 'human_agent'
      ? 'bg-blue-600 border-blue-600 text-white shadow-md'
      : 'bg-white border-slate-200 text-slate-900 shadow-sm';
  }

  handleAgentEnter(event: KeyboardEvent | Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.shiftKey) {
      return;
    }

    keyboardEvent.preventDefault();
    this.sendAgentMessage.emit();
  }

  get canSendAgentAiMessage(): boolean {
    return this.showAgentPanel && !!this.agentComposerInput.trim();
  }

  get activeWorkspaceTitle(): string {
    if (this.showAgentAiChat) {
      return 'Human Agent · AI Assistant';
    }

    if (this.showAgentHistory) {
      return 'Conversation History';
    }

    if (this.showAgentSummary) {
      return 'Conversation Summary';
    }

    return 'Workspace';
  }

  private queueAgentScroll(): void {
    // Use setTimeout for better mobile compatibility
    setTimeout(() => {
      try {
        const element = this.agentAiChatContainer?.nativeElement;
        if (element) {
          // Use scrollTo for better mobile support
          element.scrollTo({
            top: element.scrollHeight,
            behavior: 'smooth'
          });
        }
      } catch (error) {
        // Fallback for older browsers
        try {
          const element = this.agentAiChatContainer?.nativeElement;
          if (element) {
            element.scrollTop = element.scrollHeight;
          }
        } catch (fallbackError) {
          console.error('Agent AI chat scroll error', error, fallbackError);
        }
      }
    }, 100); // Small delay for mobile rendering
  }

  private setupResizeObserver(): void {
    if (!this.agentAiChatContainer?.nativeElement || this.resizeObserver) {
      return;
    }

    try {
      this.resizeObserver = new ResizeObserver(() => {
        // Scroll to bottom when container size changes (mobile keyboard, etc.)
        this.queueAgentScroll();
      });

      this.resizeObserver.observe(this.agentAiChatContainer.nativeElement);
    } catch (error) {
      console.warn('ResizeObserver not supported', error);
    }
  }
}
