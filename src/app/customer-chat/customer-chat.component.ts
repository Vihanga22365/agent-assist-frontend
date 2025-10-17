import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MarkdownPipe } from '../markdown.pipe';
import { ChatMessage } from '../models/chat.models';

@Component({
  selector: 'app-customer-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, MarkdownPipe],
  templateUrl: './customer-chat.component.html',
  styleUrls: ['./customer-chat.component.scss']
})
export class CustomerChatComponent implements OnChanges {
  @Input() sessionId = '';
  @Input() customerThread: ChatMessage[] = [];
  @Input() isCreatingSession = false;
  @Input() isSessionReady = false;
  @Input() isSendingMessage = false;
  @Input() sessionError: string | null = null;
  @Input() customerName = '';
  @Input() assistantName = '';
  @Input() composerInput = '';
  @Input() isAssistantThinking = false;

  @Output() startSession = new EventEmitter<void>();
  @Output() composerInputChange = new EventEmitter<string>();
  @Output() sendMessage = new EventEmitter<void>();

  @ViewChild('customerChatContainer') customerChatContainer?: ElementRef<HTMLDivElement>;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['customerThread'] || changes['isAssistantThinking']) {
      this.queueScroll();
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

  handleEnter(event: KeyboardEvent | Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.shiftKey) {
      return;
    }

    keyboardEvent.preventDefault();
    this.sendMessage.emit();
  }

  get canSendMessage(): boolean {
    return this.isSessionReady && !this.isSendingMessage && !!this.composerInput.trim();
  }

  private queueScroll(): void {
    queueMicrotask(() => {
      try {
        const element = this.customerChatContainer?.nativeElement;
        if (element) {
          element.scrollTop = element.scrollHeight;
        }
      } catch (error) {
        console.error('Customer chat scroll error', error);
      }
    });
  }
}
