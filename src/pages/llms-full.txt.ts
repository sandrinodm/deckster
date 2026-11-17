import { llmsFullRoute } from "@cloudflare/nimbus-docs/agent-endpoints";
import { orderedLlmsFull } from "@/lib/llms-order";

// Pages in sidebar order (src/lib/llms-order.ts).
export const { GET } = llmsFullRoute({ body: orderedLlmsFull });
