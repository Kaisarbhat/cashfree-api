import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CashfreeService } from './cashfree.service';
import { Cashfree, CFEnvironment } from 'cashfree-verification';
import axios from 'axios';
import * as crypto from 'crypto';

// Mock axios and cashfree-verification at module level
jest.mock('axios');
jest.mock('cashfree-verification', () => ({
  Cashfree: {
    VrsPanVerification: jest.fn(),
    XClientId: '',
    XClientSecret: '',
    XApiVersion: '',
    XEnvironment: 1,
    XEnableErrorAnalytics: false,
  },
  CFEnvironment: { SANDBOX: 1, PRODUCTION: 2 },
}));

// Mock the entire fs module so existsSync is configurable
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn(),
}));

import * as fs from 'fs';
const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedAxios = axios as jest.Mocked<typeof axios>;

const makeConfig = (env = 'sandbox', keyPath = '') => ({
  get: (k: string, def?: string) => {
    const m: Record<string, string> = {
      CASHFREE_ENV: env,
      CASHFREE_PUBLIC_KEY_PATH: keyPath,
    };
    return m[k] ?? def;
  },
  getOrThrow: (k: string) => {
    const m: Record<string, string> = {
      CASHFREE_CLIENT_ID: 'TEST_CLIENT_ID',
      CASHFREE_CLIENT_SECRET: 'TEST_SECRET',
    };
    if (!m[k]) throw new Error(`Missing ${k}`);
    return m[k];
  },
});

