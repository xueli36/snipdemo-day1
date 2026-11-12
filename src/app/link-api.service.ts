import { isDevMode, Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ShortLink {
  code: string;
  url: string;
  shortUrl: string;
  hits: number;
  createdAt: string;
}

const API_BASE_URL = isDevMode() ? 'http://localhost:3000' : '';

@Injectable({ providedIn: 'root' })
export class LinkApiService {
  private readonly http = inject(HttpClient);

  getLinks(): Observable<ShortLink[]> {
    return this.http.get<ShortLink[]>(`${API_BASE_URL}/api/links`);
  }

  createLink(url: string): Observable<ShortLink> {
    return this.http.post<ShortLink>(`${API_BASE_URL}/api/links`, { url });
  }
}
