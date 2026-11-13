import { MongoClient } from "mongodb";

let client;
let connectionPromise;

const getDatabaseName = () => process.env.CLIMATE_DB_NAME || "agrilens_climate";

export const DBConnection = async () => {
  if (!connectionPromise) {
    client = new MongoClient(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017", {
      serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 2000),
      connectTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 2000),
      socketTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 2000),
    });
    connectionPromise = client.connect().then(async () => {
      await client.db(getDatabaseName()).collection("climate_daily").createIndex(
        { dataset_id: 1, date: 1 },
        { unique: true, name: "dataset_date_unique" },
      );
      return client;
    }).catch(async (error) => {
      connectionPromise = undefined;
      await client?.close().catch(() => {});
      client = undefined;
      throw error;
    });
  }
  return connectionPromise;
};

export const pingDatabase = async () => {
  const connectedClient = await DBConnection();
  return connectedClient.db(getDatabaseName()).command({ ping: 1 });
};

export const getDatasetManifest = async (datasetId) => {
  const connectedClient = await DBConnection();
  return connectedClient.db(getDatabaseName()).collection("climate_datasets")
    .findOne({ _id: datasetId });
};

export const getClimateData = async (datasetId) => {
  const connectedClient = await DBConnection();
  const db = connectedClient.db(getDatabaseName());
  const manifest = await getDatasetManifest(datasetId);
  if (!manifest) return null;

  const daily = await db.collection("climate_daily")
    .find(
      { dataset_id: datasetId },
      { projection: { _id: 0, date: 1, tmax_c: 1, rain_mm: 1 } },
    )
    .sort({ date: 1 })
    .toArray();

  return { manifest, daily };
};

export const closeDatabase = async () => {
  const currentClient = client;
  client = undefined;
  connectionPromise = undefined;
  if (currentClient) await currentClient.close();
};
