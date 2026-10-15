/**
 * Two-bound-parameter quote access predicate (token hash, token hash).
 *
 * Links stored in quote_public_links are authoritative: a revoked entry must
 * never be rescued by the old quotes.public_token_hash column. Old quotations
 * created before the link table existed are still readable only while their
 * historical token has NO matching link row at all.
 *
 * Every public quote reader and payment/acceptance route must use this same
 * predicate so revocation has identical behavior across all endpoints.
 *
 * IMPORTANT: SQL assumes quotes alias "q". Do not interpolate untrusted input.
 */
export const QUOTE_PUBLIC_TOKEN_PREDICATE = `(
  EXISTS (
    SELECT 1 FROM quote_public_links token_link
    WHERE token_link.quote_id=q.id
      AND token_link.token_hash=?
      AND token_link.revoked_at IS NULL
  )
  OR (
    q.public_token_hash=?
    AND NOT EXISTS (
      SELECT 1 FROM quote_public_links historical_token_link
      WHERE historical_token_link.quote_id=q.id
        AND historical_token_link.token_hash=q.public_token_hash
    )
  )
)`;
