/**
 * True only in the read-only GitHub Pages build (TESTBRAID_STATIC_DEMO=1 at
 * build time, see vite.config.ts). That site has no PHP backend: public test
 * data are static files and the author area does not exist.
 *
 * The typeof guard keeps modules usable where the build constant is not
 * defined, such as the DOM tests, which then behave as a normal installation.
 */
declare const __TESTBRAID_STATIC_DEMO__: boolean

export const STATIC_DEMO = typeof __TESTBRAID_STATIC_DEMO__ !== 'undefined' && __TESTBRAID_STATIC_DEMO__
