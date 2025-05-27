import { Module } from '@nestjs/common';
import { SessionCacheService } from './session-cache.service';

@Module({
  providers: [SessionCacheService],
  exports: [SessionCacheService],
})
export class SessionCacheModule {} 