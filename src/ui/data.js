// data.js — shared posterior / KDE data and the seeded base u-sample.
// Single source so main.js (risk/cost/incubation) and scenario.js (the timeline link)
// use the SAME POST and BASE_U — otherwise the timeline's number could diverge from the
// Undetected-infections tab.

import posteriorFile from "../data/ebola_posterior_small.json";
import kdeFile from "../data/ebola_kde_polygon.json";
import { baseUniforms } from "../core/rng.js";

export const POST = posteriorFile.data.columns;
export const KDE = kdeFile.data;
export const BASE_U = baseUniforms(POST.shape.length); // fixed seeded base sample for u
export const META = posteriorFile.meta;
