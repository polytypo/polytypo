// Evidence identity: one SHA-256 hash that names "this exact review, over this exact code and
// corpus", used to namespace REVIEW.html's local decision storage and to fail closed on an
// import from a stale or different bundle (Stage 10 Pass A second correction, item 5).
//
// Hash-cycle avoidance, documented explicitly because it is easy to get backwards: this hash is
// computed from changes.json's and REVIEW.md's own CONTENT (their SHA-256 digests), never from
// manifest.json (manifest.json embeds this hash, so including manifest.json would be circular) and
// never from REVIEW.html's own digest (REVIEW.html embeds this hash as a static value baked in at
// generation time, which happens strictly after this hash is computed -- including REVIEW.html's
// digest here would make the hash depend on a file whose own content depends on the hash).
// manifest.json and REVIEW.html are digested too (see `ArtifactDigest`/`EvidenceBlock` below), but
// purely for evidence-integrity bookkeeping, never as an input to this function.
import { createHash } from "node:crypto";

export interface ArtifactDigest {
  sha256: string;
  bytes: number;
}

export function digestArtifact(content: string): ArtifactDigest {
  const buf = Buffer.from(content, "utf8");
  return { sha256: createHash("sha256").update(buf).digest("hex"), bytes: buf.length };
}

export interface EvidenceReviewHashInput {
  implementationAggregateHash: string;
  corpusAggregateHash: string;
  locale: string;
  mode: string;
  dialect: string;
  specVersion: string;
  changesJsonSha256: string;
  reviewMarkdownSha256: string;
}

const EVIDENCE_REVIEW_HASH_SCHEMA_VERSION = 1;

/** Deterministically derives one identity hash for a review bundle. Same inputs -> same hash,
 * always (order-sensitive field list below, explicit schema version so a future field addition is
 * itself a documented, detectable hash change rather than silent drift). Changing ANY one of these
 * fields -- a code change, a different corpus snapshot, a different locale/mode/dialect, a spec
 * bump, or any edit to changes.json/REVIEW.md's own content -- changes the hash. */
export function computeEvidenceReviewHash(input: EvidenceReviewHashInput): string {
  const canonical = JSON.stringify({
    schemaVersion: EVIDENCE_REVIEW_HASH_SCHEMA_VERSION,
    implementationAggregateHash: input.implementationAggregateHash,
    corpusAggregateHash: input.corpusAggregateHash,
    locale: input.locale,
    mode: input.mode,
    dialect: input.dialect,
    specVersion: input.specVersion,
    changesJsonSha256: input.changesJsonSha256,
    reviewMarkdownSha256: input.reviewMarkdownSha256,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export interface EvidenceBlock {
  evidenceReviewHash: string;
  evidenceReviewHashSchemaVersion: number;
  artifacts: {
    changesJson: ArtifactDigest;
    reviewMarkdown: ArtifactDigest;
    reviewHtml: ArtifactDigest;
  };
}
