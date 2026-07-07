import { z } from "zod";
import { handleApi, jsonOk, parseBody, readJson, requireApiBrand } from "@/lib/api/server";
import { getSourceWeights } from "@/lib/articles/performance";
import { createTopic, listTopics } from "@/lib/articles/repository";

const topicSchema = z.object({
  title: z.string().min(3).max(300),
  angle: z.string().max(500).optional(),
  keywords: z.string().max(500).optional(),
});

/** List the active brand's topic queue (ranked), plus C4's learned source weights. */
export async function GET() {
  return handleApi(async () => {
    const { brand } = await requireApiBrand();
    const [topics, sourceWeights] = await Promise.all([
      listTopics(brand.id),
      getSourceWeights(brand.id), // never throws — degrades to {} and logs
    ]);
    return jsonOk({ topics, sourceWeights });
  });
}

/** Add a manual topic. */
export async function POST(request: Request) {
  return handleApi(async () => {
    const { scope } = await requireApiBrand();
    const data = parseBody(topicSchema, await readJson(request));
    const topic = await createTopic(scope, data);
    return jsonOk({ topic }, { status: 201 });
  });
}
