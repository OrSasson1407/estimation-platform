/**
 * FIX #7: This file previously duplicated hook implementations from hooks/api/index.ts
 * with slightly different behaviour (missing setQueryData calls, staleTime, etc.).
 *
 * It is now a thin re-export shim so existing imports keep working while
 * all logic lives in one place. The canonical source is hooks/api/index.ts.
 *
 * TODO: migrate all import sites to hooks/api/index.ts and delete this file.
 */
export {
  useGenerateEstimation,
  useEstimation,
  useEstimationExplanation,
  useOverrideEstimation,
} from "./api/index";
