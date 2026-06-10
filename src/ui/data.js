// data.js — shared posterior data + the seeded base u-sample. One source so every
// consumer uses the SAME POST and BASE_U (the per-profile undetected figures must be
// deterministic and identical to the validated core). KDE is retained for the archived
// incubation view; unused in the simplified release.

import posteriorFile from "../data/ebola_posterior_small.json";
import kdeFile from "../data/ebola_kde_polygon.json";
import { baseUniforms } from "../core/rng.js";

export const POST = posteriorFile.data.columns;
export const KDE = kdeFile.data;
export const BASE_U = baseUniforms(POST.shape.length); // fixed seeded base sample for u
export const META = posteriorFile.meta;
