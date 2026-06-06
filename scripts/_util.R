## Shared helpers for deterministic, checksummed JSON exports.
## Determinism: no wall-clock timestamps inside exported files (would break the
## CI drift guard). Provenance is the pinned activeMonitr version + a content
## sha256 over the scientific payload only.

suppressMessages({
  library(jsonlite)
  library(digest)
})

ACTIVEMONITR_VERSION <- as.character(packageVersion("activeMonitr"))
CITATION <- "Reich NG, Lessler J, Varma JK, Vora NM (2018). Quantifying the risk and cost of active monitoring for infectious diseases. Sci Rep 8:1093. doi:10.1038/s41598-018-19406-x"

## Canonical JSON for a payload (stable key order, full double precision).
canonical_json <- function(payload) {
  toJSON(payload, digits = NA, auto_unbox = TRUE, null = "null")
}

## sha256 over the canonical serialization of the scientific payload only.
payload_sha256 <- function(payload) {
  digest(canonical_json(payload), algo = "sha256", serialize = FALSE)
}

## Write { meta: {...}, data: <payload> } with a content checksum in meta.
## The checksum covers `data` only, so meta fields never affect it.
write_export <- function(path, payload, extra_meta = list()) {
  meta <- c(list(
    activeMonitrVersion = ACTIVEMONITR_VERSION,
    citation = CITATION,
    sha256 = payload_sha256(payload)
  ), extra_meta)
  obj <- list(meta = meta, data = payload)
  writeLines(toJSON(obj, digits = NA, auto_unbox = TRUE, null = "null"), path)
  cat(sprintf("wrote %s  (sha256 %s…)\n", path, substr(meta$sha256, 1, 12)))
  invisible(meta$sha256)
}
