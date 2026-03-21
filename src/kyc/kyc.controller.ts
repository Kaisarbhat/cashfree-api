import {
  Controller,
  Post,
  Get,
  Body,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  BadRequestException,
  HttpCode,
} from '@nestjs/common';
import {
  FileInterceptor,
  FileFieldsInterceptor,
} from '@nestjs/platform-express';
import { KycService } from './kyc.service';
import {
  AadhaarSendOtpDto,
  AadhaarVerifyOtpDto,
  DigilockerInitiateDto,
  PanVerifyDto,
  BavSyncDto,
  BavAsyncDto,
  IfscDto,
  ReversePennyDropDto,
  NameMatchDto,
  VkycInitiateDto,
  AaConsentDto,
} from './kyc.dto';

@Controller('kyc')
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @Get('health')
  health() {
    return this.kyc.health();
  }

  @Post('aadhaar/send-otp')
  @HttpCode(200)
  aadhaarSendOtp(@Body() dto: AadhaarSendOtpDto) {
    return this.kyc.aadhaarSendOtp(dto);
  }

  @Post('aadhaar/verify-otp')
  @HttpCode(200)
  aadhaarVerifyOtp(@Body() dto: AadhaarVerifyOtpDto) {
    return this.kyc.aadhaarVerifyOtp(dto);
  }

  @Post('digilocker/initiate')
  @HttpCode(200)
  digilockerInitiate(@Body() dto: DigilockerInitiateDto) {
    return this.kyc.digilockerInitiate(dto);
  }

  @Post('pan/lite')
  @HttpCode(200)
  panLite(@Body() dto: PanVerifyDto) {
    return this.kyc.panLite(dto);
  }

  @Post('pan/360')
  @HttpCode(200)
  pan360(@Body() dto: PanVerifyDto) {
    return this.kyc.pan360(dto);
  }

  @Post('pan/ocr')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('image', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async panOcr(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('image file is required');
    return this.kyc.panOcr(file.buffer, file.mimetype);
  }

  @Post('bav/sync')
  @HttpCode(200)
  bavSync(@Body() dto: BavSyncDto) {
    return this.kyc.bavSync(dto);
  }

  @Post('bav/async')
  @HttpCode(200)
  bavAsync(@Body() dto: BavAsyncDto) {
    return this.kyc.bavAsync(dto);
  }

  @Post('ifsc')
  @HttpCode(200)
  ifsc(@Body() dto: IfscDto) {
    return this.kyc.ifsc(dto);
  }

  @Post('reverse-penny-drop')
  @HttpCode(200)
  reversePennyDrop(@Body() dto: ReversePennyDropDto) {
    return this.kyc.reversePennyDrop(dto);
  }

  @Post('name-match')
  @HttpCode(200)
  nameMatch(@Body() dto: NameMatchDto) {
    return this.kyc.nameMatch(dto);
  }

  @Post('face/liveness')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('image', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  async faceLiveness(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('image file is required');
    return this.kyc.faceLiveness(file.buffer, file.mimetype);
  }

  @Post('face/match')
  @HttpCode(200)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'selfie', maxCount: 1 },
        { name: 'document', maxCount: 1 },
      ],
      { limits: { fileSize: 10 * 1024 * 1024 } },
    ),
  )
  async faceMatch(
    @UploadedFiles()
    files: {
      selfie?: Express.Multer.File[];
      document?: Express.Multer.File[];
    },
  ) {
    if (!files?.selfie?.[0] || !files?.document?.[0])
      throw new BadRequestException('selfie and document images are required');
    return this.kyc.faceMatch(files.selfie[0].buffer, files.document[0].buffer);
  }

  @Post('vkyc/initiate')
  @HttpCode(200)
  vkycInitiate(@Body() dto: VkycInitiateDto) {
    return this.kyc.vkycInitiate(dto);
  }

  @Post('statement')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('statement', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  async statement(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('statement PDF is required');
    if (file.mimetype !== 'application/pdf')
      throw new BadRequestException('Only PDF files are accepted');
    return this.kyc.statementOcr(file.buffer);
  }

  @Post('aa/consent')
  @HttpCode(200)
  aaConsent(@Body() dto: AaConsentDto) {
    return this.kyc.aaConsent(dto);
  }
}
