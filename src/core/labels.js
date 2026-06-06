// labels.js — faithful port of MASS::fractions for formatting φ labels.
// The original app labels φ via MASS::fractions(phi, max.denominator=...),
// NOT 1/round(1/φ) (which mislabels non-unit fractions like 2e-3 -> "1/500").
// See activemonitr server.R:47,57 (cost, max.denominator=1e10) and
// server.R:144 (risk, max.denominator=1e6).

// Default max.denominator values used by each output in the app.
export const COST_MAXDEN = 1e10;
export const RISK_MAXDEN = 1e6;

// Port of MASS:::.rat (scalar): continued-fraction convergent of x.
// Returns { num, den }. Mirrors the matrix recurrence in MASS exactly.
export function ratApprox(x, cycles = 10, maxDenominator = 2000) {
  const b0 = 1, a0 = 0;
  const finite = Number.isFinite(x);
  const A = [b0];                 // A[,1] = b0 = 1
  const B = [Math.floor(x)];      // B[,1] = floor(x)
  let r = x - Math.floor(x);
  let len = 0;
  while (finite && r > 1 / maxDenominator && ++len <= cycles) {
    r = 1 / r;
    const b = Math.floor(r);
    r = r - b;
    A.push(1);                    // a = 1 where the term is active
    B.push(b);
  }
  // convergents: pq1 = [1,0], pq = [floor(x),1], then recurrence
  let pq1 = [b0, a0];
  let pq = [B[0], b0];
  for (let i = 1; i < B.length; i++) {
    const pq0 = pq1;
    pq1 = pq;
    pq = [B[i] * pq1[0] + A[i] * pq0[0], B[i] * pq1[1] + A[i] * pq0[1]];
  }
  return { num: pq[0], den: pq[1] };
}

// MASS::fractions label for a scalar (integer denominator collapses to "n").
export function fractionLabel(x, maxDenominator = 2000) {
  const { num, den } = ratApprox(x, 10, maxDenominator);
  return den === 1 ? String(num) : `${num}/${den}`;
}
