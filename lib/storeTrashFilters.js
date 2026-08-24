/** Client-safe trash filters (no Firebase / Next server imports). */
export const ACTIVE_RECORD_FILTER = { deletedAt: null };
export const TRASHED_RECORD_FILTER = { deletedAt: { $ne: null } };
