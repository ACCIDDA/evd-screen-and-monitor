## gen_fixtures.R — golden test vectors from the REAL activeMonitr functions.
## Deterministic: seeded; fixtures embed their own u/sub-matrix, or pin the
## shipped posterior by sha256. Re-running must leave `git diff` clean.
##
## Usage: Rscript R/oracle/gen_fixtures.R
## Writes: test/fixtures/*.json
##
## Fixture schema:
##   { output, case, tol:{rel,abs}, posteriorSha256?, inputs:{...}, expected:{...} }
## The vitest suite asserts only the keys present in `expected`.

suppressMessages({library(activeMonitr); library(MASS); library(jsonlite); library(digest)})
.script <- sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE))
ROOT <- normalizePath(file.path(dirname(.script), "..", ".."))
FIX  <- file.path(ROOT, "test", "fixtures")
dir.create(FIX, showWarnings = FALSE, recursive = TRUE)

set.seed(20200205)  # committed seed (matches the posterior export seed)

data(pstr_gamma_params_ebola_small); D <- pstr_gamma_params_ebola_small

## sha256 of the shipped posterior payload (so fixtures pin the exact data file)
post_meta <- fromJSON(file.path(ROOT, "src/data/ebola_posterior_small.json"))$meta
POST_SHA <- post_meta$sha256

TOL_CLOSED <- list(rel = 1e-9, abs = 1e-12)
TOL_QUANT  <- list(rel = 1e-5, abs = 1e-10)

write_fixture <- function(name, obj) {
  path <- file.path(FIX, paste0(name, ".json"))
  writeLines(toJSON(obj, digits = NA, auto_unbox = TRUE, null = "null"), path)
  cat("wrote", basename(path), "\n")
}

## ---------- helpers mirroring server.R input assembly ----------
cost_mat_from <- function(p) rbind(
  cost_m       = p$costPerDay,
  cost_trt     = p$costPerCase * 1e6,
  cost_exp     = c(0, p$secondaryCases * p$costPerCase[2] * 1e6),
  cost_falsepos= 1000 * p$costFalsePos
)
gp_mean <- c(median = mean(D$median), shape = mean(D$shape), scale = mean(D$scale))

make_cost_fixture <- function(name, phis, p) {
  cm <- cost_mat_from(p)
  series <- lapply(phis, function(phi) {
    cc <- calc_monitoring_costs(durs = seq(.1, 10, .1), probs_of_disease = phi,
            per_day_hazard = 1 / p$hazardDenom, N = 100, cost_mat = cm,
            dist = "gamma", gamma_params = gp_mean)
    opt <- which.min(cc$maxcost)
    list(phi = phi,
         xs = cc$dur * gp_mean["median"], mincost = cc$mincost, maxcost = cc$maxcost,
         optimum = list(durMultiple = cc$dur[opt], durDays = cc$dur[opt] * gp_mean["median"],
                        minCost = cc$maxcost[opt]))
  })
  write_fixture(name, list(output = "cost", case = name, tol = TOL_CLOSED,
    posteriorSha256 = POST_SHA,
    inputs = list(phis = I(phis), params = p),
    expected = list(series = series)))
}

make_risk_fixture <- function(name, phi, ci, durs, samples, u, full = FALSE) {
  rows <- lapply(durs, function(dd) {
    pp <- pgamma(dd + u, shape = samples$shape, scale = samples$scale, lower.tail = FALSE) * phi
    lo <- (1 - ci) / 2
    list(d = dd, ltp = quantile(pp, lo, names = FALSE, type = 7),
         p50 = quantile(pp, .5, names = FALSE, type = 7),
         utp = quantile(pp, 1 - lo, names = FALSE, type = 7))
  })
  p50 <- sapply(rows, function(r) r$p50)
  # dynamic axis (server.R:142-155) — only meaningful when p50 > 0
  axis <- NULL
  if (all(p50 > 0)) {
    p_min <- max(10^floor(log10(min(p50))), 1e-6)
    p_max <- 10^ceiling(log10(max(p50)))
    es <- log10(p_min):log10(p_max)
    axis <- list(pMin = p_min, pMax = p_max, breaks = 10^es,
                 labels = paste0("1/", formatC(10^abs(es), format = "d", big.mark = ",")))
  }
  tbl <- lapply(rows, function(r) list(
    "Duration, in days" = r$d, "Lower bound" = round(1e4 * r$ltp, 2),
    "Median" = round(1e4 * r$p50, 2), "Upper bound" = round(1e4 * r$utp, 2)))
  expected <- list(rows = rows, table = tbl, label = as.character(fractions(phi, max.denominator = 1e6)))
  if (!is.null(axis)) expected$axis <- axis
  inputs <- list(phi = phi, ci = ci, durations = I(durs), u = I(u))
  fixture <- list(output = "risk", case = name, tol = TOL_QUANT, inputs = inputs, expected = expected)
  if (full) fixture$posteriorSha256 <- POST_SHA   # samples = the shipped posterior
  else fixture$inputs$samples <- list(shape = I(samples$shape), scale = I(samples$scale))
  write_fixture(name, fixture)
}

