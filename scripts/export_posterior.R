## Export the published Ebola incubation-period posterior (the 5000-row _small
## object) VERBATIM to JSON for the JS core. This is the seeded artifact from
## activemonitr/inst/analysis-code/make-app-data.R (set.seed(20200205);
## slice_sample(n=5000)). We do NOT re-thin the 3M chain — the app never uses it.
##
## Usage:  Rscript scripts/export_posterior.R
## Output: src/data/ebola_posterior_small.json  { meta, data:{n, columns} }

suppressMessages(library(activeMonitr))
## source the shared util regardless of cwd
.script <- sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE))
source(file.path(dirname(normalizePath(.script)), "_util.R"))

data(pstr_gamma_params_ebola_small)
d <- pstr_gamma_params_ebola_small

## Ship the columns the core needs (shape/scale drive survival; median/p95 are the
## stored per-draw summaries used by the incubation point estimate). idx kept for
## traceability back to the original chain.
payload <- list(
  n = nrow(d),
  columns = list(
    shape  = as.numeric(d$shape),
    scale  = as.numeric(d$scale),
    median = as.numeric(d$median),
    p95    = as.numeric(d$p95),
    idx    = as.integer(d$idx)
  )
)

write_export("src/data/ebola_posterior_small.json", payload,
             extra_meta = list(
               object  = "pstr_gamma_params_ebola_small",
               seed    = 20200205,
               source  = "make-app-data.R: set.seed(20200205); slice_sample(n=5000)",
               disease = "Ebola",
               dist    = "gamma"
             ))

## sanity echo (not part of the file)
cat(sprintf("rows=%d  median(median)=%.6f  median(p95)=%.6f\n",
            payload$n, median(payload$columns$median), median(payload$columns$p95)))
