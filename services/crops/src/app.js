const express = require('express');
const { validateApi, validateSnapshot, toApi } = require('./catalog');

class ApiError extends Error {
  constructor(code, status, message) { super(message); this.code = code; this.status = status; }
}
function createApp({mode, catalogId = '', Model, getModel, fixture}) {
  if (!['live', 'fixture'].includes(mode)) throw new Error('Invalid data mode.');
  if (mode === 'fixture') validateApi(fixture);
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-AgriLens-Data-Mode', mode);
    next();
  });
  const insufficient = () => new ApiError('INSUFFICIENT_DATA', 422, 'No approved crop catalog is available for this region. Research approval and a pinned catalog revision are required.');
  async function load(regionId) {
    if (mode === 'fixture') return fixture;
    // Check availability first; even with no selected release an outage stays retryable.
    const selectedModel = getModel ? await getModel() : Model;
    await selectedModel.db.db.command({ping: 1});
    if (!catalogId) throw insufficient();
    const doc = await selectedModel.findOne({_id: catalogId}).lean().maxTimeMS(1500);
    if (!doc) throw insufficient();
    if (regionId && doc.region?.id !== regionId) throw new ApiError('UNKNOWN_REGION', 404, 'This region is not supported.');
    try { validateSnapshot(doc, {live: true}); }
    catch { throw insufficient(); }
    return toApi(doc);
  }
  app.get('/health', async (req, res, next) => {
    try { await load(); res.json({status: 'ok'}); }
    catch { next(new ApiError('SERVICE_UNAVAILABLE', 503, 'Crop service is not ready. Check MongoDB and the selected approved catalog.')); }
  });
  app.get('/internal/crops', async (req, res) => {
    const regionId = req.query.region_id;
    if (typeof regionId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(regionId)) {
      throw new ApiError('INVALID_INPUT', 400, 'Provide one nonempty region_id containing letters, numbers, underscores or hyphens.');
    }
    if (mode === 'fixture' && regionId !== fixture.region_id) throw new ApiError('UNKNOWN_REGION', 404, 'This region is not supported.');
    const catalog = await load(regionId);
    if (regionId !== catalog.region_id) throw new ApiError('UNKNOWN_REGION', 404, 'This region is not supported.');
    res.json(catalog);
  });
  app.use((req, res) => res.status(404).json({error: {code: 'INVALID_INPUT', message: 'Input Invalid'}}));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const safe = error instanceof ApiError ? error : new ApiError('SERVICE_UNAVAILABLE', 503, 'Crop storage is unavailable. Please retry.');
    res.status(safe.status).json({error: {code: safe.code, message: safe.message}});
  });
  return app;
}
module.exports = { createApp };
