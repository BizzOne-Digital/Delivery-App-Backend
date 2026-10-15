import "dotenv/config";

const dbName =
  process.env.MONGODB_DB_NAME ??
  (() => {
    try {
      const u = new URL(process.env.MONGODB_URI?.replace("mongodb+srv://", "https://") ?? "");
      return u.pathname.replace(/^\//, "") || "delivery-app";
    } catch {
      return "delivery-app";
    }
  })();

const collections = [
  { name: "orders", key: { companyId: 1, _id: 1 } },
  { name: "users", key: { companyId: 1, _id: 1 } },
  { name: "pharmacies", key: { companyId: 1, _id: 1 } },
  { name: "customers", key: { companyId: 1, _id: 1 } },
  { name: "notifications", key: { userId: 1, _id: 1 } },
];

console.log(`
MongoDB Atlas sharding (run in mongosh connected to your cluster admin / mongos)
Database: ${dbName}

1) Enable a Sharded Cluster (M10+ in Atlas → Clusters → Create → Sharded).
2) Point MONGODB_URI at the cluster mongos connection string (same app code).
3) Shard collections (hashed or ranged on companyId keeps tenant data together):

`);

for (const c of collections) {
  const key = JSON.stringify(c.key);
  console.log(`sh.shardCollection("${dbName}.${c.name}", ${key});`);
}

console.log(`
App-side (already in repo):
- Connection pool + optional read preference (MONGODB_READ_PREFERENCE)
- Scale indexes on connect (companyId-first compounds)
- Optional MONGODB_SHARD_URIS for extra clusters (advanced / multi-region)

Until Atlas sharding is enabled, indexes + pool tuning reduce bottlenecks on a single replica set.
`);