describe('CashfreeService', () => {
  let service: CashfreeService;

  beforeEach(async () => {
    jest.clearAllMocks();
    (mockedFs.existsSync as jest.Mock).mockReturnValue(false);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashfreeService,
        { provide: ConfigService, useValue: makeConfig() },
      ],
    }).compile();
    service = module.get<CashfreeService>(CashfreeService);
    service.onModuleInit();
  });

  // ── SDK initialisation ─────────────────────────────────────
  describe('onModuleInit()', () => {
    it('sets correct SDK credentials and api version 2024-12-01', () => {
      expect(Cashfree.XClientId).toBe('TEST_CLIENT_ID');
      expect(Cashfree.XClientSecret).toBe('TEST_SECRET');
      expect(Cashfree.XApiVersion).toBe('2024-12-01');
      expect(Cashfree.XEnvironment).toBe(CFEnvironment.SANDBOX);
      expect(Cashfree.XEnableErrorAnalytics).toBe(false);
    });

    it('sets production environment when configured', async () => {
      (mockedFs.existsSync as jest.Mock).mockReturnValue(false);
      const mod = await Test.createTestingModule({
        providers: [
          CashfreeService,
          { provide: ConfigService, useValue: makeConfig('production') },
        ],
      }).compile();
      const svc = mod.get<CashfreeService>(CashfreeService);
      svc.onModuleInit();
      expect(Cashfree.XEnvironment).toBe(CFEnvironment.PRODUCTION);
    });
  });

  // ── Getters ────────────────────────────────────────────────
  describe('getters', () => {
    it('environment returns sandbox', () =>
      expect(service.environment).toBe('sandbox'));
    it('apiBaseUrl returns sandbox URL', () =>
      expect(service.apiBaseUrl).toBe(
        'https://sandbox.cashfree.com/verification',
      ));
    it('sdk exposes Cashfree object', () => expect(service.sdk).toBe(Cashfree));
  });

  // ── Signature — IP whitelist mode ─────────────────────────
  describe('signature — IP whitelist mode (no key)', () => {
    it('generateSignature() returns null', () =>
      expect(service.generateSignature()).toBeNull());
    it('signatureHeader() returns {}', () =>
      expect(service.signatureHeader()).toEqual({}));
    it('sdkOptions() returns {}', () =>
      expect(service.sdkOptions()).toEqual({}));
  });

  // ── Signature — RSA mode ──────────────────────────────────
  describe('signature — RSA key mode', () => {
    let svcWithKey: CashfreeService;

    beforeEach(async () => {
      const { publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
      });
      const pem = publicKey.export({ type: 'spki', format: 'pem' }) as string;
      (mockedFs.existsSync as jest.Mock).mockReturnValue(true);
      (mockedFs.readFileSync as jest.Mock).mockReturnValue(pem);
      const mod = await Test.createTestingModule({
        providers: [
          CashfreeService,
          {
            provide: ConfigService,
            useValue: makeConfig('sandbox', '/key.pem'),
          },
        ],
      }).compile();
      svcWithKey = mod.get<CashfreeService>(CashfreeService);
      svcWithKey.onModuleInit();
    });

    it('generateSignature() returns a base64 string', () => {
      const sig = svcWithKey.generateSignature();
      expect(sig).not.toBeNull();
      expect(() => Buffer.from(sig!, 'base64')).not.toThrow();
    });

    it('signatureHeader() returns X-Cf-Signature header', () => {
      expect(svcWithKey.signatureHeader()).toHaveProperty('X-Cf-Signature');
    });

    it('sdkOptions() returns { headers: { X-Cf-Signature } }', () => {
      const opts = svcWithKey.sdkOptions();
      expect(opts.headers!['X-Cf-Signature']).toBeTruthy();
    });

    it('generates different signatures on subsequent calls (timestamp increments)', async () => {
      const sig1 = svcWithKey.generateSignature();
      await new Promise((r) => setTimeout(r, 1050));
      const sig2 = svcWithKey.generateSignature();
      expect(sig1).not.toBe(sig2);
    });
  });

  // ── postV2() ──────────────────────────────────────────────
  describe('postV2()', () => {
    it('POSTs to v2 base with x-api-version 2024-12-01', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValue({ data: { bank_name: 'HDFC' } });
      await service.postV2('/verification/ifsc', { ifsc: 'HDFC0000001' });
      const [url, , cfg] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(url).toBe('https://sandbox.cashfree.com/verification/ifsc');
      expect(cfg.headers['x-api-version']).toBe('2024-12-01');
      expect(cfg.headers['x-client-id']).toBe('TEST_CLIENT_ID');
    });

    it('throws InternalServerErrorException on error', async () => {
      mockedAxios.post = jest
        .fn()
        .mockRejectedValue({
          isAxiosError: true,
          response: { data: { message: 'Bad' } },
          message: 'err',
        });
      await expect(service.postV2('/test', {})).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  // ── postMultipart() ───────────────────────────────────────
  describe('postMultipart()', () => {
    it('POSTs to Secure ID base with x-api-version 2024-12-01', async () => {
      mockedAxios.post = jest
        .fn()
        .mockResolvedValue({ data: { is_live: true } });
      await service.postMultipart('/face-liveness', {
        verification_id: 'kyc-test',
        image: {
          data: Buffer.from('img'),
          mimeType: 'image/jpeg',
          filename: 'selfie.jpg',
        },
      });
      const [url, , cfg] = (mockedAxios.post as jest.Mock).mock.calls[0];
      expect(url).toBe(
        'https://sandbox.cashfree.com/verification/face-liveness',
      );
      expect(cfg.headers['x-api-version']).toBe('2024-12-01');
    });

    it('throws InternalServerErrorException on network failure', async () => {
      mockedAxios.post = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      await expect(
        service.postMultipart('/face-liveness', {
          verification_id: 'x',
          image: {
            data: Buffer.from('x'),
            mimeType: 'image/jpeg',
            filename: 'x.jpg',
          },
        }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  // ── ping() ────────────────────────────────────────────────
  describe('ping()', () => {
    it('returns reachable:true when VrsPanVerification resolves', async () => {
      (Cashfree.VrsPanVerification as jest.Mock).mockResolvedValue({
        data: {},
      });
      expect((await service.ping()).reachable).toBe(true);
      expect((await service.ping()).error).toBeNull();
    });

    it('returns reachable:false on ECONNREFUSED', async () => {
      (Cashfree.VrsPanVerification as jest.Mock).mockRejectedValue(
        new InternalServerErrorException('ECONNREFUSED'),
      );
      expect((await service.ping()).reachable).toBe(false);
    });

    it('returns reachable:true on 401 (server responded)', async () => {
      (Cashfree.VrsPanVerification as jest.Mock).mockRejectedValue(
        new InternalServerErrorException('Invalid clientId'),
      );
      expect((await service.ping()).reachable).toBe(true);
    });
  });

  // ── handleSdkError() ──────────────────────────────────────
  describe('handleSdkError()', () => {
    it('throws InternalServerErrorException', () => {
      expect(() => service.handleSdkError(new Error('SDK error'))).toThrow(
        InternalServerErrorException,
      );
    });
  });
});
