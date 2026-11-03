import { LayerumClient } from "../src";

async function main() {
  const apiKey = process.env.LAYERUM_API_KEY;
  const baseUrl = process.env.LAYERUM_API_URL;
  if (!apiKey || !baseUrl) {
    throw new Error("Set LAYERUM_API_KEY and LAYERUM_API_URL");
  }

  const client = new LayerumClient({
    apiKey,
    baseUrl,
  });

  const models = await client.models.listConfigs();
  const entities = await client.entities.tree();
  const entity = entities[0];
  const model = models[0];
  if (!entity || !model) {
    throw new Error("Need at least one entity and one model config");
  }

  const source = await client.documents.createText({
    entityId: entity.id,
    displayName: "SDK Example",
    rawText: "Layerum SDK can upload documents and query indexed chunks.",
    modelConfigId: model.id,
  });

  await client.ingestion.waitUntilReady({
    entityId: entity.id,
    sourceId: source.id,
  });

  const answer = await client.query.run({
    entityId: entity.id,
    modelConfigId: model.id,
    query: "What does the document say?",
  });

  console.log(answer.answer);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
