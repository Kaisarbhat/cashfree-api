import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { KycService } from '../src/kyc/kyc.service';

const mockKycService = {
  health:             jest.fn().mockResolvedValue({ status: 'ok', cashfree_reachable: true, environment: 'sandbox', ping_error: null }),
  aadhaarSendOtp:     jest.fn().mockResolvedValue({ ref_id: 'REF_E2E_001', message: 'OTP sent successfully' }),
  aadhaarVerifyOtp:   jest.fn().mockResolvedValue({ status: 'VALID', name: 'E2E User', dob: '01/01/1990' }),
  digilockerInitiate: jest.fn().mockResolvedValue({ url: 'https://digilocker.gov.in/oauth/...' }),
  panLite:            jest.fn().mockResolvedValue({ pan_status: 'VALID', name: 'E2E USER' }),
  pan360:             jest.fn().mockResolvedValue({ pan_status: 'VALID', name: 'E2E USER', dob: '01/01/1990', aadhaar_linked: true }),
  panOcr:             jest.fn().mockResolvedValue({ pan_number: 'ABCDE1234F', name: 'E2E USER' }),
  bavSync:            jest.fn().mockResolvedValue({ account_status: 'ACTIVE', account_holder_name: 'E2E USER' }),
  bavAsync:           jest.fn().mockResolvedValue({ status: 'QUEUED', reference_id: 'bav-e2e-001' }),
  ifsc:               jest.fn().mockResolvedValue({ bank_name: 'HDFC BANK', branch: 'TEST', city: 'Mumbai' }),
  reversePennyDrop:   jest.fn().mockResolvedValue({ upi: 'user@upi', name_at_bank: 'E2E USER', verification_id: 'kyc-xxx' }),
  nameMatch:          jest.fn().mockResolvedValue({ score: 88, result: 'MATCH' }),
  faceLiveness:       jest.fn().mockResolvedValue({ is_live: true, liveness_score: 0.97 }),
  faceMatch:          jest.fn().mockResolvedValue({ score: 84, result: 'MATCH' }),
  vkycInitiate:       jest.fn().mockResolvedValue({ link: 'https://verify.cashfree.com/vkyc/test' }),
  statementOcr:       jest.fn().mockResolvedValue({ name: 'E2E USER', bank_name: 'HDFC Bank', average_balance: 50000 }),
  aaConsent:          jest.fn().mockResolvedValue({ consent_id: 'AA_E2E', status: 'PENDING' }),
};

describe('KYC API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(KycService)
      .useValue(mockKycService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  // Health
  it('GET /api/kyc/health → 200', async () => {
    const res = await request(app.getHttpServer()).get('/api/kyc/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', cashfree_reachable: true });
  });

  // Aadhaar
  it('POST /api/kyc/aadhaar/send-otp → 200', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/kyc/aadhaar/send-otp')
      .send({ aadhaar_number: '999941057058' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ref_id: 'REF_E2E_001' });
  });

  it('POST /api/kyc/aadhaar/send-otp → 400 missing aadhaar_number', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/kyc/aadhaar/send-otp').send({});
    expect(res.status).toBe(400);
  });

  it('POST /api/kyc/aadhaar/verify-otp → 200', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/kyc/aadhaar/verify-otp')
      .send({ ref_id: 'REF_E2E_001', otp: '123456' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'VALID' });
  });

  it('POST /api/kyc/aadhaar/verify-otp → 400 missing otp', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/kyc/aadhaar/verify-otp').send({ ref_id: 'REF123' });
    expect(res.status).toBe(400);
  });

  // DigiLocker
  it('POST /api/kyc/digilocker/initiate → 200', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/kyc/digilocker/initiate').send({});
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('url');
  });

  // PAN
  it('POST /api/kyc/pan/lite → 200', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/kyc/pan/lite').send({ pan: 'ABCDE1234F' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ pan_status: 'VALID' });
  });

  it('POST /api/kyc/pan/lite → 400 missing pan', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/kyc/pan/lite').send({});
    expect(res.status).toBe(400);
  });

  it('POST /api/kyc/pan/360 → 200', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/kyc/pan/360').send({ pan: 'ABCDE1234F' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ aadhaar_linked: true });
  });

  // Bank
  it('POST /api/kyc/bav/sync → 200', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/kyc/bav/sync')
      .send({ account_number: '026291800001191', ifsc: 'YESB0000262' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ account_status: 'ACTIVE' });
  });

  it('POST /api/kyc/bav/sync → 400 missing ifsc', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/kyc/bav/sync').send({ account_number: '123' });
    expect(res.status).toBe(400);
  });

  it('POST /api/kyc/bav/async → 200', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/kyc/bav/async')
      .send({ account_number: '123', ifsc: 'HDFC0001', reference_id: 'my-ref' });
    expect(res.status).toBe(200);
  });

  it('POST /api/kyc/ifsc → 200', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/kyc/ifsc').send({ ifsc: 'HDFC0000001' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ bank_name: 'HDFC BANK' });
  });

  it('POST /api/kyc/reverse-penny-drop → 200', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/kyc/reverse-penny-drop').send({});
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('name_at_bank');
  });

  // Name Match
  it('POST /api/kyc/name-match → 200', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/kyc/name-match')
      .send({ name1: 'Rajesh Kumar', name2: 'R Kumar' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ score: 88, result: 'MATCH' });
  });

  it('POST /api/kyc/name-match → 400 missing name2', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/kyc/name-match').send({ name1: 'Only One' });
    expect(res.status).toBe(400);
  });

  // Video KYC
  it('POST /api/kyc/vkyc/initiate → 200', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/kyc/vkyc/initiate').send({});
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('link');
  });

  // AA
  it('POST /api/kyc/aa/consent → 200', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/kyc/aa/consent').send({ mobile: '+919876543210' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('consent_id');
  });

  // File uploads
  it('POST /api/kyc/pan/ocr → 400 no file', async () => {
    const res = await request(app.getHttpServer()).post('/api/kyc/pan/ocr');
    expect(res.status).toBe(400);
  });

  it('POST /api/kyc/pan/ocr → 200 with image', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/kyc/pan/ocr')
      .attach('image', Buffer.from('fake-image'), { filename: 'pan.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('pan_number');
  });

  it('POST /api/kyc/face/liveness → 400 no file', async () => {
    const res = await request(app.getHttpServer()).post('/api/kyc/face/liveness');
    expect(res.status).toBe(400);
  });

  it('POST /api/kyc/face/liveness → 200 with image', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/kyc/face/liveness')
      .attach('image', Buffer.from('fake-selfie'), { filename: 'selfie.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ is_live: true });
  });

  it('POST /api/kyc/statement → 400 no file', async () => {
    const res = await request(app.getHttpServer()).post('/api/kyc/statement');
    expect(res.status).toBe(400);
  });

  it('POST /api/kyc/statement → 400 non-PDF', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/kyc/statement')
      .attach('statement', Buffer.from('not-pdf'), { filename: 'doc.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });

  it('POST /api/kyc/statement → 200 with PDF', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/kyc/statement')
      .attach('statement', Buffer.from('%PDF-1.4'), { filename: 'stmt.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('name');
  });
});
