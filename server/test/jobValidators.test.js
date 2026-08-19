'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateJobData } = require('../utils/jobValidators');

function minimalJob(overrides = {}) {
  return { quoteNumber: 'Q-1', clientName: 'Test Client', ...overrides };
}

test('validateJobData accepts a minimal valid payload', () => {
  const result = validateJobData(minimalJob());
  assert.equal(result.quoteNumber, 'Q-1');
});

test('validateJobData rejects a missing required quoteNumber', () => {
  assert.throws(() => validateJobData({ clientName: 'No Quote Number' }), /Quote number is required/);
});

test('validateJobData rejects a non-object payload', () => {
  assert.throws(() => validateJobData(null), /Job data is required/);
  assert.throws(() => validateJobData('not an object'), /Job data is required/);
  assert.throws(() => validateJobData([]), /Job data is required/);
});

test('validateJobData rejects a field over its length ceiling', () => {
  const tooLong = 'x'.repeat(201); // SHORT ceiling is 200
  assert.throws(() => validateJobData(minimalJob({ clientName: tooLong })), /at most 200 characters/);
});

test('validateJobData rejects an invalid outcome value', () => {
  assert.throws(() => validateJobData(minimalJob({ outcome: 'definitely-not-real' })), /Outcome is invalid/);
});

test('validateJobData accepts every real outcome value', () => {
  for (const outcome of ['pass', 'work', 'monitor']) {
    assert.doesNotThrow(() => validateJobData(minimalJob({ outcome })));
  }
});

test('validateJobData rejects a non-numeric amount', () => {
  assert.throws(() => validateJobData(minimalJob({ grandTotal: 'a lot' })), /must be a number/);
});

test('validateJobData rejects a discount above 100%', () => {
  assert.throws(() => validateJobData(minimalJob({ discount: 150 })), /out of range/);
});

test('validateJobData rejects a lineItems array over the 300-entry ceiling', () => {
  const lineItems = Array.from({ length: 301 }, (_, i) => ({ description: `Item ${i}` }));
  assert.throws(() => validateJobData(minimalJob({ lineItems })), /at most 300 entries/);
});

test('validateJobData rejects a malformed line item', () => {
  assert.throws(() => validateJobData(minimalJob({ lineItems: ['not an object'] })), /Line items\[0\] is invalid/);
});

test('validateJobData rejects an invalid project.status', () => {
  const data = minimalJob({ project: { status: 'not-a-real-status' } });
  assert.throws(() => validateJobData(data), /project.status is invalid/);
});

test('validateJobData accepts every real project.status value', () => {
  for (const status of ['planned', 'in_progress', 'completed']) {
    assert.doesNotThrow(() => validateJobData(minimalJob({ project: { status } })));
  }
});

test('validateJobData rejects a project.staffWages entry over 500 entries', () => {
  const staffWages = Array.from({ length: 501 }, (_, i) => ({ name: `Worker ${i}`, amount: 100 }));
  assert.throws(() => validateJobData(minimalJob({ project: { staffWages } })), /at most 500 entries/);
});

test('validateJobData rejects a negative time entry beyond its ceiling', () => {
  const data = minimalJob({ project: { timeEntries: [{ hours: 999_999 }] } });
  assert.throws(() => validateJobData(data), /out of range/);
});
