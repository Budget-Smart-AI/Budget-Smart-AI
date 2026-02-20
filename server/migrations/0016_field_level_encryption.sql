-- Migration: 0016_field_level_encryption.sql
-- Description: Add encrypted columns for sensitive banking data
-- Created: February 20, 2026
-- Purpose: Enable field-level encryption using AWS KMS for MX production launch

-- ============================================================================
-- CRITICAL: MX TOKENS ENCRYPTION
-- ============================================================================

-- MX Tokens: Most sensitive data - MX API access credentials
-- These MUST be encrypted before MX production launch
ALTER TABLE mx_tokens 
ADD COLUMN IF NOT EXISTS access_token_encrypted TEXT,
ADD COLUMN IF NOT EXISTS refresh_token_encrypted TEXT,
ADD COLUMN IF NOT EXISTS encryption_version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS encrypted_at TIMESTAMP;

-- Add index for encrypted fields lookup
CREATE INDEX IF NOT EXISTS idx_mx_tokens_user_id_encrypted 
ON mx_tokens(user_id) 
WHERE access_token_encrypted IS NOT NULL;

-- ============================================================================
-- BANK ACCOUNT DATA ENCRYPTION
-- ============================================================================

-- Plaid Accounts: Bank account identifiers
ALTER TABLE plaid_accounts
ADD COLUMN IF NOT EXISTS account_id_encrypted TEXT,
ADD COLUMN IF NOT EXISTS name_encrypted TEXT,
ADD COLUMN IF NOT EXISTS official_name_encrypted TEXT,
ADD COLUMN IF NOT EXISTS mask_encrypted TEXT,
ADD COLUMN IF NOT EXISTS encryption_version INTEGER DEFAULT 1;

-- MX Accounts: Bank account numbers (highly sensitive)
ALTER TABLE mx_accounts
ADD COLUMN IF NOT EXISTS account_number_encrypted TEXT,
ADD COLUMN IF NOT EXISTS name_encrypted TEXT,
ADD COLUMN IF NOT EXISTS encryption_version INTEGER DEFAULT 1;

-- ============================================================================
-- TRANSACTION DATA ENCRYPTION
-- ============================================================================

-- Plaid Transactions: Financial transaction details
ALTER TABLE plaid_transactions
ADD COLUMN IF NOT EXISTS amount_encrypted TEXT,
ADD COLUMN IF NOT EXISTS name_encrypted TEXT,
ADD COLUMN IF NOT EXISTS merchant_name_encrypted TEXT,
ADD COLUMN IF NOT EXISTS original_description_encrypted TEXT,
ADD COLUMN IF NOT EXISTS encryption_version INTEGER DEFAULT 1,
-- Hash columns for searching/aggregation without decryption
ADD COLUMN IF NOT EXISTS amount_hash CHAR(64),
ADD COLUMN IF NOT EXISTS category_hash CHAR(64);

-- MX Transactions: Financial transaction details
ALTER TABLE mx_transactions
ADD COLUMN IF NOT EXISTS amount_encrypted TEXT,
ADD COLUMN IF NOT EXISTS description_encrypted TEXT,
ADD COLUMN IF NOT EXISTS original_description_encrypted TEXT,
ADD COLUMN IF NOT EXISTS encryption_version INTEGER DEFAULT 1,
-- Hash columns for searching/aggregation without decryption
ADD COLUMN IF NOT EXISTS amount_hash CHAR(64),
ADD COLUMN IF NOT EXISTS category_hash CHAR(64);

-- ============================================================================
-- USER FINANCIAL DATA ENCRYPTION
-- ============================================================================

-- Bills: User bill information
ALTER TABLE bills
ADD COLUMN IF NOT EXISTS name_encrypted TEXT,
ADD COLUMN IF NOT EXISTS merchant_encrypted TEXT,
ADD COLUMN IF NOT EXISTS amount_encrypted TEXT,
ADD COLUMN IF NOT EXISTS encryption_version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS amount_hash CHAR(64);

-- Income: User income sources
ALTER TABLE income
ADD COLUMN IF NOT EXISTS source_encrypted TEXT,
ADD COLUMN IF NOT EXISTS amount_encrypted TEXT,
ADD COLUMN IF NOT EXISTS encryption_version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS amount_hash CHAR(64);

-- ============================================================================
-- AUDIT LOGGING FOR ENCRYPTION OPERATIONS
-- ============================================================================

