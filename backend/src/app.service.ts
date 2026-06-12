import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      data: {
        status: 'ok',
        service: 'ocr-metal-core-washing-api',
        timestamp: new Date().toISOString(),
      },
    };
  }
}
