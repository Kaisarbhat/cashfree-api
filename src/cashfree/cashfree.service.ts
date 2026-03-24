import {
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cashfree, CFEnvironment } from 'cashfree-verification';
import axios, { AxiosError } from 'axios';
import FormData from 'form-data';
import * as crypto from 'crypto';

export interface FileField {
  data: Buffer;
  mimeType: string;
  filename: string;
}

/**
 * Wraps the official cashfree-verification SDK.
 *
 * Authentication (2FA) — ONE of these must be configured:
 *
 *   Option A — IP Whitelist (simplest):
 *     Go to Secure ID Dashboard → Developers → Two-Factor Authentication
 *     → IP Whitelist → Add your server's public IP.
 *     No extra env vars needed.
 *
 *   Option B — RSA Signature (for dynamic IPs or cloud deployments):
 *     Go to Dashboard → Developers → Two-Factor Authentication
 *     → Public Key → Generate Public Key → download the .pem file.
 *     Set CASHFREE_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----" in .env
 *     The service auto-generates a fresh signature on every request.
 *
 * Signature algorithm:
 *   data      = clientId + "." + Math.floor(Date.now()/1000)
 *   signature = RSA_OAEP_encrypt(data, publicKey) → base64
 *   header    = X-Cf-Signature: <signature>   (valid for 5 minutes)
 */
@Injectable()
export class CashfreeService implements OnModuleInit {
  private readonly logger = new Logger(CashfreeService.name);

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly isProd: boolean;
  private readonly v2Base: string;

  private publicKey: crypto.KeyObject | null = null;
  private signatureMode: 'ip_whitelist' | 'signature' = 'signature';

  constructor(private readonly config: ConfigService) {
    this.clientId = this.config.getOrThrow<string>('CASHFREE_CLIENT_ID');
    this.clientSecret = this.config.getOrThrow<string>(
      'CASHFREE_CLIENT_SECRET',
    );
    this.isProd = this.config.get('CASHFREE_ENV', 'sandbox') === 'production';
    this.v2Base = this.isProd
      ? 'https://api.cashfree.com'
      : 'https://sandbox.cashfree.com';
  }

  onModuleInit() {
    // ── Configure SDK ───────────────────────────────────────
    Cashfree.XClientId = this.clientId;
    Cashfree.XClientSecret = this.clientSecret;
    Cashfree.XApiVersion = '2024-12-01'; // required per SDK README
    Cashfree.XEnvironment = this.isProd
      ? CFEnvironment.PRODUCTION
      : CFEnvironment.SANDBOX;
    Cashfree.XEnableErrorAnalytics = false;

    // ── Load RSA public key if provided ────────────────────
    const key = this.config.get<string>('CASHFREE_PUBLIC_KEY', '');
    if (key) {
      try {
        let pem = key.trim();
        if (pem.startsWith('"') && pem.endsWith('"')) pem = pem.slice(1, -1);
        if (pem.startsWith("'") && pem.endsWith("'")) pem = pem.slice(1, -1);

        pem = pem.replace(/\\n/g, '\n');
        if (!pem.includes('\n') && pem.includes('BEGIN PUBLIC KEY')) {
          const body = pem
            .replace(/-----BEGIN PUBLIC KEY-----/g, '')
            .replace(/-----END PUBLIC KEY-----/g, '')
            .replace(/\s+/g, '');
          const chunked = body.match(/.{1,64}/g)?.join('\n') || body;
          pem = `-----BEGIN PUBLIC KEY-----\n${chunked}\n-----END PUBLIC KEY-----`;
        }
        this.publicKey = crypto.createPublicKey(pem);
        this.signatureMode = 'signature';
        this.logger.log('Cashfree 2FA: RSA signature mode enabled');
      } catch (err) {
        this.logger.error(
          `Failed to load Cashfree public key from ${key}: ${err}`,
        );
      }
    } else {
      this.logger.log(
        'Cashfree 2FA: IP whitelist mode (set CASHFREE_PUBLIC_KEY for signature mode)',
      );
    }
  }

