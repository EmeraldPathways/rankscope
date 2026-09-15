import { googleConnectorStatus } from "../../../../lib/google-integrations";

export async function GET() {
  return Response.json(googleConnectorStatus(), {
    headers: { "cache-control": "no-store" },
  });
}
