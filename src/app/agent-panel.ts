import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { RunResponse } from './models/api.models';

function resolveAgentApiBaseUrl(): string {
  const config = (globalThis as { agentAssistConfig?: { agentPanelApiBaseUrl?: string } }).agentAssistConfig;
  if (config?.agentPanelApiBaseUrl) {
    return config.agentPanelApiBaseUrl;
  }

  const fallback = 'http://127.0.0.1:7284';
  if (typeof window === 'undefined') {
    return fallback;
  }

  const protocol = window.location.protocol || 'http:';
  const hostname = window.location.hostname || '127.0.0.1';
  return `${protocol}//${hostname}:7284`;
}

interface SessionContext {
  conversationSummary: string;
  conversationHistory: unknown;
  humanAgentQuery: string;
  previousChatbotSession: string;
}

interface SessionParams {
  appName: string;
  userId: string;
  sessionId: string;
}

interface CreateSessionParams extends SessionParams {
  context: SessionContext;
}

interface RunParams extends SessionParams {
  formattedMessage: string;
  role?: 'user' | 'model';
}

@Injectable({ providedIn: 'root' })
export class AgentPanelApi {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = resolveAgentApiBaseUrl();

  createSession({ appName, userId, sessionId, context }: CreateSessionParams): Observable<void> {
    const url = `${this.apiBaseUrl}/apps/${appName}/users/${userId}/sessions/${sessionId}`;
    const body = {
      conversation_summary: context.conversationSummary,
      conversation_history: context.conversationHistory,
      human_agent_query: context.humanAgentQuery,
      previous_chatbot_session: context.previousChatbotSession
    };

    return this.http.post<void>(url, body);
  }

  run({ appName, userId, sessionId, formattedMessage, role = 'user' }: RunParams): Observable<RunResponse[]> {
    const payload = {
      appName,
      userId,
      sessionId,
      newMessage: {
        role,
        parts: [{ text: formattedMessage }]
      }
    };

    return this.http.post<RunResponse[]>(`${this.apiBaseUrl}/run`, payload);
  }
}
