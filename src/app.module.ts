import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KycModule } from './kyc/kyc.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    KycModule,
  ],
})
export class AppModule {}
