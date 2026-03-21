import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { KycService } from './kyc.service';
import { CashfreeService } from '../cashfree/cashfree.service';

// ── SDK method mocks ───────────────────────────────────────────
const sdkMock = {
  XApiVersion:                        '2023-08-01',
  VrsOfflineAadhaarSendOtp:           jest.fn(),
  VrsOfflineAadhaarVerifyOtp:         jest.fn(),
  VrsDigilockerVerificationCreateUrl: jest.fn(),
  VrsPanVerification:                 jest.fn(),
  VrsPanAdvanceVerification:          jest.fn(),
  VrsNameMatchVerification:           jest.fn(),
  VrsReversePennyDropCreateRequest:   jest.fn(),
  VrsInitiateVKYC:                    jest.fn(),
};

const mockCf = {
  sdk:             sdkMock,
  postMultipart:   jest.fn(),
  postV2:          jest.fn(),
  handleSdkError:  jest.fn().mockImplementation((err: unknown) => { throw new InternalServerErrorException(err instanceof Error ? err.message : 'SDK error'); }),
  ping:            jest.fn(),
  sdkOptions:      jest.fn().mockReturnValue({}),
  signatureHeader: jest.fn().mockReturnValue({}),
  get environment() { return 'sandbox'; },
  get apiBaseUrl()  { return 'https://sandbox.cashfree.com/verification'; },
};

