import { llmsRoute } from "@cloudflare/nimbus-docs/agent-endpoints";
import { orderedLlms } from "@/lib/llms-order";

// Sections in sidebar order, with the sidebar's labels (src/lib/llms-order.ts).
export const { GET } = llmsRoute({ body: orderedLlms });
