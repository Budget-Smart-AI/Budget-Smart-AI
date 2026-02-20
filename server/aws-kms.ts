// AWS KMS Service for BudgetSmart AI
// Provides encryption/decryption for sensitive data using AWS KMS

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

  constructor() {
    this.region = process.env.AWS_REGION || 'us-east-1';
    this.keyId = process.env.AWS_KMS_KEY_ID || 'arn:aws:kms:us-east-1:345148435194:key/67316091-4ef2-4e39-9684-7af483c9eaeb';
    
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      console.warn('AWS credentials not found in environment variables');
    }
  }

  /**
   * Encrypt data using AWS KMS
   * @param plaintext - Data to encrypt
   * @returns Base64 encoded ciphertext
   */
  async encrypt(plaintext: string): Promise<string> {
    try {
      // Convert plaintext to base64
      const base64Plaintext = Buffer.from(plaintext).toString('base64');
      
      // Execute AWS CLI encrypt command
      const command = `aws kms encrypt \
        --key-id "${this.keyId}" \
        --plaintext "${base64Plaintext}" \
        --region "${this.region}" \
        --output text \
        --query CiphertextBlob`;
      
      const { stdout } = await execAsync(command);
      return stdout.trim();
    } catch (error) {
      console.error('AWS KMS Encryption Error:', error);
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Decrypt data using AWS KMS
   * @param ciphertextBlob - Base64 encoded ciphertext
   * @returns Decrypted plaintext
   */
  async decrypt(ciphertextBlob: string): Promise<string> {
    try {
      // Create temporary file with ciphertext
      const tempFile = `/tmp/kms_ciphertext_${Date.now()}.bin`;
      const decodeCommand = `echo "${ciphertextBlob}" | base64 -d > ${tempFile}`;
      await execAsync(decodeCommand);
      
      // Execute AWS CLI decrypt command
      const command = `aws kms decrypt \
        --ciphertext-blob fileb://${tempFile} \
        --region "${this.region}" \
        --output text \
        --query Plaintext`;
      
      const { stdout } = await execAsync(command);
      
      // Clean up temp file
      await execAsync(`rm -f ${tempFile}`);
      
      // Decode base64 result
      const plaintextBase64 = stdout.trim();
      return Buffer.from(plaintextBase64, 'base64').toString();
    } catch (error) {
      console.error('AWS KMS Decryption Error:', error);
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Describe the KMS key
   * @returns Key information
   */
  async describeKey(): Promise<{ KeyMetadata: KMSKeyMetadata }> {
    try {
      const keyId = this.keyId.split('/').pop(); // Extract key ID from ARN
      const command = `aws kms describe-key \
        --key-id "${keyId}" \
        --region "${this.region}" \
        --output json`;
      
      const { stdout } = await execAsync(command);
      return JSON.parse(stdout);
    } catch (error) {
      console.error('AWS KMS Describe Key Error:', error);
      throw new Error(`Describe key failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Test KMS connectivity
   * @returns True if KMS is accessible
   */
  async testConnection(): Promise<boolean> {
    try {
      const keyInfo = await this.describeKey();
      return keyInfo.KeyMetadata && keyInfo.KeyMetadata.KeyState === 'Enabled';
    } catch (error) {
      console.warn('KMS connection test failed:', error);
      return false;
    }
  }

  /**
   * Encrypt sensitive field (for database storage)
   * @param fieldValue - Field value to encrypt
   * @returns Encrypted result with metadata
   */
  async encryptField(fieldValue: string): Promise<EncryptedField> {
    const ciphertext = await this.encrypt(fieldValue);
    return {
      ciphertext,
      keyId: this.keyId,
      encryptedAt: new Date().toISOString()
    };
  }

  /**
   * Decrypt sensitive field (from database)
   * @param ciphertext - Encrypted field value
   * @returns Decrypted field value
   */
  async decryptField(ciphertext: string): Promise<string> {
    return await this.decrypt(ciphertext);
  }

  /**
   * Generate data key for client-side encryption
   * @returns Base64 encoded data key
   */
  async generateDataKey(): Promise<{ plaintext: string; ciphertext: string }> {
    try {
      const keyId = this.keyId.split('/').pop();
      const command = `aws kms generate-data-key \
        --key-id "${keyId}" \
        --key-spec AES_256 \
        --region "${this.region}" \
        --output json`;
      
      const { stdout } = await execAsync(command);
      const result = JSON.parse(stdout);
      
      return {
        plaintext: result.Plaintext,
        ciphertext: result.CiphertextBlob
      };
    } catch (error) {
      console.error('AWS KMS Generate Data Key Error:', error);
      throw new Error(`Generate data key failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Export singleton instance
export const awsKmsService = new AWSKMSService();