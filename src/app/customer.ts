import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { RunResponse } from './models/api.models';

function resolveCustomerApiBaseUrl(): string {
  const config = (globalThis as { agentAssistConfig?: { customerApiBaseUrl?: string } }).agentAssistConfig;
  if (config?.customerApiBaseUrl) {
    return config.customerApiBaseUrl;
  }

  const fallback = 'http://127.0.0.1:7282';
  if (typeof window === 'undefined') {
    return fallback;
  }

  const protocol = window.location.protocol || 'http:';
  const hostname = window.location.hostname || '127.0.0.1';
  return `${protocol}//${hostname}:7282`;
}

interface SessionParams {
  appName: string;
  userId: string;
  sessionId: string;
}

interface RunParams extends SessionParams {
  formattedMessage: string;
  role?: 'user' | 'model';
}

@Injectable({ providedIn: 'root' })
export class CustomerApi {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = resolveCustomerApiBaseUrl();

  createSession({ appName, userId, sessionId }: SessionParams): Observable<void> {
    const url = `${this.apiBaseUrl}/apps/${appName}/users/${userId}/sessions/${sessionId}`;
    const body = {
      user_id: "U001",
      user_name: "Chathusha Wijenayake",
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
