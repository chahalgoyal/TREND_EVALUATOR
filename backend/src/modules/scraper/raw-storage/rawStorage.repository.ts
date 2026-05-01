import { db } from '../../../config/database';
import { RawPostFragment } from '../connectors/interface';
import { logger } from '../../../shared/logger';

/**
 * RawStorageRepository — writes raw payloads to DB and reads them back.
 * SRS §3.7: raw_payloads table with 72h TTL.
 */
export class RawStorageRepository {
  /**
   * Store a raw post fragment and return the raw_payload UUID.
   */
  async store(
    fragment: RawPostFragment,
    platformId: number,
    jobId: string
  ): Promise<string> {
    let jsonPayload = null;
    if (fragment.postJson) {
      const rawJson = JSON.stringify(fragment.postJson);
      // PostgreSQL does not support null bytes \u0000 in text/jsonb fields. 
      // We must strip them out to prevent insertion errors.
      jsonPayload = rawJson.replace(/\\u0000/g, '');
    }

    const result = await db.query(
      `INSERT INTO raw_payloads (platform_id, job_id, source_type, payload_html, payload_json, parse_status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING id`,
      [
        platformId,
        jobId,
        fragment.source,
        fragment.postHtml ?? null,
        jsonPayload,
      ]
    );
    return result.rows[0].id;
  }

  /**
   * Get a raw payload by ID.
   */
  async getById(id: string): Promise<any | null> {
    const result = await db.query(
      `SELECT * FROM raw_payloads WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Update parse_status for a raw payload.
   */
  async updateStatus(id: string, status: 'pending' | 'success' | 'failed' | 'retrying'): Promise<void> {
    await db.query(
      `UPDATE raw_payloads SET parse_status = $2 WHERE id = $1`,
      [id, status]
    );
  }

  /**
   * Cleanup expired raw payloads.
   */
  async cleanupExpired(): Promise<number> {
    const result = await db.query(
      `DELETE FROM raw_payloads WHERE expires_at < NOW()`
    );
    const count = result.rowCount ?? 0;
    if (count > 0) {
      logger.info({ deletedCount: count }, 'Cleaned up expired raw payloads');
    }
    return count;
  }
}

export const rawStorageRepository = new RawStorageRepository();
