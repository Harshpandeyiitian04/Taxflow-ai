// Neon cloud settings for auth, file storage, and database branches.
import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  auth: true,
  buckets: {
    documents: { access: "private" },
  },
  // Sets how long non-main database branches are kept alive.
  branch: (branch) => {
    if (branch.isDefault) {
      return {};
    }
    if (!branch.exists) {
      return { ttl: "7d" };
    }
    return {};
  },
});