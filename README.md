# Cashfree KYC API — NestJS Backend

NestJS backend for Cashfree Secure ID verification APIs.

## Quick Start

```bash
cp .env.example .env
# Fill in CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET
npm install
npm run start:dev
```

API runs at http://localhost:3001/api

## Environment Variables

| Key | Description |
|---|---|
| CASHFREE_CLIENT_ID | From Cashfree Dashboard → Developers → Secure ID |
| CASHFREE_CLIENT_SECRET | From Cashfree Dashboard → Developers → Secure ID |
| CASHFREE_ENV | sandbox (default) or production |
| PORT | API port (default: 3001) |
| FRONTEND_URL | CORS origin (default: http://localhost:3000) |

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | /api/kyc/health | Credential check + Cashfree ping |
| POST | /api/kyc/aadhaar/send-otp | Send Aadhaar OTP via UIDAI |
| POST | /api/kyc/aadhaar/verify-otp | Verify OTP and get KYC data |
| POST | /api/kyc/digilocker/initiate | Initiate DigiLocker OAuth |
| POST | /api/kyc/pan/lite | Basic PAN verification |
| POST | /api/kyc/pan/360 | Full PAN verification with DOB/gender/Aadhaar linkage |
| POST | /api/kyc/pan/ocr | Extract PAN fields from image (multipart) |
| POST | /api/kyc/bav/sync | Instant bank account verification |
| POST | /api/kyc/bav/async | Async bank account verification (webhook) |
| POST | /api/kyc/ifsc | IFSC code lookup (free) |
| POST | /api/kyc/reverse-penny-drop | Bank-IMPS verified account holder name |
| POST | /api/kyc/name-match | Fuzzy name matching |
| POST | /api/kyc/face/liveness | Face liveness detection (multipart) |
| POST | /api/kyc/face/match | Face match selfie vs document (multipart) |
| POST | /api/kyc/vkyc/initiate | Initiate Video KYC session |
| POST | /api/kyc/statement | Bank statement OCR (multipart PDF) |
| POST | /api/kyc/aa/consent | Account Aggregator consent request |

## Tests

```bash
npm test              # unit tests (52 tests)
npm run test:e2e      # e2e tests (24 tests)
npm run test:cov      # coverage report
```

## Sandbox Test Values

| Field | Value |
|---|---|
| Aadhaar | 999941057058 |
| PAN | ABCDE1234F |
| OTP | 123456 |
| Bank Account | 026291800001191 |
| IFSC | YESB0000262 |
