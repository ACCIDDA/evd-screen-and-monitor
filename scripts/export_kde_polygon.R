## Export the Ebola incubation-period KDE credible region as polygon vertices.
## The original app renders ggplot stat_contour(geom="polygon") at a single level
## (kde_ebola$contour_level) over the 151x151 density grid (kde_ebola$contour_df).
## We run the equivalent marching-squares (grDevices::contourLines) here, R-side,
## so the browser only draws paths. The contour may be several disjoint loops.
##
## Usage:  Rscript scripts/export_kde_polygon.R
## Output: src/data/ebola_kde_polygon.json  { meta, data:{level, point, polygons:[{x,y}]} }

suppressMessages(library(activeMonitr))
.script <- sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE))
source(file.path(dirname(normalizePath(.script)), "_util.R"))

data(kde_ebola)
data(pstr_gamma_params_ebola_small)
cd    <- kde_ebola$contour_df          # cols: Var1 (median, x), Var2 (p95, y), value (density)
level <- kde_ebola$contour_level

## Rebuild the gridded density matrix z[x, y] robustly (independent of row order).
x <- sort(unique(cd$Var1))
y <- sort(unique(cd$Var2))
z <- matrix(NA_real_, nrow = length(x), ncol = length(y))
z[cbind(match(cd$Var1, x), match(cd$Var2, y))] <- cd$value
stopifnot(!anyNA(z))

cl <- contourLines(x = x, y = y, z = z, levels = level)
polygons <- lapply(cl, function(p) list(x = as.numeric(p$x), y = as.numeric(p$y)))

## the plotted point estimate (median of the stored per-draw summaries)
point <- list(
  median = median(pstr_gamma_params_ebola_small$median),
  p95    = median(pstr_gamma_params_ebola_small$p95)
)

payload <- list(level = level, point = point, polygons = polygons)

write_export("src/data/ebola_kde_polygon.json", payload,
             extra_meta = list(
               object  = "kde_ebola",
               disease = "Ebola",
               axes    = list(x = "median incubation (days)", y = "95th pct incubation (days)")
             ))

cat(sprintf("level=%.7f  polygons=%d  vertices=%d  point=(%.3f, %.3f)\n",
            level, length(polygons), sum(sapply(polygons, function(p) length(p$x))),
            point$median, point$p95))
