import { googleConnectorStatus } from "../../../../lib/google-integrations";

export async function GET(request: Request) {
  return Response.json(await googleConnectorStatus(request), {
    headers: { "cache-control": "no-store" },
  });
}
