/** Must match the cookie written in `SidebarProvider` when toggling. */
export const SIDEBAR_STATE_COOKIE = "sidebar:state";

/** Cookie value is the string "true" | "false" from `document.cookie` assignment. */
export function parseSidebarDefaultOpen(
  raw: string | undefined
): boolean | undefined {
  if (raw === "false") return false;
  if (raw === "true") return true;
  return undefined;
}
