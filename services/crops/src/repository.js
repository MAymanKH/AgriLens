const { isDeepStrictEqual } = require('node:util');
const { validateSnapshot } = require('./catalog');

const withoutCreationTime = ({created_at, ...rest}) => rest;
async function importStaging(Model, document) {
  validateSnapshot(document);
  if (document.status !== 'staging' || document.approval !== null || document.kind !== 'observed') {
    throw new Error('Only observed, unapproved staging catalogs can be imported.');
  }
  // A catalog is one atomic document. Insert-only avoids partial publication,
  // prevents overwriting approved data, and makes concurrent retries harmless.
  const existing = await Model.findById(document._id).lean();
  if (existing) return verifyExisting(existing, document);
  try { await Model.create({...document, created_at: new Date()}); return 'inserted'; }
  catch (error) {
    if (error.code !== 11000) throw error;
    return verifyExisting(await Model.findById(document._id).lean(), document);
  }
}
function verifyExisting(existing, document) {
  if (!existing || !isDeepStrictEqual(withoutCreationTime(existing), withoutCreationTime(document))) {
    throw new Error('Existing catalog revision conflicts with this file. Use a new revision ID; nothing was overwritten.');
  }
  validateSnapshot(existing);
  return 'unchanged';
}
module.exports = { importStaging, verifyExisting };
