import { Injectable, BadRequestException } from '@nestjs/common';
import { CashfreeService } from '../cashfree/cashfree.service';
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

interface CashfreeCreateUserResponse {
  user_reference_id: number;
  user_id: string;
}

/** Short unique verification_id required by most Cashfree Secure ID endpoints */
function vid(): string {
  return `kyc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

@Injectable()
export class KycService {
  constructor(private readonly cf: CashfreeService) {}

  /** Unwrap SDK AxiosResponse and return .data, or rethrow as 500 */
  private async call<T>(fn: () => Promise<{ data: T }>): Promise<T> {
    try {
      const res = await fn();
      return res.data;
    } catch (err) {
      this.cf.handleSdkError(err);
    }
  }

  // ── Aadhaar ────────────────────────────────────────────────
  async aadhaarSendOtp(dto: AadhaarSendOtpDto) {
    const digits = dto.aadhaar_number.replace(/\s/g, '');
    if (!/^\d{12}$/.test(digits))
      throw new BadRequestException('aadhaar_number must be 12 digits');
    return this.call(() =>
      this.cf.sdk.VrsOfflineAadhaarSendOtp(
        { aadhaar_number: digits },
        this.cf.sdkOptions(),
      ),
    );
  }

  async aadhaarVerifyOtp(dto: AadhaarVerifyOtpDto) {
    return this.call(() =>
      this.cf.sdk.VrsOfflineAadhaarVerifyOtp(
        { ref_id: dto.ref_id, otp: dto.otp },
        this.cf.sdkOptions(),
      ),
    );
  }

  // ── DigiLocker ─────────────────────────────────────────────
  async digilockerInitiate(dto: DigilockerInitiateDto) {
    return this.call(() =>
      this.cf.sdk.VrsDigilockerVerificationCreateUrl(
        {
          verification_id: vid(),
          document_requested: ['AADHAAR'],
          ...(dto.redirect_url ? { redirect_url: dto.redirect_url } : {}),
        },
        undefined,
        this.cf.sdkOptions(),
      ),
    );
  }

  // ── PAN ────────────────────────────────────────────────────
  async panLite(dto: PanVerifyDto) {
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(dto.pan))
      throw new BadRequestException('Invalid PAN format (expected ABCDE1234F)');
    return this.call(() =>
      this.cf.sdk.VrsPanVerification(
        { pan: dto.pan },
        undefined,
        undefined,
        this.cf.sdkOptions(),
      ),
    );
  }

  async pan360(dto: PanVerifyDto) {
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(dto.pan))
      throw new BadRequestException('Invalid PAN format (expected ABCDE1234F)');
    return this.call(() =>
      this.cf.sdk.VrsPanAdvanceVerification(
        {
          pan: dto.pan,
          verification_id: vid(),
          ...(dto.dob ? { dob: dto.dob } : {}),
        },
        undefined,
        this.cf.sdkOptions(),
      ),
    );
  }

  async panOcr(imageBuffer: Buffer, mimeType: string) {
    const ext = mimeType === 'image/png' ? 'png' : 'jpg';
    return this.cf.postMultipart('/document/pan', {
      verification_id: vid(),
      front_image: { data: imageBuffer, mimeType, filename: `pan.${ext}` },
    });
  }

  // ── Bank Account (NOT in SDK — raw v2) ─────────────────────
  async bavSync(dto: BavSyncDto) {
    return this.cf.postV2('/verification/bank-account/sync', {
      bank_account: dto.account_number,
      ifsc: dto.ifsc,
      ...(dto.name ? { name: dto.name } : {}),
    });
  }

  async bavAsync(dto: BavAsyncDto) {
    return this.cf.postV2('/verification/bank-account/async', {
      bank_account: dto.account_number,
      ifsc: dto.ifsc,
      reference_id: dto.reference_id ?? `bav-${Date.now()}`,
      ...(dto.name ? { name: dto.name } : {}),
    });
  }

  async ifsc(dto: IfscDto) {
    return this.cf.postV2('/verification/ifsc', { ifsc: dto.ifsc });
  }

  // ── Reverse Penny Drop ─────────────────────────────────────
  async reversePennyDrop(dto: ReversePennyDropDto) {
    return this.call(() =>
      this.cf.sdk.VrsReversePennyDropCreateRequest(
        {
          verification_id: vid(),
          ...(dto.name ? { name: dto.name } : {}),
        },
        this.cf.sdkOptions(),
      ),
    );
  }

  // ── Name Match ─────────────────────────────────────────────
  async nameMatch(dto: NameMatchDto) {
    return this.call(() =>
      this.cf.sdk.VrsNameMatchVerification(
        {
          verification_id: vid(),
          name_1: dto.name1,
          name_2: dto.name2,
        },
        undefined,
        this.cf.sdkOptions(),
      ),
    );
  }

  // ── Face Liveness (multipart) ──────────────────────────────
  async faceLiveness(imageBuffer: Buffer, mimeType: string) {
    return this.cf.postMultipart('/face-liveness', {
      verification_id: vid(),
      image: { data: imageBuffer, mimeType, filename: 'selfie.jpg' },
    });
  }

  // ── Face Match (multipart) ─────────────────────────────────
  async faceMatch(selfieBuffer: Buffer, docBuffer: Buffer) {
    return this.cf.postMultipart('/face-match', {
      verification_id: vid(),
      first_image: {
        data: selfieBuffer,
        mimeType: 'image/jpeg',
        filename: 'selfie.jpg',
      },
      second_image: {
        data: docBuffer,
        mimeType: 'image/jpeg',
        filename: 'document.jpg',
      },
    });
  }

  async createVkycUser(dto: {
    phone: string;
    name?: string;
    email?: string;
  }): Promise<CashfreeCreateUserResponse> {
    return this.cf.postV2('/verification/user', {
      phone: dto.phone,
      user_id: `u_${dto.phone}${Date.now()}`,
      name: dto.name,
    });
  }

  // ── Video KYC ──────────────────────────────────────────────
  async vkycInitiate(dto: VkycInitiateDto) {
    // Step 1 — Create or fetch user
    const userResp = await this.createVkycUser({
      phone: dto.customer_mobile as string,
      name: dto.customer_name,
    });

    const userReferenceId = userResp.user_reference_id;
    const userId = userResp.user_id;

    return this.call(() =>
      this.cf.sdk.VrsInitiateVKYC(
        '2024-12-01',
        {
          verification_id: vid(),
          user_reference_id: userReferenceId,
          user_id: userId,
          ...(dto.agent_mode
            ? { user_template: 'user_template' }
            : { agent_template: 'user_template' }),
        },
        undefined,
        this.cf.sdkOptions(),
      ),
    );
  }

  // ── Statement OCR (NOT in SDK — raw v2) ────────────────────
  async statementOcr(pdfBuffer: Buffer) {
    return this.cf.postV2('/verification/ocr/bank-statement', {
      doc1: pdfBuffer.toString('base64'),
      doc1_type: 'pdf',
    });
  }

  // ── Account Aggregator (NOT in SDK — raw v2) ───────────────
  async aaConsent(dto: AaConsentDto) {
    return this.cf.postV2('/verification/account-aggregator/consent', {
      mobile: dto.mobile,
      consent_types: ['TRANSACTIONS', 'PROFILE', 'SUMMARY'],
      fi_types: ['DEPOSIT'],
      date_range: dto.period ?? 'LAST_6_MONTHS',
    });
  }

  // ── Health ─────────────────────────────────────────────────
  async health() {
    const ping = await this.cf.ping();
    return {
      status: 'ok',
      environment: this.cf.environment,
      base_url: this.cf.apiBaseUrl,
      sdk_version: 'cashfree-verification@4.0.1',
      api_version: '2024-12-01',
      cashfree_reachable: ping.reachable,
      ping_error: ping.error,
    };
  }
}
