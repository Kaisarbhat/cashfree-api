import { IsString, IsOptional, IsBoolean, IsNotEmpty } from 'class-validator';

export class AadhaarSendOtpDto {
  @IsString()
  @IsNotEmpty()
  aadhaar_number: string;
}

export class AadhaarVerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  ref_id: string;

  @IsString()
  @IsNotEmpty()
  otp: string;
}

export class DigilockerInitiateDto {
  @IsString()
  @IsOptional()
  redirect_url?: string;
}

export class PanVerifyDto {
  @IsString()
  @IsNotEmpty()
  pan: string;

  @IsString()
  @IsOptional()
  dob?: string;
}

export class BavSyncDto {
  @IsString()
  @IsNotEmpty()
  account_number: string;

  @IsString()
  @IsNotEmpty()
  ifsc: string;

  @IsString()
  @IsOptional()
  name?: string;
}

export class BavAsyncDto extends BavSyncDto {
  @IsString()
  @IsOptional()
  reference_id?: string;
}

export class IfscDto {
  @IsString()
  @IsNotEmpty()
  ifsc: string;
}

// RPD is UPI-based — sends a collect request to user's UPI, no account_number/ifsc needed
export class ReversePennyDropDto {
  @IsString()
  @IsOptional()
  name?: string;
}

export class NameMatchDto {
  @IsString()
  @IsNotEmpty()
  name1: string;

  @IsString()
  @IsNotEmpty()
  name2: string;
}

export class VkycInitiateDto {
  @IsString()
  @IsOptional()
  customer_name?: string;

  @IsString()
  @IsOptional()
  customer_mobile?: string;

  @IsBoolean()
  @IsOptional()
  agent_mode?: boolean = false;
}

export class AaConsentDto {
  @IsString()
  @IsNotEmpty()
  mobile: string;

  @IsString()
  @IsOptional()
  period?: string = 'LAST_6_MONTHS';
}