describe('KycService (SDK)', () => {
  let service: KycService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KycService,
        { provide: CashfreeService, useValue: mockCf },
      ],
    }).compile();
    service = module.get<KycService>(KycService);
  });

  // ── Aadhaar ────────────────────────────────────────────────
  describe('aadhaarSendOtp', () => {
    it('calls SDK VrsOfflineAadhaarSendOtp with stripped digits', async () => {
      sdkMock.VrsOfflineAadhaarSendOtp.mockResolvedValue({ data: { ref_id: 'REF123' } });
      const result = await service.aadhaarSendOtp({ aadhaar_number: '9999 4105 7058' });
      expect(sdkMock.VrsOfflineAadhaarSendOtp).toHaveBeenCalledWith(
        { aadhaar_number: '999941057058' },
        {},
      );
      expect(result).toEqual({ ref_id: 'REF123' });
    });

    it('rejects if not 12 digits', async () => {
      await expect(service.aadhaarSendOtp({ aadhaar_number: '12345' }))
        .rejects.toThrow(BadRequestException);
      expect(sdkMock.VrsOfflineAadhaarSendOtp).not.toHaveBeenCalled();
    });

    it('rejects non-numeric aadhaar', async () => {
      await expect(service.aadhaarSendOtp({ aadhaar_number: 'ABCDEFGHIJKL' }))
        .rejects.toThrow(BadRequestException);
    });

    it('propagates SDK errors via handleSdkError', async () => {
      const err = new InternalServerErrorException('Invalid credentials');
      sdkMock.VrsOfflineAadhaarSendOtp.mockRejectedValue(err);
      await expect(service.aadhaarSendOtp({ aadhaar_number: '999941057058' }))
        .rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('aadhaarVerifyOtp', () => {
    it('calls SDK VrsOfflineAadhaarVerifyOtp with ref_id and otp', async () => {
      sdkMock.VrsOfflineAadhaarVerifyOtp.mockResolvedValue({ data: { status: 'VALID' } });
      const result = await service.aadhaarVerifyOtp({ ref_id: 'REF123', otp: '123456' });
      expect(sdkMock.VrsOfflineAadhaarVerifyOtp).toHaveBeenCalledWith(
        { ref_id: 'REF123', otp: '123456' },
        {},
      );
      expect(result).toMatchObject({ status: 'VALID' });
    });
  });

  // ── DigiLocker ─────────────────────────────────────────────
  describe('digilockerInitiate', () => {
    it('calls SDK VrsDigilockerVerificationCreateUrl with AADHAAR doc type', async () => {
      sdkMock.VrsDigilockerVerificationCreateUrl.mockResolvedValue({ data: { url: 'https://digilocker.gov.in/...' } });
      await service.digilockerInitiate({});
      const call = sdkMock.VrsDigilockerVerificationCreateUrl.mock.calls[0][0];
      expect(call.document_requested).toContain('AADHAAR');
      expect(call.verification_id).toMatch(/^kyc-/);
    });

    it('passes redirect_url when provided', async () => {
      sdkMock.VrsDigilockerVerificationCreateUrl.mockResolvedValue({ data: {} });
      await service.digilockerInitiate({ redirect_url: 'https://myapp.com/cb' });
      const call = sdkMock.VrsDigilockerVerificationCreateUrl.mock.calls[0][0];
      expect(call.redirect_url).toBe('https://myapp.com/cb');
    });
  });

  // ── PAN ────────────────────────────────────────────────────
  describe('panLite', () => {
    it('calls SDK VrsPanVerification with pan', async () => {
      sdkMock.VrsPanVerification.mockResolvedValue({ data: { pan_status: 'VALID' } });
      await service.panLite({ pan: 'ABCDE1234F' });
      expect(sdkMock.VrsPanVerification).toHaveBeenCalledWith(
        { pan: 'ABCDE1234F' },
        undefined, undefined, {},
      );
    });

    it('rejects invalid PAN format', async () => {
      await expect(service.panLite({ pan: 'INVALID' })).rejects.toThrow(BadRequestException);
      await expect(service.panLite({ pan: 'abcde1234f' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('pan360', () => {
    it('calls SDK VrsPanAdvanceVerification with verification_id', async () => {
      sdkMock.VrsPanAdvanceVerification.mockResolvedValue({ data: { name: 'JOHN' } });
      await service.pan360({ pan: 'ABCDE1234F' });
      const call = sdkMock.VrsPanAdvanceVerification.mock.calls[0][0];
      expect(call.pan).toBe('ABCDE1234F');
      expect(call.verification_id).toMatch(/^kyc-/);
    });

    it('includes dob when provided', async () => {
      sdkMock.VrsPanAdvanceVerification.mockResolvedValue({ data: {} });
      await service.pan360({ pan: 'ABCDE1234F', dob: '1990-01-01' });
      expect(sdkMock.VrsPanAdvanceVerification.mock.calls[0][0].dob).toBe('1990-01-01');
    });
  });

  // ── PAN OCR ────────────────────────────────────────────────
  describe('panOcr', () => {
    it('uses postMultipart with front_image buffer', async () => {
      mockCf.postMultipart.mockResolvedValue({ pan_number: 'ABCDE1234F' });
      const buf = Buffer.from('fake-image');
      await service.panOcr(buf, 'image/jpeg');
      expect(mockCf.postMultipart).toHaveBeenCalledWith('/document/pan', expect.objectContaining({
        front_image: expect.objectContaining({ data: buf }),
      }));
    });
  });

  // ── Bank Account ───────────────────────────────────────────
  describe('bavSync', () => {
    it('uses postV2 (not SDK) for bank account sync', async () => {
      mockCf.postV2.mockResolvedValue({ account_status: 'ACTIVE' });
      await service.bavSync({ account_number: '123', ifsc: 'HDFC0001' });
      expect(mockCf.postV2).toHaveBeenCalledWith(
        '/verification/bank-account/sync',
        { bank_account: '123', ifsc: 'HDFC0001' },
      );
    });

    it('includes name when provided', async () => {
      mockCf.postV2.mockResolvedValue({ account_status: 'ACTIVE' });
      await service.bavSync({ account_number: '123', ifsc: 'HDFC0001', name: 'JOHN' });
      expect(mockCf.postV2.mock.calls[0][1]).toMatchObject({ name: 'JOHN' });
    });
  });

  describe('ifsc', () => {
    it('uses postV2 (not SDK) for IFSC lookup', async () => {
      mockCf.postV2.mockResolvedValue({ bank_name: 'HDFC BANK' });
      await service.ifsc({ ifsc: 'HDFC0000001' });
      expect(mockCf.postV2).toHaveBeenCalledWith('/verification/ifsc', { ifsc: 'HDFC0000001' });
    });
  });

  // ── Name Match ─────────────────────────────────────────────
  describe('nameMatch', () => {
    it('calls SDK VrsNameMatchVerification with name_1 and name_2', async () => {
      sdkMock.VrsNameMatchVerification.mockResolvedValue({ data: { score: 88 } });
      await service.nameMatch({ name1: 'Rajesh Kumar', name2: 'R Kumar' });
      const call = sdkMock.VrsNameMatchVerification.mock.calls[0][0];
      expect(call.name_1).toBe('Rajesh Kumar');
      expect(call.name_2).toBe('R Kumar');
      expect(call.verification_id).toMatch(/^kyc-/);
    });
  });

  // ── Reverse Penny Drop ─────────────────────────────────────
  describe('reversePennyDrop', () => {
    it('calls SDK VrsReversePennyDropCreateRequest with verification_id only', async () => {
      sdkMock.VrsReversePennyDropCreateRequest.mockResolvedValue({ data: { upi: 'test@upi' } });
      await service.reversePennyDrop({});
      const call = sdkMock.VrsReversePennyDropCreateRequest.mock.calls[0][0];
      expect(call.verification_id).toMatch(/^kyc-/);
      expect(call).not.toHaveProperty('account_number');
      expect(call).not.toHaveProperty('ifsc');
    });

    it('includes name when provided', async () => {
      sdkMock.VrsReversePennyDropCreateRequest.mockResolvedValue({ data: {} });
      await service.reversePennyDrop({ name: 'JOHN DOE' });
      expect(sdkMock.VrsReversePennyDropCreateRequest.mock.calls[0][0].name).toBe('JOHN DOE');
    });
  });

  // ── Biometric ──────────────────────────────────────────────
  describe('faceLiveness', () => {
    it('uses postMultipart with image buffer', async () => {
      mockCf.postMultipart.mockResolvedValue({ is_live: true });
      const buf = Buffer.from('selfie');
      await service.faceLiveness(buf, 'image/jpeg');
      expect(mockCf.postMultipart).toHaveBeenCalledWith('/face-liveness', expect.objectContaining({
        image: expect.objectContaining({ data: buf }),
      }));
    });
  });

  describe('faceMatch', () => {
    it('uses postMultipart with first_image and second_image', async () => {
      mockCf.postMultipart.mockResolvedValue({ score: 84 });
      const selfie = Buffer.from('selfie');
      const doc    = Buffer.from('doc');
      await service.faceMatch(selfie, doc);
      expect(mockCf.postMultipart).toHaveBeenCalledWith('/face-match', expect.objectContaining({
        first_image:  expect.objectContaining({ data: selfie }),
        second_image: expect.objectContaining({ data: doc }),
      }));
    });
  });

  // ── Video KYC ──────────────────────────────────────────────
  describe('vkycInitiate', () => {
    it('calls SDK VrsInitiateVKYC with user_template by default', async () => {
      sdkMock.VrsInitiateVKYC.mockResolvedValue({ data: { link: 'https://...' } });
      await service.vkycInitiate({});
      const body = sdkMock.VrsInitiateVKYC.mock.calls[0][1];
      expect(body).toHaveProperty('user_template');
      expect(body).not.toHaveProperty('agent_template');
      expect(body.verification_id).toMatch(/^kyc-/);
    });

    it('uses agent_template when agent_mode is true', async () => {
      sdkMock.VrsInitiateVKYC.mockResolvedValue({ data: {} });
      await service.vkycInitiate({ agent_mode: true });
      const body = sdkMock.VrsInitiateVKYC.mock.calls[0][1];
      expect(body).toHaveProperty('agent_template');
      expect(body).not.toHaveProperty('user_template');
    });
  });

  // ── Statement OCR ──────────────────────────────────────────
  describe('statementOcr', () => {
    it('uses postV2 (not SDK) for statement OCR', async () => {
      mockCf.postV2.mockResolvedValue({ name: 'JOHN' });
      const buf = Buffer.from('%PDF');
      await service.statementOcr(buf);
      expect(mockCf.postV2).toHaveBeenCalledWith(
        '/verification/ocr/bank-statement',
        { doc1: buf.toString('base64'), doc1_type: 'pdf' },
      );
    });
  });

  // ── Health ─────────────────────────────────────────────────
  describe('health', () => {
    it('returns ok with environment info', async () => {
      mockCf.ping.mockResolvedValue({ reachable: true, error: null });
      const result = await service.health();
      expect(result).toMatchObject({ status: 'ok', cashfree_reachable: true });
    });

    it('reports unreachable when ping fails', async () => {
      mockCf.ping.mockResolvedValue({ reachable: false, error: 'ECONNREFUSED' });
      const result = await service.health();
      expect(result.cashfree_reachable).toBe(false);
      expect(result.ping_error).toBe('ECONNREFUSED');
    });
  });
});
