/** Constants for the skills module. */

/** Initial version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Default skill type when none is specified/derivable during import. */
export const DEFAULT_SKILL_TYPE = 'custom';

/** Multipart upload cap for the import-preview route (256 KiB, one file). */
export const IMPORT_MAX_FILE_SIZE = 256 * 1024;

/** File extensions treated as archive entries that "look executable". Never
 *  decoded, written, or executed — only listed in `executable_entries`. */
export const EXECUTABLE_EXTENSIONS = ['.sh', '.js', '.py', '.exe'];
