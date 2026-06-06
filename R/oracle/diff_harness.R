## diff_harness.R — differential fuzz: seeded random inputs through BOTH the real
## activeMonitr R math and the JS core (via src/core/cli.js), compared within
## tolerance. Catches cases the fixed golden fixtures miss.
##
## Usage: Rscript R/oracle/diff_harness.R [N]
## Requires: R + activeMonitr + a `node` on PATH. Exits non-zero on any divergence.

suppressMessages({library(activeMonitr); library(jsonlite)})
.script <- sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE))
ROOT <- normalizePath(file.path(dirname(.script), "..", ".."))

args <- commandArgs(trailingOnly = TRUE)
N <- if (length(args) >= 1) as.integer(args[1]) else 200
set.seed(12345)

data(pstr_gamma_params_ebola_small); D <- pstr_gamma_params_ebola_small

TOL_CLOSED <- list(rel = 1e-9,  abs = 1e-12)
TOL_QUANT  <- list(rel = 1e-5,  abs = 1e-10)

rand_sub <- function(n = 200) D[sample.int(nrow(D), n), ]
rdraw    <- function(lo, hi) runif(1, lo, hi)

jobs <- vector("list", N); refs <- vector("list", N); tols <- vector("list", N)

for (i in seq_len(N)) {
  kind <- sample(c("incubation", "cost", "risk"), 1, prob = c(0.2, 0.4, 0.4))
  sub <- rand_sub(200)

  if (kind == "incubation") {
    jobs[[i]] <- list(id = i - 1, output = "incubation",
      samples = list(median = I(sub$median), p95 = I(sub$p95)), inputs = list())
    refs[[i]] <- list(median = median(sub$median), p95 = median(sub$p95))
    tols[[i]] <- TOL_CLOSED

  } else if (kind == "cost") {
    phis <- sort(sample(c(1, .1, .01, .001, .0001, rdraw(1e-4, .3)), sample(1:3, 1)), decreasing = TRUE)
    cpc <- sort(c(rdraw(0, 20), rdraw(0, 20))); cpd <- sort(c(rdraw(0, 100), rdraw(0, 100)))
    cfp <- sort(c(rdraw(0, 100), rdraw(0, 100)))
    p <- list(costPerDay = cpd, costPerCase = cpc, secondaryCases = sample(0:25, 1),
              costFalsePos = cfp, hazardDenom = round(rdraw(10, 10000)))
    gp <- c(median = mean(sub$median), shape = mean(sub$shape), scale = mean(sub$scale))
    cm <- rbind(cost_m = p$costPerDay, cost_trt = p$costPerCase * 1e6,
                cost_exp = c(0, p$secondaryCases * p$costPerCase[2] * 1e6),
                cost_falsepos = 1000 * p$costFalsePos)
    series <- lapply(phis, function(phi) {
      cc <- calc_monitoring_costs(seq(.1, 10, .1), phi, 1 / p$hazardDenom, 100, cm, "gamma", gp)
      opt <- which.min(cc$maxcost)
      list(lo = cc$mincost, hi = cc$maxcost, xs = cc$dur * gp["median"],
           opt = list(durMultiple = cc$dur[opt], durDays = cc$dur[opt] * gp["median"], minCost = cc$maxcost[opt]))
    })
    jobs[[i]] <- list(id = i - 1, output = "cost",
      samples = list(median = I(sub$median), shape = I(sub$shape), scale = I(sub$scale)),
      inputs = list(phis = I(phis), params = p))
    refs[[i]] <- list(series = series); tols[[i]] <- TOL_CLOSED

  } else { # risk
    phi <- rdraw(1e-5, .2); ci <- rdraw(.5, .99)
    durs <- sort(sample(1:50, sample(3:10, 1))); ulo <- rdraw(0, 10); uhi <- ulo + rdraw(1, 15)
    u <- runif(nrow(sub), ulo, uhi); lo <- (1 - ci) / 2
    rows <- lapply(durs, function(dd) {
      pp <- pgamma(dd + u, shape = sub$shape, scale = sub$scale, lower.tail = FALSE) * phi
      list(d = dd, ltp = quantile(pp, lo, names = FALSE, type = 7),
           p50 = quantile(pp, .5, names = FALSE, type = 7),
           utp = quantile(pp, 1 - lo, names = FALSE, type = 7))
    })
    jobs[[i]] <- list(id = i - 1, output = "risk",
      samples = list(shape = I(sub$shape), scale = I(sub$scale)),
      inputs = list(phi = phi, ci = ci, durations = I(durs), u = I(u)))
    refs[[i]] <- list(rows = rows); tols[[i]] <- TOL_QUANT
  }
}

## ---- run the JS core once over the whole batch ----
tmp_in <- tempfile(fileext = ".json")
writeLines(toJSON(jobs, digits = NA, auto_unbox = TRUE, null = "null"), tmp_in)
node <- Sys.which("node"); if (node == "") stop("node not found on PATH")
js_out <- system2(node, c(file.path(ROOT, "src/core/cli.js")), stdin = tmp_in, stdout = TRUE)
res <- fromJSON(paste(js_out, collapse = ""), simplifyVector = FALSE)
res <- res[order(sapply(res, function(r) r$id))]

## ---- compare ----
close <- function(a, e, tol) abs(a - e) <= tol$abs + tol$rel * abs(e)
fails <- 0; worst <- 0
report <- function(ok, a, e, tol, what) {
  d <- abs(a - e) / max(1e-300, abs(e)); worst <<- max(worst, d)
  if (!ok) { fails <<- fails + 1; if (fails <= 20)
    cat(sprintf("  DIVERGE %s: js=%.12g r=%.12g rel=%.3g\n", what, a, e, d)) }
}
cmp_vec <- function(a, e, tol, what) for (k in seq_along(e)) report(close(a[[k]], e[[k]], tol), a[[k]], e[[k]], tol, sprintf("%s[%d]", what, k))

for (i in seq_len(N)) {
  jr <- res[[i]]$result; rr <- refs[[i]]; tol <- tols[[i]]; out <- jobs[[i]]$output
  if (out == "incubation") {
    report(close(jr$median, rr$median, tol), jr$median, rr$median, tol, sprintf("job%d inc.median", i))
    report(close(jr$p95, rr$p95, tol), jr$p95, rr$p95, tol, sprintf("job%d inc.p95", i))
  } else if (out == "cost") {
    for (s in seq_along(rr$series)) {
      cmp_vec(jr$series[[s]]$lo, rr$series[[s]]$lo, tol, sprintf("job%d s%d lo", i, s))
      cmp_vec(jr$series[[s]]$hi, rr$series[[s]]$hi, tol, sprintf("job%d s%d hi", i, s))
      o <- rr$series[[s]]$opt; jo <- jr$optima[[s]]
      report(close(jo$durDays, o$durDays, tol), jo$durDays, o$durDays, tol, sprintf("job%d s%d optDays", i, s))
      report(close(jo$minCost, o$minCost, tol), jo$minCost, o$minCost, tol, sprintf("job%d s%d optCost", i, s))
    }
  } else {
    for (k in seq_along(rr$rows)) {
      for (q in c("ltp", "p50", "utp"))
        report(close(jr$rows[[k]][[q]], rr$rows[[k]][[q]], tol), jr$rows[[k]][[q]], rr$rows[[k]][[q]], tol, sprintf("job%d d%d %s", i, k, q))
    }
  }
}

cat(sprintf("\n%d jobs compared. worst relative diff = %.3e. divergences = %d\n", N, worst, fails))
if (fails > 0) quit(status = 1)
cat("DIFFERENTIAL HARNESS PASSED\n")
