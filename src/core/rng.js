// rng.js — tiny seeded PRNG so the dashboard's `u` draw is reproducible.
// (The original app calls runif() every render; we fix a seeded base sample and
// affine-map it to the chosen [u_lo, u_hi], which is deterministic and still
// responds to the slider. See METHODS.md.)

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// n fixed uniform(0,1) draws from a seed.
export function baseUniforms(n, seed = 20200205) {
  const rnd = mulberry32(seed);
  return Array.from({ length: n }, () => rnd());
}

// affine-map base uniforms into [lo, hi]
export function scaleU(base, lo, hi) {
  return base.map((b) => lo + (hi - lo) * b);
}
