import { z } from "zod";
import { handleApi, jsonOk, parseBody, readJson, requireApiBrand } from "@/lib/api/server";
import { createTopic, listTopics } from "@/lib/articles/repository";

const topicSchema = z.object({
  title: z.string().min(3).max(300),
  angle: z.string().max(500).optional(),
  keywords: z.string().max(500).optional(),
});

/** List the active brand's topic queue (ranked). */
export async function GET() {
  return handleApi(async () => {
    const { brand } = await requireApiBrand();
    const topics = await listTopics(brand.id);
    return jsonOk({ topics });
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
