/**
 * Host half of `dsh-open-exit-animation`.
 *
 * This package contributes browser presentation only: the animation lives entirely in the
 * client bundle (`exports["./client"]`, declared through `dsh.client` in the manifest), which
 * `@deepseek-ai/dsh-client-modules` scans off this loader row and hands to the page.
 *
 * The host row itself must exist and mount cleanly, so the client scan finds a package
 * manifest; it intentionally does nothing else. In particular it registers no
 * `webserver/index-inject` row and no asset route — the desktop shell's index-inject table is
 * collected once at host start and never refreshed, so a script-row based delivery would add a
 * failure mode for no benefit here.
 */

/** Host plugin body — intentionally empty (browser-only contribution). */
export function apply() {}
