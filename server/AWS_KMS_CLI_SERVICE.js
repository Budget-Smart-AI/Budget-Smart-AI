// AWS KMS Service using AWS CLI (Workaround for SDK module issues)
// This provides the same functionality as AWS SDK but uses AWS CLI
// which has been tested and verified to work

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class AWSKMSCLIService {
  constructor() {
    this.region = process.env.AWS_REGION || 'us-east-1';
    this.keyId = process.env.AWS_KMS_KEY_ID || '';
    if (!this.keyId) {
      console.warn('[KMS] AWS_KMS_KEY_ID is not set — KMS operations will fail. Set this environment variable to enable encryption.');
    }
  }

  /**
   * Encrypt data using AWS KMS
   * @param {string} plaintext - Data to encrypt
   * @returns {Promise<string>} Base64 encoded ciphertext
   */
  async encrypt(plaintext) {
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
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt data using AWS KMS
   * @param {string} ciphertextBlob - Base64 encoded ciphertext
   * @returns {Promise<string>} Decrypted plaintext
   */
  async decrypt(ciphertextBlob) {
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
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Describe the KMS key
   * @returns {Promise<Object>} Key information
   */
  async describeKey() {
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
      throw new Error(`Describe key failed: ${error.message}`);
    }
  }

  /**
   * Test KMS connectivity
   * @returns {Promise<boolean>} True if KMS is accessible
   */
  async testConnection() {
    try {
      const keyInfo = await this.describeKey();
      return keyInfo.KeyMetadata && keyInfo.KeyMetadata.KeyState === 'Enabled';
    } catch (error) {
      return false;
    }
  }

  /**
   * Encrypt sensitive field (for database storage)
   * @param {string} fieldValue - Field value to encrypt
   * @returns {Promise<{ciphertext: string, keyId: string}>} Encrypted result
   */
  async encryptField(fieldValue) {
    const ciphertext = await this.encrypt(fieldValue);
    return {
      ciphertext,
      keyId: this.keyId,
      encryptedAt: new Date().toISOString()
    };
  }

  /**
   * Decrypt sensitive field (from database)
   * @param {string} ciphertext - Encrypted field value
   * @returns {Promise<string>} Decrypted field value
   */
  async decryptField(ciphertext) {
    return await this.decrypt(ciphertext);
  }
}

// Export for CommonJS
module.exports = AWSKMSCLIService;

// Export for ES modules
if (typeof module !== 'undefined' && module.exports && typeof exports !== 'undefined') {
  exports.default = AWSKMSCLIService;
}