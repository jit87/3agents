import { createWorkflow } from "@/lib/workflow";
import { handleCreateRequest } from "@/lib/request-handler";
import { sql } from "@/lib/db";

export async function POST(request: Request) {
  return handleCreateRequest(request, {
    countRecentRequests: async () => {
      const rows = await sql`SELECT COUNT(*)::int AS count FROM requests WHERE created_at >= NOW() - INTERVAL '24 hours'`;
      return Number(rows[0].count);
    },
    createWorkflow,
  });
}
