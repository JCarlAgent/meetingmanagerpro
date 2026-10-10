import assert from 'node:assert/strict';
import { demographicSourceLabel } from './demographicSource';

assert.equal(demographicSourceLabel('exact', true), 'Matched prospect');
assert.equal(demographicSourceLabel('probable', true), 'Probable demographic match');
assert.equal(demographicSourceLabel('fuzzy', true), 'Possible match');
assert.equal(demographicSourceLabel('exact', false), 'Demographics unavailable');
assert.equal(demographicSourceLabel(null, true), 'Demographics unavailable');
assert.equal(demographicSourceLabel(undefined, false), 'Demographics unavailable');
assert.equal(demographicSourceLabel('none', true), 'Demographics unavailable');

console.log('demographicSource checks: ok');
