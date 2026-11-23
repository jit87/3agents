import { sql } from "@/lib/db";

export async function GET() {
    const rows = await sql`select count(*)::int as total from requests`;
    return Response.json({ ok: true, requests: rows[0].total });
}