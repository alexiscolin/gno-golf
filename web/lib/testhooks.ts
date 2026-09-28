// The test hooks (the camera, capture and perf rigs: ?camlog, ?shot, ?play…)
// answer in a dev build, or in a build made with NEXT_PUBLIC_TEST_HOOKS=1 (a
// production build under test, served locally); never on the public site.
const TEST_HOOKS = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_TEST_HOOKS === "1";

/** A page opened with ?camlog, where the hooks answer. */
export const camlog = () => TEST_HOOKS && typeof location !== "undefined" && /[?&]camlog/.test(location.search);
