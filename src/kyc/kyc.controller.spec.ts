import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';

const mockKyc = {
  health:             jest.fn(),
  aadhaarSendOtp:     jest.fn(),
  aadhaarVerifyOtp:   jest.fn(),
  digilockerInitiate: jest.fn(),
  panLite:            jest.fn(),
  pan360:             jest.fn(),
  panOcr:             jest.fn(),
  bavSync:            jest.fn(),
  bavAsync:           jest.fn(),
  ifsc:               jest.fn(),
  reversePennyDrop:   jest.fn(),
  nameMatch:          jest.fn(),
  faceLiveness:       jest.fn(),
  faceMatch:          jest.fn(),
  vkycInitiate:       jest.fn(),
  statementOcr:       jest.fn(),
  aaConsent:          jest.fn(),
};

describe('KycController', () => {
  let controller: KycController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [KycController],
      providers: [{ provide: KycService, useValue: mockKyc }],
    }).compile();
    controller = module.get<KycController>(KycController);
  });

  it('health() returns service result', async () => {
    mockKyc.health.mockResolvedValue({ status: 'ok', cashfree_reachable: true });
    expect(await controller.health()).toMatchObject({ status: 'ok' });
  });

  it('aadhaarSendOtp() delegates to service', async () => {
    mockKyc.aadhaarSendOtp.mockResolvedValue({ ref_id: 'REF123' });
    const result = await controller.aadhaarSendOtp({ aadhaar_number: '999941057058' });
    expect(mockKyc.aadhaarSendOtp).toHaveBeenCalledWith({ aadhaar_number: '999941057058' });
    expect(result).toEqual({ ref_id: 'REF123' });
  });

  it('aadhaarVerifyOtp() delegates to service', async () => {
    mockKyc.aadhaarVerifyOtp.mockResolvedValue({ status: 'VALID' });
    await controller.aadhaarVerifyOtp({ ref_id: 'REF123', otp: '123456' });
    expect(mockKyc.aadhaarVerifyOtp).toHaveBeenCalledWith({ ref_id: 'REF123', otp: '123456' });
  });

  it('panLite() delegates to service', async () => {
    mockKyc.panLite.mockResolvedValue({ pan_status: 'VALID' });
    await controller.panLite({ pan: 'ABCDE1234F' });
    expect(mockKyc.panLite).toHaveBeenCalledWith({ pan: 'ABCDE1234F' });
  });

  it('pan360() delegates to service', async () => {
    mockKyc.pan360.mockResolvedValue({ name: 'JOHN' });
    await controller.pan360({ pan: 'ABCDE1234F' });
    expect(mockKyc.pan360).toHaveBeenCalledWith({ pan: 'ABCDE1234F' });
  });

  it('panOcr() throws 400 when no file', async () => {
    await expect(controller.panOcr(undefined as any)).rejects.toThrow(BadRequestException);
    expect(mockKyc.panOcr).not.toHaveBeenCalled();
  });

  it('panOcr() calls service with buffer and mimetype', async () => {
    mockKyc.panOcr.mockResolvedValue({ pan_number: 'ABCDE1234F' });
    const file = { buffer: Buffer.from('img'), mimetype: 'image/jpeg' } as Express.Multer.File;
    await controller.panOcr(file);
    expect(mockKyc.panOcr).toHaveBeenCalledWith(file.buffer, 'image/jpeg');
  });

  it('bavSync() delegates to service', async () => {
    mockKyc.bavSync.mockResolvedValue({ account_status: 'ACTIVE' });
    await controller.bavSync({ account_number: '123', ifsc: 'HDFC0001' });
    expect(mockKyc.bavSync).toHaveBeenCalledWith({ account_number: '123', ifsc: 'HDFC0001' });
  });

  it('ifsc() delegates to service', async () => {
    mockKyc.ifsc.mockResolvedValue({ bank_name: 'HDFC' });
    await controller.ifsc({ ifsc: 'HDFC0000001' });
    expect(mockKyc.ifsc).toHaveBeenCalledWith({ ifsc: 'HDFC0000001' });
  });

  it('reversePennyDrop() delegates to service', async () => {
    mockKyc.reversePennyDrop.mockResolvedValue({ name_at_bank: 'JOHN' });
    await controller.reversePennyDrop({});
    expect(mockKyc.reversePennyDrop).toHaveBeenCalled();
  });

  it('nameMatch() delegates to service', async () => {
    mockKyc.nameMatch.mockResolvedValue({ score: 88 });
    await controller.nameMatch({ name1: 'John', name2: 'J. Doe' });
    expect(mockKyc.nameMatch).toHaveBeenCalledWith({ name1: 'John', name2: 'J. Doe' });
  });

  it('faceLiveness() throws 400 when no file', async () => {
    await expect(controller.faceLiveness(undefined as any)).rejects.toThrow(BadRequestException);
  });

  it('faceLiveness() calls service with buffer and mimetype', async () => {
    mockKyc.faceLiveness.mockResolvedValue({ is_live: true });
    const file = { buffer: Buffer.from('img'), mimetype: 'image/jpeg' } as Express.Multer.File;
    await controller.faceLiveness(file);
    expect(mockKyc.faceLiveness).toHaveBeenCalledWith(file.buffer, 'image/jpeg');
  });

  it('faceMatch() throws 400 when files missing', async () => {
    await expect(controller.faceMatch({})).rejects.toThrow(BadRequestException);
    await expect(controller.faceMatch({ selfie: [] })).rejects.toThrow(BadRequestException);
  });

  it('statement() throws 400 when no file', async () => {
    await expect(controller.statement(undefined as any)).rejects.toThrow(BadRequestException);
  });

  it('statement() throws 400 for non-PDF', async () => {
    const file = { buffer: Buffer.from('img'), mimetype: 'image/jpeg' } as Express.Multer.File;
    await expect(controller.statement(file)).rejects.toThrow(BadRequestException);
  });

  it('statement() calls service for PDF', async () => {
    mockKyc.statementOcr.mockResolvedValue({ name: 'JOHN' });
    const file = { buffer: Buffer.from('%PDF'), mimetype: 'application/pdf' } as Express.Multer.File;
    await controller.statement(file);
    expect(mockKyc.statementOcr).toHaveBeenCalledWith(file.buffer);
  });

  it('vkycInitiate() delegates to service', async () => {
    mockKyc.vkycInitiate.mockResolvedValue({ session_id: 'VKYC123' });
    await controller.vkycInitiate({ customer_name: 'John', customer_mobile: '+91999' });
    expect(mockKyc.vkycInitiate).toHaveBeenCalled();
  });

  it('aaConsent() delegates to service', async () => {
    mockKyc.aaConsent.mockResolvedValue({ consent_id: 'AA123' });
    await controller.aaConsent({ mobile: '+91999' });
    expect(mockKyc.aaConsent).toHaveBeenCalledWith({ mobile: '+91999' });
  });
});