  // ── Public getters ─────────────────────────────────────────
  get sdk() {
    return Cashfree;
  }
  get environment() {
    return this.isProd ? 'production' : 'sandbox';
  }
  get apiBaseUrl() {
    return this.isProd
      ? 'https://api.cashfree.com/verification'
      : 'https://sandbox.cashfree.com/verification';
  }

  // ── Signature generation ───────────────────────────────────
  /**
   * Generates X-Cf-Signature for the current request.
   * Formula: RSA_OAEP_encrypt(clientId + "." + unixTimestamp, publicKey) → base64
   * Valid for 5 minutes.
   */
  generateSignature(): string | null {
    if (!this.publicKey) return null;
    const timestamp = Math.floor(Date.now() / 1000);
    const data = `${this.clientId}.${timestamp}`;
    const encrypted = crypto.publicEncrypt(
      { key: this.publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
      Buffer.from(data),
    );
    return encrypted.toString('base64');
  }

  /**
   * Returns the X-Cf-Signature header object if signature mode is active.
   * Returns {} (empty) in IP whitelist mode — no extra header needed.
   */
  signatureHeader(): Record<string, string> {
    const sig = this.generateSignature();
    return sig ? { 'X-Cf-Signature': sig } : {};
  }

  /**
   * Options object to pass as the last argument to every SDK method.
   * Injects X-Cf-Signature into the request headers when signature mode is on.
   * SDK merges options.headers last, so this always wins.
   */
  sdkOptions(): { headers?: Record<string, string> } {
    const sigHdr = this.signatureHeader();
    return Object.keys(sigHdr).length > 0 ? { headers: sigHdr } : {};
  }

  // ── Multipart helper (face / OCR) ──────────────────────────
  async postMultipart<T = unknown>(
    path: string,
    fields: Record<string, string | FileField>,
  ): Promise<T> {
    const form = new FormData();
    for (const [key, val] of Object.entries(fields)) {
      if (typeof val === 'string') {
        form.append(key, val);
      } else {
        form.append(key, val.data, {
          filename: val.filename,
          contentType: val.mimeType,
        });
      }
    }
    try {
      const { data } = await axios.post<T>(`${this.apiBaseUrl}${path}`, form, {
        headers: {
          'x-client-id': this.clientId,
          'x-client-secret': this.clientSecret,
          'x-api-version': '2024-12-01',
          ...form.getHeaders(),
          ...this.signatureHeader(),
        },
        timeout: 30_000,
      });
      return data;
    } catch (err) {
      throw this._handleError(err);
    }
  }

  // ── v2 JSON helper (BAV / IFSC / Statement — not in SDK) ──
  async postV2<T = unknown>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    try {
      const { data } = await axios.post<T>(`${this.v2Base}${path}`, body, {
        headers: {
          'x-client-id': this.clientId,
          'x-client-secret': this.clientSecret,
          'x-api-version': '2024-12-01',
          'Content-Type': 'application/json',
          ...this.signatureHeader(),
        },
        timeout: 30_000,
      });
      return data;
    } catch (err) {
      throw this._handleError(err);
    }
  }

  // ── Health ping ────────────────────────────────────────────
  async ping(): Promise<{ reachable: boolean; error: string | null }> {
    try {
      await Cashfree.VrsPanVerification(
        { pan: 'ABCDE1234F' },
        undefined,
        undefined,
        this.sdkOptions(),
      );
      return { reachable: true, error: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      const reachable =
        !msg.includes('ECONNREFUSED') &&
        !msg.includes('ENOTFOUND') &&
        !msg.includes('Network Error');
      return { reachable, error: msg };
    }
  }

  handleSdkError(err: unknown): never {
    throw this._handleError(err);
  }

  private _handleError(err: unknown): InternalServerErrorException {
    const axErr = err as AxiosError<{ message?: string; error?: string }>;
    const msg =
      axErr.response?.data?.message ||
      axErr.response?.data?.error ||
      axErr.message ||
      'Cashfree API error';
    return new InternalServerErrorException(msg);
  }
}
