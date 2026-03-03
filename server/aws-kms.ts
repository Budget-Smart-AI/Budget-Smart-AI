// AWS KMS Service for BudgetSmart AI
// Provides encryption/decryption for sensitive data using AWS KMS SDK

import { KMSClient, EncryptCommand, DecryptCommand, DescribeKeyCommand } from "@aws-sdk/client-kms";

// Prefix added to every KMS-encrypted value so we can detect ciphertext vs.
// legacy plaintext in the database (backward-compatibility).
const KMS_PREFIX = "KMS_ENC:";

export interface EncryptedField {
  ciphertext: string;
  keyId: string;
  encryptedAt: string;
}

export interface KMSKeyMetadata {
  KeyId: string;
  Arn: string;
  KeyState: string;
  Enabled: boolean;
  Description?: string;
}

export class AWSKMSService {
  private region: string;
  private keyId: string;
  private client: KMSClient | null = null;

  constructor() {
    this.region = process.env.AWS_REGION || "us-east-1";
    this.keyId = process.env.AWS_KMS_KEY_ID || "";

    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      console.warn("[KMS] AWS credentials not found in environment variables — KMS encryption is disabled");
    }
    if (!this.keyId) {
      console.warn("[KMS] AWS_KMS_KEY_ID not set — KMS encryption is disabled");
    }
  }

  /** Returns true when all required credentials are present. */
  isConfigured(): boolean {
    return !!(
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      this.keyId
    );
  }

  private getClient(): KMSClient {
    if (!this.client) {
      this.client = new KMSClient({
        region: this.region,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
      });
    }
    return this.client;
  }

  /**
   * Encrypt plaintext using AWS KMS.
   * Returns a prefixed base64-encoded ciphertext blob.
   */
  async encrypt(plaintext: string): Promise<string> {
    const command = new EncryptCommand({
      KeyId: this.keyId,
      Plaintext: Buffer.from(plaintext),
    });
    const response = await this.getClient().send(command);
    if (!response.CiphertextBlob) {
      throw new Error("KMS encrypt returned no ciphertext");
    }
    return KMS_PREFIX + Buffer.from(response.CiphertextBlob).toString("base64");
  }

  /**
   * Decrypt a ciphertext blob previously produced by encrypt().
   * Strips the prefix before decryption.
   */
  async decrypt(ciphertextBlob: string): Promise<string> {
    const base64 = ciphertextBlob.startsWith(KMS_PREFIX)
      ? ciphertextBlob.slice(KMS_PREFIX.length)
      : ciphertextBlob;
    const command = new DecryptCommand({
      CiphertextBlob: Buffer.from(base64, "base64"),
    });
    const response = await this.getClient().send(command);
    if (!response.Plaintext) {
      throw new Error("KMS decrypt returned no plaintext");
    }
    return Buffer.from(response.Plaintext).toString();
  }

  /**
   * Returns true if the value was encrypted by this service
   * (i.e. carries the KMS_ENC: prefix).
   */
  static isEncrypted(value: string): boolean {
    return value.startsWith(KMS_PREFIX);
  }

  /**
   * Describe the KMS key to verify it exists and is enabled.
   */
  async describeKey(): Promise<{ KeyMetadata: KMSKeyMetadata }> {
    const command = new DescribeKeyCommand({ KeyId: this.keyId });
    const response = await this.getClient().send(command);
    if (!response.KeyMetadata) {
      throw new Error("DescribeKey returned no metadata");
    }
    return {
      KeyMetadata: {
        KeyId: response.KeyMetadata.KeyId ?? "",
        Arn: response.KeyMetadata.Arn ?? "",
        KeyState: response.KeyMetadata.KeyState ?? "",
        Enabled: response.KeyMetadata.Enabled ?? false,
        Description: response.KeyMetadata.Description,
      },
    };
  }

  /**
   * Test KMS connectivity — returns true if the key is accessible and enabled.
   * Never throws; returns false on any error.
   */
  async testConnection(): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      const info = await this.describeKey();
      return info.KeyMetadata.Enabled;
    } catch {
      return false;
    }
  }

  /**
   * Encrypt a sensitive field for database storage.
   * When KMS is not configured, returns the plaintext unchanged with a warning.
   */
  async encryptField(fieldValue: string): Promise<string> {
    if (!this.isConfigured()) {
      console.warn("[KMS] Storing field without encryption (KMS not configured)");
      return fieldValue;
    }
    return this.encrypt(fieldValue);
  }

  /**
   * Decrypt a field retrieved from the database.
   * If the value does not carry the KMS prefix (legacy plaintext), returns it as-is.
   */
  async decryptField(value: string): Promise<string> {
    if (!AWSKMSService.isEncrypted(value)) {
      // Legacy plaintext — not yet encrypted; return as-is
      return value;
    }
    if (!this.isConfigured()) {
      throw new Error("[KMS] Cannot decrypt: KMS is not configured");
    }
    return this.decrypt(value);
  }
}

// Export singleton instance
export const awsKmsService = new AWSKMSService();