import { useState } from 'react';
import { AccountSearchDropdown } from './AccountSearchDropdown.js';
import styles from './ConvertLeadModal.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConvertLeadModalProps {
  leadName: string;
  fieldValues: Record<string, unknown>;
  sessionToken: string;
  onConvert: (options: {
    create_account: boolean;
    account_id: string | null;
    create_opportunity: boolean;
  }) => Promise<void>;
  onClose: () => void;
  converting: boolean;
  error: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fieldDisplay(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ConvertLeadModal({
  leadName,
  fieldValues,
  sessionToken,
  onConvert,
  onClose,
  converting,
  error,
}: ConvertLeadModalProps) {
  const [accountMode, setAccountMode] = useState<'create' | 'existing'>('create');
  const [existingAccountId, setExistingAccountId] = useState<string | null>(null);
  const [existingAccountName, setExistingAccountName] = useState<string | null>(null);
  const [createOpportunity, setCreateOpportunity] = useState(true);

  const handleConvert = () => {
    void onConvert({
      create_account: accountMode === 'create',
      account_id: accountMode === 'existing' ? existingAccountId : null,
      create_opportunity: createOpportunity,
    });
  };

  const company = fieldDisplay(fieldValues['company']);
  const firstName = fieldDisplay(fieldValues['first_name']);
  const lastName = fieldDisplay(fieldValues['last_name']);
  const email = fieldDisplay(fieldValues['email']);
  const phone = fieldDisplay(fieldValues['phone']);
  const title = fieldDisplay(fieldValues['title']);
  const value = fieldDisplay(fieldValues['value']);
  const source = fieldDisplay(fieldValues['source']);

  return (
    <div className={styles.overlay}>
      <div className={styles.modal} role="dialog" aria-label={`Convert Lead: ${leadName}`}>
        <h2 className={styles.modalTitle}>Convert Lead: {leadName}</h2>

        {/* Account section */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Account</h3>
          <div className={styles.radioGroup}>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="accountMode"
                value="create"
                checked={accountMode === 'create'}
                onChange={() => setAccountMode('create')}
                disabled={converting}
              />
              Create new account
            </label>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="accountMode"
                value="existing"
                checked={accountMode === 'existing'}
                onChange={() => setAccountMode('existing')}
                disabled={converting}
              />
              Link to existing account
            </label>
          </div>

          {accountMode === 'create' ? (
            <table className={styles.previewTable}>
              <tbody>
                <tr>
                  <td>Account Name</td>
                  <td>{company}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <AccountSearchDropdown
              sessionToken={sessionToken}
              value={existingAccountId}
              valueName={existingAccountName}
              onChange={(id, name) => {
                setExistingAccountId(id);
                setExistingAccountName(name);
              }}
              disabled={converting}
              placeholder="Search accounts…"
            />
          )}
        </div>

        {/* Contact section */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Contact</h3>
          <table className={styles.previewTable}>
            <tbody>
              <tr>
                <td>First Name</td>
                <td>{firstName}</td>
              </tr>
              <tr>
                <td>Last Name</td>
                <td>{lastName}</td>
              </tr>
              <tr>
                <td>Email</td>
                <td>{email}</td>
              </tr>
              <tr>
                <td>Phone</td>
                <td>{phone}</td>
              </tr>
              <tr>
                <td>Job Title</td>
                <td>{title}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Opportunity section */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Opportunity</h3>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={createOpportunity}
              onChange={(e) => setCreateOpportunity(e.target.checked)}
              disabled={converting}
            />
            Create opportunity
          </label>
          {createOpportunity && (
            <table className={styles.previewTable}>
              <tbody>
                <tr>
                  <td>Opportunity Name</td>
                  <td>{company !== '—' ? `${company} - Opportunity` : '—'}</td>
                </tr>
                <tr>
                  <td>Value</td>
                  <td>{value}</td>
                </tr>
                <tr>
                  <td>Source</td>
                  <td>{source}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>

        {/* Error */}
        {error && (
          <p role="alert" className={styles.errorAlert}>
            {error}
          </p>
        )}

        {/* Actions */}
        <div className={styles.actions}>
          <button
            className={styles.btnSecondary}
            type="button"
            onClick={onClose}
            disabled={converting}
          >
            Cancel
          </button>
          <button
            className={styles.btnPrimary}
            type="button"
            onClick={handleConvert}
            disabled={converting || (accountMode === 'existing' && !existingAccountId)}
          >
            {converting ? 'Converting…' : 'Convert'}
          </button>
        </div>
      </div>
    </div>
  );
}
