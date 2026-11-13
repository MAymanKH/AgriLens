const mongoose = require('mongoose');
const { isDeepStrictEqual } = require('node:util');
const { validateSnapshot } = require('./catalog');

// Preserve the full candidate record, including its pending evidence notes.
// Only toApi() decides which fields go out over HTTP.
function model(connection) {
  const schema = new mongoose.Schema({
    _id: {type: String, required: true}, schema_version: {type: Number, required: true, enum: [1]},
    decision_revision: {type: String, required: true}, region: {type: mongoose.Schema.Types.Mixed, required: true},
    kind: {type: String, enum: ['fixture', 'observed'], required: true},
    status: {type: String, enum: ['staging', 'sealed', 'approved', 'rejected'], required: true},
    created_at: {type: Date, required: true}, approval: {type: mongoose.Schema.Types.Mixed, default: null},
    limitations: [String], slot_order: [String], crops: [mongoose.Schema.Types.Mixed], sources: [mongoose.Schema.Types.Mixed]
  }, {collection: 'crop_catalogs', strict: 'throw', versionKey: false, autoCreate: false, autoIndex: false, bufferCommands: false});
  schema.pre('validate', function () { validateSnapshot(this.toObject()); });
  return connection.model('CropCatalog', schema);
}

async function connect(config) {
  const connection = mongoose.createConnection(config.uri, {
    dbName: config.dbName, serverSelectionTimeoutMS: config.timeout,
    connectTimeoutMS: config.timeout, socketTimeoutMS: config.timeout,
    maxPoolSize: 5, autoCreate: false, autoIndex: false
  });
  try { await connection.asPromise(); return connection; }
  catch (error) { await connection.close().catch(() => {}); throw error; }
}

// Matches the existing Python importer's validator so the two tools coexist.
const string = {bsonType: 'string', minLength: 1};
const properties = {
  _id: string, schema_version: {bsonType: 'int', enum: [1]}, decision_revision: string,
  region: {bsonType: 'object', required: ['id', 'name', 'coordinates'], properties: {id: string, name: string, coordinates: {bsonType: 'object'}}},
  kind: {enum: ['fixture', 'observed']}, status: {enum: ['staging', 'sealed', 'approved', 'rejected']},
  created_at: {bsonType: 'date'}, approval: {bsonType: ['object', 'null']},
  limitations: {bsonType: 'array', items: {bsonType: 'string'}},
  slot_order: {bsonType: 'array', minItems: 4, maxItems: 4}, crops: {bsonType: 'array'}, sources: {bsonType: 'array'}
};
const validator = {$jsonSchema: {bsonType: 'object', required: Object.keys(properties), properties}};
async function ensureCollection(connection) {
  let info = await connection.db.listCollections({name: 'crop_catalogs'}).next();
  if (!info) {
    try { await connection.db.createCollection('crop_catalogs', {validator, validationLevel: 'strict', validationAction: 'error'}); }
    catch (error) { if (error.code !== 48) throw error; }
    info = await connection.db.listCollections({name: 'crop_catalogs'}).next();
  }
  if (!isDeepStrictEqual(info.options.validator, validator) || info.options.validationLevel !== 'strict' || info.options.validationAction !== 'error') {
    throw new Error('Incompatible collection validator. No existing definitions were changed.');
  }
}
module.exports = { connect, model, ensureCollection };