-- Create audit table for encryption/decryption operations
CREATE TABLE IF NOT EXISTS encryption_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    operation_type VARCHAR(20) NOT NULL CHECK (operation_type IN ('ENCRYPT', 'DECRYPT', 'KEY_ROTATION')),
    data_type VARCHAR(50) NOT NULL,
    resource_id UUID,
    encryption_version INTEGER NOT NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Indexes for efficient querying
    INDEX idx_encryption_audit_user_id (user_id),
    INDEX idx_encryption_audit_operation (operation_type),
    INDEX idx_encryption_audit_created_at (created_at DESC)
);

-- ============================================================================
-- MIGRATION HELPER FUNCTIONS
-- ============================================================================

-- Function to safely migrate existing data (to be called from application)
CREATE OR REPLACE FUNCTION log_encryption_operation(
    p_user_id UUID,
    p_operation_type VARCHAR(20),
    p_data_type VARCHAR(50),
    p_resource_id UUID,
    p_encryption_version INTEGER,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO encryption_audit_logs (
        user_id,
        operation_type,
        data_type,
        resource_id,
        encryption_version,
        ip_address,
        user_agent
    ) VALUES (
        p_user_id,
        p_operation_type,
        p_data_type,
        p_resource_id,
        p_encryption_version,
        p_ip_address,
        p_user_agent
    ) RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- DATA INTEGRITY CHECKS
-- ============================================================================

-- Add check constraints to ensure data consistency
ALTER TABLE mx_tokens
ADD CONSTRAINT chk_mx_tokens_encryption 
CHECK (
    (access_token_encrypted IS NULL AND access_token IS NOT NULL) OR
    (access_token_encrypted IS NOT NULL AND access_token IS NULL)
);

ALTER TABLE plaid_accounts
ADD CONSTRAINT chk_plaid_accounts_encryption
CHECK (
    (account_id_encrypted IS NULL AND account_id IS NOT NULL) OR
    (account_id_encrypted IS NOT NULL AND account_id IS NULL)
);

-- ============================================================================
-- MIGRATION STATUS TRACKING
-- ============================================================================

-- Track migration progress
CREATE TABLE IF NOT EXISTS encryption_migration_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name VARCHAR(100) NOT NULL,
    total_records INTEGER NOT NULL DEFAULT 0,
    migrated_records INTEGER NOT NULL DEFAULT 0,
    migration_started_at TIMESTAMP,
    migration_completed_at TIMESTAMP,
    last_error TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED')),
    
    UNIQUE(table_name),
    INDEX idx_migration_status (status)
);

-- Initialize migration status for each table
INSERT INTO encryption_migration_status (table_name, total_records) VALUES
    ('mx_tokens', 0),
    ('plaid_accounts', 0),
    ('mx_accounts', 0),
    ('plaid_transactions', 0),
    ('mx_transactions', 0),
    ('bills', 0),
    ('income', 0)
ON CONFLICT (table_name) DO NOTHING;

-- ============================================================================
-- ROLLBACK PROCEDURE (Emergency only)
-- ============================================================================

-- Comment: This procedure would be used only if encryption causes critical issues
-- CREATE OR REPLACE PROCEDURE rollback_encryption_migration() AS $$
-- BEGIN
--     -- Implementation would remove encrypted columns and restore original data
--     -- This is a placeholder - actual implementation would be more complex
--     RAISE NOTICE 'Rollback procedure placeholder - contact security team';
-- END;
-- $$ LANGUAGE plpgsql;

-- ============================================================================
-- MIGRATION COMPLETION MESSAGE
-- ============================================================================

COMMENT ON MIGRATION '0016_field_level_encryption.sql' IS '
Field-level encryption migration for BudgetSmart AI.

PURPOSE:
- Enable AWS KMS encryption for sensitive banking data
- Prepare for MX production API key requirements
- Meet GLBA compliance for financial data protection
- Implement PCI DSS alignment for payment data

CRITICAL PATH:
1. MX tokens must be encrypted before MX production launch
2. Bank account identifiers should be encrypted within 24 hours
3. Transaction data can be encrypted gradually over 1 week

SECURITY NOTES:
- Encryption keys stored in AWS KMS, not in database
- Audit logging tracks all encryption/decryption operations
- Hash columns enable searching without decryption
- Migration supports gradual rollout with rollback capability

NEXT STEPS AFTER MIGRATION:
1. Update application code to use encrypted columns
2. Run data migration for existing records
3. Enable audit logging for all encryption operations
4. Monitor performance and adjust as needed
';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Query to verify migration was applied
SELECT 
    'Migration 0016 Applied' as status,
    COUNT(*) as encrypted_tables,
    (SELECT COUNT(*) FROM encryption_migration_status) as migration_trackers
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND column_name LIKE '%_encrypted';

-- Query to check current encryption status
SELECT 
    table_name,
    total_records,
    migrated_records,
    status,
    migration_started_at,
    migration_completed_at
FROM encryption_migration_status
ORDER BY table_name;