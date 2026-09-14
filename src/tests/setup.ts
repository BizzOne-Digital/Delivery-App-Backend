import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { beforeAll, afterAll, afterEach } from "vitest";

let mongo: MongoMemoryServer;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.JWT_ACCESS_SECRET = "test-access-secret-min-16-chars";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret-min-16-chars";
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri("delivery-app");
  process.env.JWT_ACCESS_SECRET = "test-access-secret-min-16-chars";
  process.env.JWT_REFRESH_SECRET = "test-refresh-secret-min-16-chars";
  await mongoose.connect(process.env.MONGODB_URI);
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key]!.deleteMany({});
  }
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongo) {
    await mongo.stop();
  }
});
