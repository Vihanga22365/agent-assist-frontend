import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { RunResponse } from './models/api.models';

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
  private readonly apiBaseUrl = 'http://localhost:8282';

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
