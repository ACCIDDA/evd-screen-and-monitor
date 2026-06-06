// stats.js — JS ports of the R distribution functions the Ebola core relies on.
// Phase 1 is gamma-only: pgamma (matches R to ~5e-14) + R type-7 quantiles.
// The lognormal/erf path (for COVID) is intentionally deferred — see METHODS.md.

// log-gamma via Lanczos (matches R's lgamma to ~1e-14)
export function gammaln(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) { y += 1; ser += c[j] / y; }
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

// Lower regularized incomplete gamma P(a,x) (Numerical Recipes: series + CF)
export function lowerRegGamma(a, x) {
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 0;
  if (x < a + 1) {                       // series expansion
    let ap = a, del = 1 / a, sum = del;
    for (let n = 0; n < 2000; n++) {
      ap += 1; del *= x / ap; sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-16) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - gammaln(a));
  } else {                                // continued fraction for Q = 1-P
    const FPMIN = 1e-300;
    let b = x + 1 - a, c = 1 / FPMIN, d = 1 / b, h = d;
    for (let i = 1; i < 2000; i++) {
      const an = -i * (i - a);
      b += 2; d = an * d + b; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = b + an / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-16) break;
    }
    const Q = Math.exp(-x + a * Math.log(x) - gammaln(a)) * h;
    return 1 - Q;
  }
}

// pgamma(q, shape, scale); lowerTail=false gives the survival function S(q)
export function pgamma(q, shape, scale, lowerTail = true) {
  const p = lowerRegGamma(shape, q / scale);
  return lowerTail ? p : 1 - p;
}

// R's default type-7 quantile on an already-ascending-sorted numeric array
export function quantileSorted(sorted, p) {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const h = (n - 1) * p, lo = Math.floor(h), frac = h - lo;
  return lo + 1 < n ? sorted[lo] + frac * (sorted[lo + 1] - sorted[lo]) : sorted[lo];
}

// convenience: type-7 quantile of an UNSORTED array (sorts a copy, numeric compare)
export function quantile(values, p) {
  return quantileSorted([...values].sort((a, b) => a - b), p);
}
