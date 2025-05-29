import { Injectable } from '@nestjs/common';
import { Session } from '@rohit-constellation/types';
import _NodeCache from 'node-cache';

const NodeCache = _NodeCache;

@Injectable()
export class SessionCacheService {
  private cache: _NodeCache;

  constructor() {
    this.cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 }); // Default TTL: 1 hour
  }

  get(sessionId: string): Session | undefined {
    console.log('SessionCacheService: Getting session from cache', sessionId);
    const session = this.cache.get<Session>(sessionId);
    console.log('SessionCacheService: Session from cache', session);
    return session;
  }

  set(session: Session): boolean {
    if (!session || !session.id) {
      console.error('SessionCacheService: Attempted to cache invalid session object', session);
      return false;
    }
    return this.cache.set<Session>(session.id, session);
  }

  del(sessionId: string): void {
    this.cache.del(sessionId);
  }

  flushAll(): void {
    this.cache.flushAll();
  }
} 