## ======================= INCUBATION =======================
write_fixture("incubation__default", list(output = "incubation", case = "default",
  tol = TOL_CLOSED, posteriorSha256 = POST_SHA, inputs = list(),
  expected = list(median = median(D$median), p95 = median(D$p95))))

## ======================= LABELS =======================
lab_vals <- c(1, 0.1, 0.01, 0.001, 0.0001, 0.002, 3/7, 0.123, 1/3, 5, 7/13)
for (md in c(1e6, 1e10)) {
  write_fixture(paste0("labels__maxden_", format(md, scientific = TRUE)), list(
    output = "labels", case = paste0("maxden_", md), tol = list(rel = 0, abs = 0),
    inputs = list(values = I(lab_vals), maxDenominator = md),
    expected = list(labels = I(as.character(fractions(lab_vals, max.denominator = md))))))
}

## ======================= COST =======================
DEFAULT_P <- list(costPerDay = c(10,20), costPerCase = c(3,5), secondaryCases = 4,
                  costFalsePos = c(10,30), hazardDenom = 1000)
make_cost_fixture("cost__default", c(0.001, 0.0001), DEFAULT_P)
make_cost_fixture("cost__phi_grid", c(1, 0.1, 0.01, 0.001, 0.0001), DEFAULT_P)
make_cost_fixture("cost__hazard_low",
  c(0.01, 0.001), modifyList(DEFAULT_P, list(hazardDenom = 9000, secondaryCases = 12)))
make_cost_fixture("cost__edge_phi0", c(0), DEFAULT_P)   # φ→0 closed-form edge

## ======================= RISK =======================
## default: full shipped posterior (5000 rows), committed u of length 5000
set.seed(424242); u_full <- runif(nrow(D), 1, 14)
make_risk_fixture("risk__default", phi = 0.01, ci = 0.95, durs = 1:28,
                  samples = list(shape = D$shape, scale = D$scale), u = u_full, full = TRUE)

## small phi, narrower CI, self-contained 1000-row sub-matrix
idx <- sample.int(nrow(D), 1000); sub <- D[idx, ]
set.seed(99); u_sub <- runif(1000, 1, 14)
make_risk_fixture("risk__phi_small_ci50", phi = 1e-4, ci = 0.50, durs = 1:28,
                  samples = list(shape = sub$shape, scale = sub$scale), u = u_sub)

## large u, few durations
set.seed(7); u_lg <- runif(1000, 20, 30)
make_risk_fixture("risk__large_u", phi = 0.001, ci = 0.90, durs = c(1, 5, 15, 40),
                  samples = list(shape = sub$shape, scale = sub$scale), u = u_lg)

## edge: single posterior draw (quantile of length-1)
make_risk_fixture("risk__edge_single_draw", phi = 0.01, ci = 0.95, durs = c(7, 21),
                  samples = list(shape = D$shape[1], scale = D$scale[1]), u = 7)

## edge: φ→0 (all p == 0; rows only, axis undefined)
make_risk_fixture("risk__edge_phi0", phi = 0, ci = 0.95, durs = c(7, 21),
                  samples = list(shape = sub$shape, scale = sub$scale), u = u_sub)

cat("\nall fixtures written to", FIX, "\n")
