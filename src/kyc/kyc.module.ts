import { Module } from '@nestjs/common';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { CashfreeModule } from '../cashfree/cashfree.module';

@Module({
  imports: [CashfreeModule],
  controllers: [KycController],
  providers: [KycService],
})
export class KycModule {}
