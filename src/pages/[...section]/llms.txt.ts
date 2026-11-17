import { llmsSectionRoute } from "@cloudflare/nimbus-docs/agent-endpoints";
import { orderedSectionLlms } from "@/lib/llms-order";

// The sidebar's label as the heading, pages in sidebar order (src/lib/llms-order.ts).
export const { GET, getStaticPaths } = llmsSectionRoute({ body: orderedSectionLlms });
